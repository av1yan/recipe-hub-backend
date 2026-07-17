// Outbound email, via Resend's REST API.
//
// Called through fetch rather than the SDK: it is one endpoint, and a
// dependency for one POST is not worth the weight.

import { ApiError } from '../middleware/errorHandler.js'

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/**
 * Resend's shared sending address. It works with no domain setup at all, but
 * only delivers to the address that owns the Resend account -- fine for trying
 * this out, useless for real users. See docs/email-setup.md.
 */
const DEFAULT_FROM = 'recipHub <onboarding@resend.dev>'

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Reaching here means a reset was requested with no key configured. Say so
    // plainly rather than reporting success for an email that never left.
    throw new ApiError(503, 'Email is not set up on this server yet, so reset links cannot be sent.')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || DEFAULT_FROM, to, subject, html, text }),
    signal: AbortSignal.timeout(12_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // The reason belongs in the log, not in the reply -- a stranger asking for a
    // reset should not learn how this server is wired.
    console.error('Resend rejected the email:', res.status, detail.slice(0, 300))
    throw new ApiError(502, 'Could not send the email just now. Try again in a moment.')
  }
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string,
  ttlMinutes: number
): Promise<void> {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b">
  <p style="font-size:22px;font-weight:700;margin:0 0 20px">🍳 recipHub</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 8px">${greeting}</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">
    Someone asked to reset the password for this account. If that was you, pick a new one:
  </p>
  <p style="margin:0 0 20px">
    <a href="${resetUrl}" style="display:inline-block;background:#6ba356;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:700">
      Choose a new password
    </a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#64748b;margin:0 0 6px">
    The link works once and expires in ${ttlMinutes} minutes.
  </p>
  <p style="font-size:13px;line-height:1.6;color:#64748b;margin:0">
    If this wasn't you, ignore this email — nothing has changed.
  </p>
</div>`.trim()

  const text = [
    greeting,
    '',
    'Someone asked to reset the password for this recipHub account.',
    'If that was you, pick a new one here:',
    resetUrl,
    '',
    `The link works once and expires in ${ttlMinutes} minutes.`,
    "If this wasn't you, ignore this email — nothing has changed.",
  ].join('\n')

  await send(to, 'Reset your recipHub password', html, text)
}
