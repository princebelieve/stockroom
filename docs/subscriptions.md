# Subscriptions, referrals and Control Centre

## Where each role goes

- Business owners open **Subscription** inside the Stockroom app to renew, copy an owner referral link, review referral rewards and request a payout.
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

Configure Paystack's webhook URL as `https://YOUR-CLOUD-HOST/v1/subscriptions/webhook`. Each renewal uses a new checkout; the app does not create recurring charges. Only verified successful payments matching the stored reference, owner email, currency and amount extend the subscription. Repeated notifications do not extend twice. Early renewals add time to the current expiry.

The developer sets monthly grace in days and yearly/Enterprise grace in calendar months in Control Centre plan settings. Subscription enforcement starts off for a first rollout. New businesses receive the configured free trial when their registration key is redeemed. Trial time starts then; subscription grace does not extend a free trial. Business-specific POS suspension is separate from global subscription enforcement and remains in force if global enforcement is turned off.

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
