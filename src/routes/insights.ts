import { Router, Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// A small, cheap model is plenty for a few sentences of coaching. Override with
// INSIGHTS_MODEL if you want a different one.
const MODEL = process.env.INSIGHTS_MODEL || 'claude-haiku-4-5-20251001'

/**
 * Natural-language insights over the week the client sends. This only works once
 * an ANTHROPIC_API_KEY is set on the backend -- until then it returns
 * `configured: false` (a 200, not an error) so the client can show a friendly
 * "turn this on" note rather than a failure.
 */
router.post('/ai', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) {
      return res.json({
        configured: false,
        message: 'AI insights turn on once an ANTHROPIC_API_KEY is set on the backend.',
      })
    }

    const summary = req.body?.summary
    if (!summary || typeof summary !== 'object') {
      return res.status(400).json({ error: 'Missing week summary' })
    }

    const prompt =
      'You are a warm, concise meal-planning coach. From the planned week below, ' +
      'give 3-4 short, specific, actionable insights -- one sentence each, no preamble, ' +
      'no markdown, no headers, no numbering. Focus on calorie/nutrition balance versus ' +
      'their goal, variety, and using what they already have. Be encouraging.\n\n' +
      JSON.stringify(summary)

    let r: globalThis.Response
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      return res.status(502).json({ error: 'Could not reach the AI model. Try again in a moment.' })
    }

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return res.status(502).json({ error: 'The AI model refused that request.', detail: detail.slice(0, 200) })
    }

    const data = (await r.json().catch(() => ({}))) as any
    const text = (data?.content?.[0]?.text || '').trim()
    if (!text) return res.status(502).json({ error: 'The AI model returned nothing.' })
    res.json({ configured: true, text })
  } catch (err) {
    next(err)
  }
})

export default router
