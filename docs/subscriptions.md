# Manual subscriptions

Subscriptions live inside the Vercel Business App. Owners open **Subscription** from the app navigation to view their status and renew with Paystack. There is no separate Render subscription website or second sign-in screen.

Set `DEVELOPER_EMAIL` in Render to your developer owner-account email. When you sign in to the app using that same email, the Subscription screen also shows plan setup and the **Turn enforcement on/off** button. Other owners never see those controls. `ADMIN_API_KEY` remains the private installer/handover key for enrolling client devices; it is not used for subscriptions.

Set these server environment variables in Render:

- `PAYSTACK_SECRET_KEY`: your Paystack test key first, then your live secret key.
- `SUBSCRIPTION_PUBLIC_URL`: the public HTTPS origin of the Vercel Business App, for example `https://stockroom.globalcreest.com`.
- `DEVELOPER_EMAIL`: the email address of your developer owner account.
- `PWA_ALLOWED_ORIGINS`: the same Vercel origin, so the deployed app may call the Render API.
- Existing `SMTP_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`: reused for Gmail OAuth email delivery.

In Paystack, set the webhook URL to `https://YOUR-CLOUD-HOST/v1/subscriptions/webhook`. Checkout returns to the in-app Subscription screen on Vercel. No Paystack recurring plan or reusable authorization is created or charged by the app. Each renewal starts a separate checkout. Only verified successful payments matching the stored reference, owner email, currency, and amount extend the expiry. Repeated notifications do not extend it twice. Early renewals add days to the current expiry; expired subscriptions restart from payment processing time.

The cloud service checks hourly and on startup for subscriptions expiring within the configured reminder window. It sends one reminder per expiry date and retries failed sends. Use an always-running service for timely reminders; a sleeping Render instance cannot run the hourly job. A crash after email delivery but before recording success may cause a duplicate reminder. Plan changes affect new checkouts, including existing owners' next renewal.

POS remains available for one calendar month after expiry, measured in UTC and clamped to the last day of shorter months. For example, expiry on January 31 at noon permits POS until February 28 at noon (February 29 in leap years). At the deadline, POS and new sale requests are blocked. Renewal restores access. Inventory, reports, sign-in and the renewal portal remain available.

**Subscription enforcement starts OFF** on first deployment of this feature. In the in-app developer-only Subscription section, save a plan and use **Turn enforcement on** when ready. The same button turns enforcement off again and immediately lifts all blocks. This mode affects access only; Paystack still uses whichever test/live secret you configured. When enforcement is on, businesses with no paid subscription are blocked immediately; they have no expiry from which to calculate grace.

Desktop, Android and PWA fetch business-scoped access from the cloud and cache it for offline use. Online devices normally pick up mode changes or renewals within one minute. Offline devices evaluate the cached expiry locally, so grace still ends without internet. An offline device cannot learn about a new renewal or developer-mode change until it reconnects; a cached test-mode bypass persists until then. A first-time device must connect once to obtain access. Local caches are not a tamper-proof licensing system against users modifying their own app/storage or clock. Deploy the cloud service before distributing updated clients. Previously queued sales are retained when blocked and can retry after renewal or test-mode activation.

## Referrals

Set **First payment referral commission (%)** and **Recurring payment referral commission (%)** in developer setup (0–100, up to two decimal places). An existing business owner copies an invitation from the in-app Subscription screen. A new business opens that link before creating its account; the app retains the code and applies it automatically once setup creates the owner account. Self-referrals and later reassignment are rejected. These are two rates for one direct referrer, not a multi-level referral scheme.

Referral attribution is locked when the first checkout starts, including if that checkout is abandoned. The first successfully verified payment earns the first-payment rate; subsequent verified payments earn the recurring rate. Rates are saved with each checkout, so later settings edits do not change pending payments. Commission is based on the paid subscription amount in its original currency, rounded down to a minor unit. A single atomic subscription update decides the first payment and records its credit, preventing duplicate credits on concurrent callback/webhook retries. Credits are recorded in `referral_commissions`, keyed by payment reference; owners see their most recent 100 credits. Payouts and any refund/chargeback adjustments require manual reconciliation; there is no automatic transfer or wallet credit.

Before production, complete a test checkout, confirm callback and webhook produce only one extension, verify a second renewal extends the current period, and verify Gmail reminder delivery with a short-duration test plan. Automated unit tests cover price validation, webhook signatures, and payment matching; provider delivery requires configured credentials.
