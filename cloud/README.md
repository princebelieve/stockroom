# Cloud sync service deployment

The live cloud sync API is the manually configured Render **Web Service** named `stockroom` (the service shown in the Render dashboard). This project does not use a Render Blueprint to manage that service. Deploy code through the existing service's configured Git repository and deployment settings; do not create or deploy a new service from the repository's root `render.yaml`. That YAML is a reference only and is not the source of the live service configuration.

Set these Render environment variables:

- `MONGODB_URI`: MongoDB Atlas connection string. Only Render receives this value.
- `JWT_SECRET`: a long random secret configured in the existing Render service's Environment settings.
- `ADMIN_API_KEY`: a long random secret used only by you to enroll a device.
- `MONGODB_DATABASE`: optional; defaults to `stockroom_sync`.
- `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`: optional Gmail API OAuth 2.0 credentials for Stockroom account, support, receipt and hospitality guest email.
- `BUSINESS_INTEGRATIONS_ENCRYPTION_KEY`: base64-encoded 32-byte application encryption key for business-owned integration credentials, including Channex and Paystack. Generate once with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`; keep it private and back it up securely. `PAYSTACK_CREDENTIALS_ENCRYPTION_KEY` remains a compatibility fallback.
- `CHANNEX_API_KEY`, optional `CHANNEX_API_BASE_URL`, optional `CHANNEX_WEBHOOK_SECRET`, and optional `CHANNEX_ACCOUNT_EMAIL`: Stockroom-managed Channex integration identity. The API URL must match the key's environment: `https://staging.channex.io/api/v1` for a Channex staging key, or `https://app.channex.io/api/v1` for production (the default). Keep staging credentials and test data on a separate staging deployment/database; do not switch a live Stockroom service from its production key to a staging key. The key must be allowed to create properties, room types and rate plans. In managed mode Stockroom creates one Channex property per Stockroom hotel branch and provisions/maps active room types. Each property's channels are connected by the hotel's authorized staff through the property-scoped Channex setup. The shared account's property list is not exposed to tenants. Hotel owners do not submit a Channex certification or property certificate to Stockroom. Channex's PMS certification is for Stockroom as the integration provider before production PMS connectivity; see Channex's [PMS certification checklist](https://docs.channex.io/api-v.1-documentation/pms-certification-tests).

After deployment, verify `https://YOUR-RENDER-URL/health` returns `{"ok":true}`.

To enable prompt Channex booking notifications, generate a webhook secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, save it as `CHANNEX_WEBHOOK_SECRET` in the matching Render environment, and configure the Channex webhook callback and header described below. Do not send the secret in chat or put it in source control. Keep a separate value for staging and production.

## Owner accounts and device management

Normal onboarding requests and redeems a one-use registration key through the app; see [registration](../docs/LANDING-AND-REGISTRATION.md). The `/v1/auth/register` example below is only the legacy installer route and requires an already enrolled device token for the same business. It cannot bypass registration keys. Store returned `accessToken` values securely; they are eight-hour account-management tokens, not device tokens.

```powershell
$body = @{ businessId = 'client-001'; ownerName = 'Client Owner'; email = 'owner@client.com'; password = 'Use-a-long-unique-password' } | ConvertTo-Json
$headers = @{ Authorization = 'Bearer ENROLLED_DEVICE_TOKEN' }
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/auth/register' -Headers $headers -ContentType 'application/json' -Body $body
```

Owners sign in with their email and password through `POST /v1/auth/login`. Staff sign in with their username and password; staff email addresses are contact-only and cannot authenticate. Staff usernames are unique within a business, so use the business-specific sign-in URL shown in Staff & access when signing in on a new browser. The URL passes the business ID as a tenant selector; the username and password still authenticate the staff account. An authenticated staff account can enroll its own browser, so the owner does not need to enroll each staff browser. Existing staff receive a username derived from their email prefix the next time the owner opens Staff & access. Owners use their returned `accessToken` to enroll, list, or revoke devices. Enroll a device:

```powershell
$headers = @{ Authorization = 'Bearer OWNER_ACCESS_TOKEN'; 'Content-Type' = 'application/json' }
$body = @{ deviceId = 'client-001-pc-01'; label = 'Main checkout computer' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/devices/enroll' -Headers $headers -Body $body
```

List devices with `GET /v1/devices`; revoke one with `POST /v1/devices/DEVICE_ID/revoke`. A revoked device can no longer push or pull data.

Email password recovery uses `POST /v1/auth/password-reset/request` and `POST /v1/auth/password-reset/confirm`, and is available only to the business owner. Staff emails cannot reset an account. Resetting an owner password invalidates that owner's refresh sessions while preserving enrolled device IDs and device credentials, so it does not disconnect every installation or remove local business data. Revoke a specific device separately if it is lost or compromised. Staff sign in with their username; owners can see usernames in Staff & access and reset either an admin or cashier password through `PUT /v1/staff/:id/password`. This action cannot target owners and revokes the staff account's refresh tokens.

### Gmail OAuth mail setup

The existing sender also handles in-app support requests from enrolled devices. Requests are saved in the `support_requests` collection with a business-scoped reference, Gmail message/thread IDs and send status. Successful retries reuse the saved reference without sending again; a timeout after Gmail accepts a message can still cause a repeated email on retry, with the same reference. Five new requests per business per hour are allowed. No Gmail inbox-reading permission is used.

`SUPPORT_EMAIL` optionally changes the request destination (default `support@sbi.globalcreest.com`). `SUPPORT_REPLY_TO` optionally changes the Reply-To for ordinary platform emails (same default). A support request uses the submitter's validated contact email as Reply-To, so support can reply from its normal mailbox. These are cloud environment settings. Ensure the destination mailbox receives mail; the sender remains the configured `GMAIL_USER`, not an unconfigured alias. Users find the form under How to use the app; drafts stay on their device while offline and are sent explicitly when connected.

Business-specific Paystack credentials and hospitality guest-email preferences are managed by the business owner in Stockroom under **Business settings → Paystack and guest email**. Merchant keys are validated and encrypted in MongoDB with `BUSINESS_INTEGRATIONS_ENCRYPTION_KEY` (or the legacy Paystack key); they are not placed in Render settings. Customer product-order payments use hosted Paystack checkout after staff accept an order; server verification creates the sale record, and signed-in customer wallet top-ups create an idempotent wallet ledger entry. Eligible hospitality invoices continue to use the hospitality checkout flow. Each business owner should set the webhook URL in that business's Paystack Dashboard to `https://<cloud-api-host>/v1/customer-portal/hospitality/paystack-webhook`; the endpoint routes by transaction reference and checks the signature against that business's connected secret. The same webhook URL supports product, wallet and hospitality invoice payments. Hosted checkout is shown for Paystack-supported business currencies (NGN, USD, GHS, ZAR, KES and XOF), subject to each merchant account's country and currency activation. The server enforces Paystack's published minimums and requires whole-franc XOF amounts. Channex supports business-owned and Stockroom-managed connection modes. In managed mode, Stockroom's centrally configured Channex key creates one property per Stockroom hotel branch and provisions/maps active room types and standard rates, and supports multiple mapped rate plans per room type. Staff connect the hotel's OTA accounts in Channex; OTA passwords are not entered in Stockroom. The property mapping is scoped to one Stockroom business/branch, and the shared account's property list is never exposed. Booking revisions use the Channex revision feed as a recovery path and can be pulled immediately from a secret-authenticated webhook notification; revisions are saved before acknowledgment, and unresolved revisions remain available for retry. To enable notifications, set a unique random `CHANNEX_WEBHOOK_SECRET` (at least 32 characters) in Render, then create a Channex webhook for event `booking` with `send_data=true`, callback `https://<cloud-api-host>/v1/webhooks/channex`, and header `X-Stockroom-Channex-Secret: <same secret>`. Use a global webhook for the Stockroom-managed Channex account or a property webhook for a business-owned account. The endpoint validates the secret in constant time and pulls the revision by ID; 30-second feed polling remains as recovery. Room, stay, held-room-block, customer-portal booking and changed iCalendar availability updates are queued by room type and date, batched by the worker, and retried with backoff. A 500-day full availability/rate/restriction sync runs on first connection and at most daily; mapped room-type rate/restriction conflicts close inventory and show a warning. Stockroom provisions a standard rate plan per room type, accepts additional mapped Channex rate plans, and automatically provisions new or renamed room types before channel updates sync. Each mapped plan receives the Stockroom room type price and restrictions. It does not import Channex card details. Channex PMS certification applies to Stockroom's connector before production partner connectivity; it is not a certificate required from each hotel property owner. Hospitality messages use the existing Gmail API sender configured above. `POS_PAYSTACK_CONFIG_JSON` remains a temporary migration fallback for businesses already configured before owner-managed connections were added. Remove that legacy setting after the affected businesses reconnect and confirm their payment setup.

Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen, create a **Web application** OAuth client, and obtain a refresh token for the Gmail account that will send Stockroom messages. The token must include Gmail send permission (the existing `https://mail.google.com/` scope also works). Store only the resulting values in Render environment variables—never in the desktop app, `sync-config.json`, Git, or MongoDB. The service sends through the Gmail API over HTTPS using OAuth 2.0. It does not require a Gmail password or app password.

At startup, the service logs the Gmail API transport and whether each required environment variable is present or missing. It never logs OAuth credential values, the recipient address, or reset codes. Password-reset attempts log whether Gmail accepted the send request, failed, or were skipped because no eligible owner account matched. Render's `Rndr-Id` is included when available to help locate the corresponding request.

The legacy admin-key enrollment endpoint remains for your operational setup only. For normal client onboarding, use registration keys and the in-app owner/staff sign-in flows above.

Use the same business ID across its devices and a unique device ID for each installed client, then issue its JWT from a secure terminal (replace all example values):

```powershell
$headers = @{ 'x-admin-key' = 'YOUR_ADMIN_API_KEY'; 'Content-Type' = 'application/json' }
$body = @{ businessId = 'client-001'; deviceId = 'client-001-pc-01'; expiresInDays = 365 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/admin/devices' -Headers $headers -Body $body
```

Copy the returned `deviceToken` into the installed app's `%APPDATA%\Stockroom Business\sync-config.json`, together with the Render URL, business ID, and device ID. Do not put `MONGODB_URI`, `JWT_SECRET`, or `ADMIN_API_KEY` into the installed application.

For the Vercel/iPhone PWA, set PWA_ALLOWED_ORIGINS to the exact HTTPS origin(s), separated by commas. Android's https://localhost remains allowed. See [PWA-DEPLOYMENT.md](../PWA-DEPLOYMENT.md).

Direct-distribution clients support one-time Paystack subscriptions and explicitly authorized recurring monthly/yearly renewal. Play Store builds use Google Play Billing. Grace is configurable: monthly plans use days; yearly/Enterprise plans use calendar months. See [subscription setup](../docs/subscriptions.md) and [Play Billing](../docs/google-play-billing.md). Enforcement starts off; only the developer can enable it through Control Centre. Deploy the cloud service before updated clients.

## Supermarket sync and deployment

The updated clients request `retail-v3` when pulling purchasing and stock-batch operations. Deploy this cloud version first, then update tills together. Keep existing MongoDB business IDs, data and credentials.

Immutable `retail_record` operations capture orders, receipts, supplier returns, wastage and price/batch corrections. Operation IDs make retries idempotent. Revision checks protect shared baskets/registers and price changes. The coordinator uses MongoDB transactions and separate `supermarket_resources` / `supermarket_admissions` collections; it requires a transaction-capable deployment such as the existing Atlas replica set. Existing business collections are retained.

Coordination detects stock overselling and excessive receiving/returns across tills. Completed offline financial records are retained and warnings are surfaced as sync conflicts for review. This is not a central stock reservation service and cannot prevent independently offline tills acting on the same available quantity. Supplier payments and opening balances synchronize as immutable retail records. New stock losses carry immutable batch-cost snapshots so reports on receiving tills use the original valuation. See [current supermarket scope](../docs/supermarket-workspace.md).

## Workspace and reporting compatibility

Current shared workflows require `retail-v3`, `counter-v3`, `restaurant-v2` and `service-jobs-v1` as applicable. Deploy this backend before updated clients. Reporting timezone is validated and synchronized within `shopProfile`; existing businesses default to UTC. Older clients may discard newer settings, so update all participating clients before sharing configuration. Account-deletion delay is developer-configured and defaults to 14 days.

Owner staff removal uses `POST /v1/staff/:id/remove` with owner authentication, password confirmation and `confirmation: "REMOVE"`. The retained profile is marked removed; access tokens and refresh renewal are blocked. A cloud-authored `staff_removal` operation distributes the revocation to clients. Sync clients must send `staffCapability=staff-removal-v1`; older clients receive an update-required response rather than silently skipping a removal. Removed usernames remain reserved. Disconnected clients apply revocation when they reconnect and sync.
