# Cloud sync service deployment

Deploy this repository to Render as a **Web Service** using `render.yaml`.

Set these Render environment variables:

- `MONGODB_URI`: MongoDB Atlas connection string. Only Render receives this value.
- `JWT_SECRET`: a long random secret. Render can generate it from `render.yaml`.
- `ADMIN_API_KEY`: a long random secret used only by you to enroll a device.
- `MONGODB_DATABASE`: optional; defaults to `stockroom_sync`.
- `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`: optional Gmail API OAuth 2.0 credentials. All four are required before registration-key, reset, receipt and staff-invitation emails are delivered.

After deployment, verify `https://YOUR-RENDER-URL/health` returns `{"ok":true}`.

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
