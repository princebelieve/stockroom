# Cloud sync service deployment

Deploy this repository to Render as a **Web Service** using `render.yaml`.

Set these Render environment variables:

- `MONGODB_URI`: MongoDB Atlas connection string. Only Render receives this value.
- `JWT_SECRET`: a long random secret. Render can generate it from `render.yaml`.
- `ADMIN_API_KEY`: a long random secret used only by you to enroll a device.
- `MONGODB_DATABASE`: optional; defaults to `stockroom_sync`.
- `SMTP_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`: optional Gmail OAuth 2.0 SMTP transport. All four are required before reset and staff-invitation emails are delivered.

After deployment, verify `https://YOUR-RENDER-URL/health` returns `{"ok":true}`.

## Owner accounts and device management

Register each client owner once. Store the returned `accessToken` securely; it is an eight-hour owner-management token, not a device token.

```powershell
$body = @{ businessId = 'client-001'; ownerName = 'Client Owner'; email = 'owner@client.com'; password = 'Use-a-long-unique-password' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/auth/register' -ContentType 'application/json' -Body $body
```

Owners sign in with their email and password through `POST /v1/auth/login`. Staff sign in with their username and password; staff email addresses are contact-only and cannot authenticate. Staff usernames are unique within a business, so use the business-specific sign-in URL shown in Team management when signing in on a new browser. The URL passes the business ID as a tenant selector; the username and password still authenticate the staff account. An authenticated staff account can enroll its own browser, so the owner does not need to enroll each staff browser. Existing staff receive a username derived from their email prefix the next time the owner opens Team management. Owners use their returned `accessToken` to enroll, list, or revoke devices. Enroll a device:

```powershell
$headers = @{ Authorization = 'Bearer OWNER_ACCESS_TOKEN'; 'Content-Type' = 'application/json' }
$body = @{ deviceId = 'client-001-pc-01'; label = 'Main checkout computer' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/devices/enroll' -Headers $headers -Body $body
```

List devices with `GET /v1/devices`; revoke one with `POST /v1/devices/DEVICE_ID/revoke`. A revoked device can no longer push or pull data.

Email password recovery uses `POST /v1/auth/password-reset/request` and `POST /v1/auth/password-reset/confirm`, and is available only to the business owner. Staff emails cannot reset an account. Staff sign in with their username; owners can see usernames in Team management and reset either an admin or cashier password through `PUT /v1/staff/:id/password`. This action cannot target owners and revokes the staff account's refresh tokens. Resetting an owner password revokes every enrolled device, requiring deliberate re-enrollment.

### Gmail OAuth mail setup

Create a Google Cloud project, configure the OAuth consent screen, create a **Web application** OAuth client, and obtain a refresh token for the Gmail account that will send Stockroom messages. Store only the resulting values in Render environment variables—never in the desktop app, `sync-config.json`, Git, or MongoDB. The service uses Gmail SMTP with OAuth 2.0, not a Gmail password or app password.

The legacy admin-key enrollment endpoint remains for your operational setup only. For normal client onboarding, prefer the owner account flow above.

For each installed client device, create a unique business ID and device ID, then issue its JWT from a secure terminal (replace all example values):

```powershell
$headers = @{ 'x-admin-key' = 'YOUR_ADMIN_API_KEY'; 'Content-Type' = 'application/json' }
$body = @{ businessId = 'client-001'; deviceId = 'client-001-pc-01'; expiresInDays = 365 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR-RENDER-URL/v1/admin/devices' -Headers $headers -Body $body
```

Copy the returned `deviceToken` into the installed app's `%APPDATA%\Stockroom Business\sync-config.json`, together with the Render URL, business ID, and device ID. Do not put `MONGODB_URI`, `JWT_SECRET`, or `ADMIN_API_KEY` into the installed application.

For the Vercel/iPhone PWA, set PWA_ALLOWED_ORIGINS to the exact HTTPS origin(s), separated by commas. Android's https://localhost remains allowed. See [PWA-DEPLOYMENT.md](../PWA-DEPLOYMENT.md).

Manual Paystack subscriptions, the developer-only enforcement switch, and one-month POS grace are integrated into the Vercel Business App. See [subscription setup](../docs/subscriptions.md). Enforcement starts off; deploy this cloud service before the updated client, then turn it on from the in-app Subscription screen when ready.
