# Subscriptions, referrals and Control Centre

## Where each role goes

- Business owners open **Subscription** inside the Stockroom app to renew, copy an owner referral link, review referral rewards and request a payout.
- Visitor promoters use `/visitor` to register or sign in, share their personal referral link, see attributed businesses and manage their reward wallet.
- The developer uses `/developer` to manage businesses, referrals, payouts, Enterprise requests, subscription plans, reward rates and global subscription enforcement.

Configure `DEVELOPER_EMAIL` in Render to the email of the developer's Stockroom cloud owner account. The developer signs in to `/developer` with that account. Other owners are denied developer API access. `ADMIN_API_KEY` remains for device enrollment and is unrelated to subscriptions.

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

Automatic referral payouts are disabled by default. Keep `PAYSTACK_REFERRAL_AUTO_PAYOUTS=false` and `PAYSTACK_REFERRAL_WEBHOOK_READY=false` until Paystack transfers from balance are available and the transfer webhook is configured at `/v1/subscriptions/webhook`. Set both to `true` only with `PAYSTACK_SECRET_KEY` configured. Promoters then need to save a supported bank destination before automatic transfer can start. Transfers require sufficient Paystack balance and can require OTP approval. A rejected transfer is queued for manual payment; if Paystack's response is ambiguous, Stockroom holds the funds for review to avoid duplicate payment. XOF payouts remain manual.

Paystack receives full account details to create a transfer recipient. Stockroom stores the Paystack recipient code and the account's last four digits. Configure the payout flags only after confirming the account's transfer setup and webhook behavior.
