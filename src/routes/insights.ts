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

// AI cooking assistant: adapt a recipe to a goal (dairy-free, gluten-free, etc.).
router.post('/adapt', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipe, goal } = req.body || {}
    if (!recipe || typeof recipe !== 'object' || !goal || typeof goal !== 'string') {
      return res.status(400).json({ error: 'Missing recipe or goal' })
    }

    const prompt =
      `You are a practical home-cooking assistant. Adapt the recipe below so it is: ${goal}. ` +
      'Give the specific ingredient swaps (as "X → Y") and any step tweaks. Keep it short and ' +
      'practical -- a few lines, no preamble, no markdown headers, no numbering. If it already ' +
      'meets the goal, say so in one line.\n\n' +
      JSON.stringify({ name: recipe.name, ingredients: recipe.ingredients, instructions: recipe.instructions })

    const out = await callClaude(prompt, 400)
    if (out.ok) return res.json({ configured: true, text: out.text })
    if (!out.configured) return res.json({ configured: false, message: 'The AI cooking assistant turns on once an ANTHROPIC_API_KEY is set on the backend.' })
    return res.status(out.status || 502).json({ error: out.error })
  } catch (err) {
    next(err)
  }
})

// AI cook: suggest dishes the person could make from their pantry.
router.post('/cook', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pantry = req.body?.pantry
    if (!Array.isArray(pantry) || pantry.length === 0) return res.status(400).json({ error: 'Missing pantry items' })

    const prompt =
      'You are a resourceful home cook. Assume basic salt, pepper, oil and water are on hand. ' +
      'From only these ingredients, suggest 3-4 specific dishes the person could make right now. ' +
      'One line each: the dish name, then a short 4-8 word note. No preamble, no markdown, no ' +
      'numbering.\n\nIngredients: ' + pantry.join(', ')

    const out = await callClaude(prompt, 400)
    if (out.ok) return res.json({ configured: true, text: out.text })
    if (!out.configured) return res.json({ configured: false, message: 'The AI cook turns on once an ANTHROPIC_API_KEY is set on the backend.' })
    return res.status(out.status || 502).json({ error: out.error })
  } catch (err) {
    next(err)
  }
})

export default router
