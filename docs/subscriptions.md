# Subscriptions, referrals and Control Centre

## Where each role goes

- Business owners open **Subscription** inside Stockroom. Its searchable task selector opens **Plan and renewal**, **Referral rewards**, or **Export or close business**. Owners can review access, choose a plan, manage renewal, copy an invitation, review/request referral payouts, and export or leave the business.
- Visitor promoters use `/visitor` to register or sign in, share their personal referral link, see attributed businesses and manage their reward wallet.
- The developer uses `/developer` to manage businesses, referrals, payouts, Enterprise requests, subscription plans, reward rates and global subscription enforcement.

Configure `DEVELOPER_EMAIL` in Render to the email of the developer's Stockroom cloud owner account. The developer signs in to `/developer` with that account. Other owners are denied developer API access. `ADMIN_API_KEY` remains for device enrollment and is unrelated to subscriptions. The developer sets the automatic registration-key lifetime (1–30 days) in Plan settings. New business signups generate a one-use key and email it to the address supplied; the email must match when creating the owner account. Public requests are rate-limited. Manual key issuance remains available in Businesses.

## Subscription configuration

Set these cloud environment variables in Render:

- `PAYSTACK_SECRET_KEY`: Paystack test key during setup, then the live secret key.
- `SUBSCRIPTION_PUBLIC_URL`: the public HTTPS origin of the Vercel app, such as `https://stockroom.globalcreest.com`.
- `DEVELOPER_EMAIL`: the developer owner's account email.
- `PWA_ALLOWED_ORIGINS`: the Vercel origin allowed to call the Render API.
- Existing Gmail API credentials for email notifications.

Stockroom can configure USD plan prices, but Paystack must first approve international payment acceptance for the merchant account. That approval is account-side; code and a USD payout setting cannot enable it. Until approval, keep plan checkout on an enabled currency. Paystack recurring plan objects are created on the server using `PAYSTACK_SECRET_KEY` when an owner first chooses automatic renewal; no plan-code environment variable is required.

Configure Paystack's webhook URL as `https://YOUR-CLOUD-HOST/v1/subscriptions/webhook`. In the PWA, Windows installer, and sideload APK, business owners can choose a one-time Paystack checkout or explicitly authorize an automatic Paystack subscription for monthly/yearly plans. Stockroom creates and caches Paystack plans by plan, currency, and amount; checkout attaches the Paystack plan to the initial transaction. Paystack collects future charges and sends subscription/invoice events to the same webhook. Stockroom verifies each recurring transaction with Paystack before extending access and crediting referral commissions. The subscription screen links to Paystack's hosted page to update payment details or cancel. Failed recurring payments do not extend access; Paystack does not guarantee another attempt, so owners can update their payment method or use one-time checkout. Enterprise proposals remain one-time payments. Existing active subscriptions keep the price agreed at signup; changing developer plan prices creates a new Paystack plan for new subscribers and does not silently reprice existing subscribers.

The Play Store AAB continues to use Google Play Billing for recurring subscriptions. Do not route Play Store users through Paystack checkout.

The developer sets free-trial duration, monthly grace in days, and yearly/Enterprise grace in calendar months in Control Centre plan settings. These values are not removed or overridden by choosing the Free plan. New businesses receive the configured free trial when their registration key is redeemed. Trial time starts then; subscription grace does not extend a free trial. A trial grants access until its configured expiry and has no extra grace in the current access policy. Paid subscriptions remain available through their configured grace period and become blocked only after that grace ends. Business-specific POS suspension is separate from global subscription enforcement and remains in force if global enforcement is turned off.

One business subscription covers its enabled selling workspaces. Payments & receipts is the subscription-free workspace. The first enabled selling workspace uses the base price; each additional enabled selling workspace adds the configured percentage (5% by default). Hotel operations and Nightlife operations are separate switches but count together as one Hospitality workspace entitlement. Inventory is a capability rather than a separately billed workspace. The developer controls the extra-workspace percentage in Control Centre > Plan settings > Extra workspace charge. When a workspace selection exceeds the entitlement, **Add to subscription** carries the pending workspace count and names to the Subscription screen; its quote uses that requested count. The checkout service validates the requested count, prices it at the configured percentage, and records that entitlement after payment is confirmed. The pending selection is not saved automatically: after payment, return to Business settings and select **Save workspaces**. The pending selection is retained across the checkout redirect. Google Play requires a matching configured product for each enabled workspace-count tier (2–5); a tier without a matching product cannot be purchased through Play.

When global developer enforcement is on, saving a workspace selection checks its count against the current entitlement. If it exceeds the entitlement, the dialog offers Cancel (top right), Return to Overview (bottom left), or Add to subscription (bottom right). The last action opens Subscription with the pending selection priced. Payment updates the purchased entitlement; the user then returns to Available workspaces and saves the selection. The workspace is not enabled until that save succeeds. When global enforcement is off, the save check is unrestricted and the dialog does not appear. A business-specific suspension remains separate and is not disabled by the global enforcement switch.

Choosing **Free plan** explicitly saves Payments & receipts as the only enabled workspace and turns off the selling workspaces. Existing records remain. It does not cancel or refund an existing paid renewal. Owners stop future renewal with **Manage or cancel subscription** in Stockroom; Android purchases are managed in the app-store subscription settings. Do not confuse selecting the free workspace with cancelling a paid renewal.

When paid access expires, Stockroom preserves the owner's saved workspace configuration and records, presents Payments & receipts as the available sales workspace, and blocks attempts to reopen paid workspaces until an eligible subscription is active. A previously active paid workspace is routed back to Payments & receipts when available. Service payment receipts remain available. Offline devices may keep a cached access decision until they reconnect and refresh.

Desktop, Android and PWA fetch the business-specific access decision from the cloud and cache it for offline use. Connected clients normally refresh within one minute. An offline client cannot learn about a new renewal or suspension until it reconnects. The Control Centre manages subscription and POS access, referral attribution, registration keys and payouts; it does not expose a business's sales or inventory records or let the developer sign in as its owner.

## Referrals and wallets

Control Centre stores separate first-payment and renewal reward percentages for business owners and visitor promoters (0–100%, up to two decimal places). A referred business earns at most four commissions, one per verified subscription payment. Attribution is bound when a registration key is redeemed to create a business. Self-referrals and later reassignment are rejected. Referral links are direct referrals, not a multi-level scheme.

Referral attribution is locked when the first checkout starts, even if that checkout is abandoned. The first successfully verified payment uses the first-payment rate; later payments use the renewal rate. Rates are saved with the checkout, and commission uses the original payment currency. A single atomic subscription update prevents duplicate commission credits on concurrent webhook/callback retries.

Owner and visitor wallets show registered businesses, earned, paid, pending and available totals by currency, plus reward and payout history. Payout requests appear in Control Centre. For manual payment, the developer records the payment and its reference. Reconcile any referral amounts already paid outside Stockroom before treating wallet balances as payable.

## Paystack referral transfers

Automatic referral payouts are enabled by default and can be switched on or off in Developer Control Centre → Plan settings. The switch is stored in Stockroom's database; there are no separate Render readiness flags. Automatic transfers use the existing `PAYSTACK_SECRET_KEY` and the current `/v1/subscriptions/webhook`, which handles subscription and transfer events. Promoters must save a supported bank destination and submit a withdrawal request before Stockroom starts a transfer. Transfers require sufficient Paystack balance. Paystack failures fall back to a manual request; ambiguous results stay held for review to avoid duplicate payment. XOF payouts remain manual.

Stockroom exposes a server-side transfer approval endpoint at `/v1/paystack/transfer-approval`. Copy its full HTTPS URL from Developer Control Centre → Plan settings into Paystack Dashboard → Settings → Preferences → Transfer Approval. The endpoint approves only a recent Stockroom payout in `initiating` state when the transfer reference and amount match; currency, source and recipient are checked when provided. It responds quickly and rejects unknown or mismatched requests. Paystack requires OTP and URL approval separately, so disable OTP confirmation in Paystack Preferences if transfers should proceed without a person entering each OTP. Keep URL approval enabled as the server-side check. Test with a small payout before relying on unattended live transfers.

Paystack receives full account details to create a transfer recipient. Stockroom stores the Paystack recipient code and the account's last four digits. Do not put the Paystack secret key in the app or browser; store it only in Render as `PAYSTACK_SECRET_KEY`.

You do not create payout codes manually. When a promoter saves their bank destination, Paystack creates and returns the recipient code (usually `RCP_...`), which Stockroom stores. When Stockroom starts a withdrawal transfer, Paystack returns its transfer code (`TRF_...`); Stockroom saves that for status tracking or OTP finalization.
