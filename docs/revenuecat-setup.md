# Subscription IAP setup (RevenueCat + App Store)

The code for a **monthly Pro subscription** is already wired end-to-end. What's
left is external configuration — the parts only the account owner can do. Once
the four keys below are set, it works; until then the app degrades gracefully to
"Subscriptions aren't available yet."

Entitlement is **server-authoritative**: the app runs Apple's purchase sheet via
RevenueCat, and our backend re-verifies the subscription against RevenueCat's API
(`POST /api/subscription/refresh`) before granting Pro. A forged client can't
unlock Pro.

Standard product id used throughout: **`com.reciphub.app.pro.monthly`**.

---

## 1. App Store Connect

1. Enroll in the Apple Developer Program ($99/yr) if you haven't.
2. Sign the **Paid Applications Agreement** and fill in banking + tax
   (Business → Agreements). IAP won't work until this is "Active".
3. App → **Subscriptions** → create a group named `recipHub Pro`.
4. Add an auto-renewable subscription:
   - **Product ID:** `com.reciphub.app.pro.monthly`
   - **Reference name:** Pro Monthly
   - **Duration:** 1 month
   - **Price:** your choice (the app shows whatever StoreKit reports).
   - (Optional) add an **Introductory Offer** → free trial, e.g. 3 days. This is
     how the App Store does trials; the old client-side trial is web-only now.
5. Add the localized display name / description and a review screenshot.

## 2. RevenueCat (free under ~$2.5k/mo)

1. Create a project. Add an **App Store** app with bundle id `com.reciphub.app`.
2. Give RevenueCat your **App Store Connect App-Specific Shared Secret** (or an
   In-App Purchase key) so it can validate receipts.
3. **Products** → add `com.reciphub.app.pro.monthly`.
4. **Entitlements** → create one with identifier **`pro`** and attach the product.
   (The id `pro` must match — it's hard-coded in `subscriptionService.ts` and
   `src/utils/purchases.ts`.)
5. **Offerings** → in the `default` (current) offering, add a **Monthly** package
   pointing at the product.
6. Copy two keys from **API keys**:
   - the **Apple public SDK key** (`appl_…`)
   - a **secret key** (`sk_…`)

## 3. Keys / environment

| Where | Variable | Value |
|-------|----------|-------|
| Frontend build (`.env` / Vercel) | `VITE_REVENUECAT_IOS_KEY` | `appl_…` |
| Backend (Railway) | `REVENUECAT_SECRET_KEY` | `sk_…` |
| Backend (Railway) | `REVENUECAT_WEBHOOK_SECRET` | any long random string you choose |

`VITE_REVENUECAT_IOS_KEY` is baked in at build time — rebuild the app (`npm run
cap:sync`) after setting it. Check it's live with `GET /api/subscription/status`
→ `{ "configured": true }`.

## 4. RevenueCat webhook (keeps Pro current for renewals/cancellations)

RevenueCat → **Integrations → Webhooks**:

- **URL:** `https://recipe-hub-backend-production.up.railway.app/api/subscription/webhook`
- **Authorization header:** `Bearer <the REVENUECAT_WEBHOOK_SECRET you set>`

## 5. Xcode

- Signing & Capabilities → add **In-App Purchase** (StoreKit needs no entitlement
  file, but the capability should be present).
- **Local testing without App Store Connect:** Product → Scheme → Edit Scheme →
  Run → Options → **StoreKit Configuration** → `RecipHub.storekit`. The purchase
  sheet then runs against that fake product on the simulator.

## 6. Demo account

After deploying, hit `POST /api/init-db` once — it grants `demo@example.com` a
**complimentary** Pro (`proSource: "complimentary"`) so the demo stays Pro on
native without a real subscription. Complimentary grants are never revoked by a
RevenueCat check.
