# Turning on password reset emails

The reset flow is built and tested. It cannot send anything until a Resend API
key exists, so until then `/api/auth/password-reset/available` reports `false`
and the app hides the "Forgot password?" link rather than offering one that
fails.

## Get a key (free, ~5 minutes)

1. <https://resend.com> → sign up. The free tier is 3,000 emails/month.
2. **API Keys → Create API Key**, permission "Sending access". Copy it — it is
   shown once.
3. In Railway → Variables:

   | Variable | Value |
   | --- | --- |
   | `RESEND_API_KEY` | `re_…` |
   | `FRONTEND_URL` | `https://recipe-hub-orcin-ten.vercel.app` |

`FRONTEND_URL` is what the link in the email points at. It must already be set
if you configured OAuth.

That is enough to start. Deploy, and the link appears.

## Sending from your own address

Unset, `RESEND_FROM` uses Resend's shared `onboarding@resend.dev`, which needs
no setup but **only delivers to the address that owns the Resend account**.
That is fine for trying it; it will not reach anyone else.

For real users, verify a domain in Resend (**Domains → Add Domain**, then the
DNS records it asks for) and set:

| Variable | Value |
| --- | --- |
| `RESEND_FROM` | `recipHub <no-reply@yourdomain.com>` |

## How it behaves

- **Tokens are stored hashed** (SHA-256). The table is not a list of live keys —
  someone reading it cannot reset anyone's password.
- **One hour, one use.** Using a link also voids every other outstanding link
  for that account, so an older email in the inbox is dead.
- **Asking for a reset never says whether an account exists.** An unknown
  address gets the same reply as a known one, so this cannot be used to find out
  who has signed up.
- **Failures are vague on purpose.** A stranger gets "Could not send the email
  just now"; the real reason (a bad key, a Resend outage) goes to the server log.
- **OAuth accounts can use it too.** They have no password, so a reset simply
  gives them one — after which they can use either.

## What has and hasn't been tested

Verified against a real database: hashed storage, single use, expiry, made-up
tokens refused, other links voided on use, the 8-character minimum, unknown
addresses staying quiet, and the full browser flow from link to changed
password to signing in with it.

Verified against Resend's live API with a deliberately invalid key: it returns
401, and the app reports the vague message while logging the real one.

**Not tested: an email actually arriving.** That needs a real key.
