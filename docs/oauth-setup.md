# Turning on Google / Apple sign-in

The code is written and deployed, but **no live sign-in has ever run through it** —
that needs credentials only you can create. Until the env vars below are set,
`/api/auth/oauth/providers` reports `false` and the app hides the buttons rather
than showing ones that cannot work. Fill these in and they appear.

Set everything on the **backend** (Railway → Variables).

## Shared

| Variable | Value |
| --- | --- |
| `PUBLIC_API_URL` | `https://recipe-hub-backend-production.up.railway.app` |
| `FRONTEND_URL` | `https://recipe-hub-orcin-ten.vercel.app` |

`PUBLIC_API_URL` builds the redirect URI, and `FRONTEND_URL` is where the
callback sends the browser afterwards. Both must be exact — no trailing slash,
and the scheme matters.

## Google — free, ~5 minutes

1. <https://console.cloud.google.com/> → create a project.
2. **APIs & Services → OAuth consent screen** → External. Fill in the app name
   and support email. While it is in "Testing", only accounts you list under
   **Test users** can sign in; hit **Publish** to open it up.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorised redirect URIs** add exactly:

   ```
   https://recipe-hub-backend-production.up.railway.app/api/auth/oauth/google/callback
   ```

5. Copy the client ID and secret into Railway:

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com` |
   | `GOOGLE_CLIENT_SECRET` | `GOCSPX-…` |

A mismatched redirect URI is the usual failure, and Google names it plainly
(`redirect_uri_mismatch`).

## Apple — needs the Apple Developer Program ($99/year)

1. <https://developer.apple.com/account> → **Identifiers**.
2. Create an **App ID**, and enable **Sign In with Apple** on it.
3. Create a **Services ID** (e.g. `com.reciphub.web`) — this is the `client_id`.
   Enable Sign In with Apple on it and **Configure**:
   - Domain: `recipe-hub-backend-production.up.railway.app`
   - Return URL: `https://recipe-hub-backend-production.up.railway.app/api/auth/oauth/apple/callback`
4. **Keys → +** → enable Sign In with Apple → download the `.p8`. **You get one
   download, ever.**
5. Into Railway:

   | Variable | Value |
   | --- | --- |
   | `APPLE_SERVICES_ID` | `com.reciphub.web` |
   | `APPLE_TEAM_ID` | 10 chars, top-right of the developer portal |
   | `APPLE_KEY_ID` | 10 chars, from the key you made |
   | `APPLE_PRIVATE_KEY` | the whole `.p8`, `-----BEGIN PRIVATE KEY-----` and all |

For `APPLE_PRIVATE_KEY`, paste it with real newlines or with `\n` escapes —
both are handled.

## Notes

- **Apple sends a name exactly once**, on the very first authorization. Miss it
  and there is no second chance, so the account falls back to the email's local
  part as a display name.
- **Apple private-relay emails** (`…@privaterelay.appleid.com`) are normal and
  are stored as-is.
- **Accounts link on verified email.** Signing in with Google using the address
  of an existing password account attaches to that account instead of making a
  second one. This only happens when the provider marks the address verified —
  otherwise it is refused, since an unverified address would be a way to take
  over someone else's account.
- **OAuth accounts have no password**, so `passwordHash` is nullable. Trying to
  password-login to one returns "This account signs in with Google/Apple".

## Local testing

Point `PUBLIC_API_URL` at `http://localhost:5001` and `FRONTEND_URL` at
`http://localhost:5174`, and register the matching localhost callback in the
provider console. Google permits `http://localhost` redirect URIs; **Apple does
not** — it demands a public HTTPS domain, so Apple cannot be tested locally.
