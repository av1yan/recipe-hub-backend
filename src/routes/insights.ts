import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// A small, cheap model is plenty. Override with INSIGHTS_MODEL.
const MODEL = process.env.INSIGHTS_MODEL || 'claude-haiku-4-5-20251001'

/**
 * Calls Claude with a prompt. Returns { ok:false, configured:false } when no key
 * is set so the caller can show a friendly "turn this on" note rather than an
 * error, or { ok:false } with a status for a real failure.
 */
async function callClaude(prompt: string, maxTokens = 500):
  Promise<{ ok: true; text: string } | { ok: false; configured: boolean; status?: number; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, configured: false }

  let r: globalThis.Response
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return { ok: false, configured: true, status: 502, error: 'Could not reach the AI model. Try again in a moment.' }
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    return { ok: false, configured: true, status: 502, error: 'The AI model refused that request.' + (detail ? ' ' + detail.slice(0, 160) : '') }
  }
  const data = (await r.json().catch(() => ({}))) as any
  const text = (data?.content?.[0]?.text || '').trim()
  if (!text) return { ok: false, configured: true, status: 502, error: 'The AI model returned nothing.' }
  return { ok: true, text }
}

// Natural-language insights over the week the client sends.
router.post('/ai', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = req.body?.summary
    if (!summary || typeof summary !== 'object') return res.status(400).json({ error: 'Missing week summary' })

    const prompt =
      'You are a warm, concise meal-planning coach. From the planned week below, ' +
      'give 3-4 short, specific, actionable insights -- one sentence each, no preamble, ' +
      'no markdown, no headers, no numbering. Focus on calorie/nutrition balance versus ' +
      'their goal, variety, and using what they already have. Be encouraging.\n\n' +
      JSON.stringify(summary)

    const out = await callClaude(prompt)
    if (out.ok) return res.json({ configured: true, text: out.text })
    if (!out.configured) return res.json({ configured: false, message: 'AI insights turn on once an ANTHROPIC_API_KEY is set on the backend.' })
    return res.status(out.status || 502).json({ error: out.error })
  } catch (err) {
    next(err)
  }
})

// Pull a readable summary and a full adapted recipe out of the model's JSON.
// Falls back to plain text (no structured recipe to save) if it isn't valid JSON.
function parseAdapted(text: string): {
  summary: string
  adapted: { name: string; ingredients: string[]; instructions: string[] } | null
  changed: boolean
} {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  try {
    const obj: any = JSON.parse(t)
    const name = typeof obj?.name === 'string' ? obj.name.trim() : ''
    const ingredients = Array.isArray(obj?.ingredients) ? obj.ingredients.map((x: any) => String(x).trim()).filter(Boolean) : []
    const instructions = Array.isArray(obj?.instructions) ? obj.instructions.map((x: any) => String(x).trim()).filter(Boolean) : []
    const summary = typeof obj?.summary === 'string' ? obj.summary.trim() : ''
    // Default to true when the flag is missing, so a real adaptation is never
    // wrongly treated as a no-op and stripped of its Save action.
    const changed = typeof obj?.changed === 'boolean' ? obj.changed : true
    if (name && (ingredients.length || instructions.length)) {
      return { summary: summary || name, adapted: { name, ingredients, instructions }, changed }
    }
    if (summary) return { summary, adapted: null, changed }
  } catch { /* not JSON — fall through to plain text */ }
  return { summary: text.trim(), adapted: null, changed: true }
}

// AI cooking assistant: adapt a recipe to a goal (dairy-free, gluten-free, etc.),
// returning a readable summary plus a full adapted recipe the client can save.
router.post('/adapt', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipe, goal } = req.body || {}
    if (!recipe || typeof recipe !== 'object' || !goal || typeof goal !== 'string') {
      return res.status(400).json({ error: 'Missing recipe or goal' })
    }

    const prompt =
      `You are a practical home-cooking assistant. Adapt the recipe below so it is: ${goal}. ` +
      'Respond with ONLY a JSON object (no markdown fences, no text outside it) with keys: ' +
      '"summary" (2-4 short plain-text lines naming the key swaps as "X -> Y" and any step tweaks, ' +
      'lines separated by \\n), "name" (the adapted dish name), "ingredients" (array of strings, the ' +
      'full adapted ingredient list with amounts), "instructions" (array of strings, the adapted ' +
      'steps in order), and "changed" (boolean: true if you actually modified the recipe to meet the ' +
      'goal, false if it already met the goal and needs no changes). If it already meets the goal, ' +
      'set "changed" to false, keep the recipe as-is, and say so in the summary.\n\n' +
      JSON.stringify({ name: recipe.name, ingredients: recipe.ingredients, instructions: recipe.instructions })

    const out = await callClaude(prompt, 1200)
    if (out.ok) {
      const { summary, adapted, changed } = parseAdapted(out.text)
      return res.json({ configured: true, text: summary, adapted, changed })
    }
    if (!out.configured) return res.json({ configured: false, message: 'The AI cooking assistant turns on once an ANTHROPIC_API_KEY is set on the backend.' })
    return res.status(out.status || 502).json({ error: out.error })
  } catch (err) {
    next(err)
  }
})

// Turn the model's "Dish name :: how to make it" lines into structured tiles.
// Tolerant of stray numbering/bullets and a couple of alternative separators.
function parseCookDishes(text: string): { name: string; steps: string }[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, ''))
    .map(l => {
      let sep = l.indexOf('::')
      let width = 2
      if (sep === -1) { sep = l.indexOf(' — '); width = 3 }
      if (sep === -1) { sep = l.indexOf(' - '); width = 3 }
      if (sep === -1) return { name: l, steps: '' }
      return { name: l.slice(0, sep).trim(), steps: l.slice(sep + width).trim() }
    })
    .filter(d => d.name)
}

// AI cook: suggest dishes the person could make from their pantry, each with a
// short how-to, returned as tiles.
router.post('/cook', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pantry = req.body?.pantry
    if (!Array.isArray(pantry) || pantry.length === 0) return res.status(400).json({ error: 'Missing pantry items' })

    const prompt =
      'You are a resourceful home cook. Assume basic salt, pepper, oil and water are on hand. ' +
      'From only these ingredients, suggest 3-4 specific dishes the person could make right now. ' +
      'Put each dish on its own line in exactly this form: "Dish name :: a short instruction of ' +
      'one or two sentences on how to make it". No preamble, no numbering, no markdown.\n\n' +
      'Ingredients: ' + pantry.join(', ')

    const out = await callClaude(prompt, 700)
    if (out.ok) {
      const dishes = parseCookDishes(out.text)
      // `text` stays a clean joined string so any older client still renders.
      const text = dishes.map(d => (d.steps ? `${d.name} — ${d.steps}` : d.name)).join('\n')
      return res.json({ configured: true, dishes, text })
    }
    if (!out.configured) return res.json({ configured: false, message: 'The AI cook turns on once an ANTHROPIC_API_KEY is set on the backend.' })
    return res.status(out.status || 502).json({ error: out.error })
  } catch (err) {
    next(err)
  }
})

export default router
