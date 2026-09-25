# Public website and remote registration

This updates the existing Render service and Vercel project; do not create a second business backend or replace the live database.

The public page is available after deployment at `https://stockroom.globalcreest.com/welcome` using the app's existing domain. Vercel clean URLs hide the `.html` suffix. This works without adding another domain. `sbi.globalcreest.com` already serves a separate website and should remain attached to that deployment.

The build contains two entry points:

- `https://stockroom.globalcreest.com/welcome`: public landing page for Stockroom Business by S. B. Ibhadode technology.
- `https://stockroom.globalcreest.com/`: existing PWA and sign-in page.

Do not add `sbi.globalcreest.com` to this Vercel project or change its DNS while it serves the existing website. The landing page stays on the Stockroom app domain; it links visitors to the app for registration and sign-in.

## Deployment configuration

Vercel builds with `npm run build:pwa`. Configure:

```text
VITE_PUBLIC_APP_URL=https://stockroom.globalcreest.com/
SYNC_API_URL=https://stockroom-0vm5.onrender.com
VITE_APK_DOWNLOAD_URL=<HTTPS URL of your published production APK>
VITE_DESKTOP_DOWNLOAD_URL=<HTTPS URL of your published Windows installer>
```

Download controls remain visibly unavailable until valid HTTPS release URLs are supplied. For large installers, use a **public Vercel Blob store** connected to this Vercel project rather than committing binaries into the app repository. Create it from the Vercel project's **Storage** tab, then upload production artifacts using the Vercel CLI, for example:

```powershell
vercel blob put .\release\android\Stockroom-release.apk --pathname downloads/Stockroom-release.apk --access public
vercel blob put ".\release\Stockroom Business Setup 1.0.5.exe" --pathname downloads/Stockroom-Business-Setup-1.0.5.exe --access public
```

Copy the public HTTPS URLs printed by the CLI into `VITE_APK_DOWNLOAD_URL` and `VITE_DESKTOP_DOWNLOAD_URL` in the Vercel project environment settings, then redeploy the frontend. Link the Windows `.exe` directly. Use Blob rather than the Hobby static deployment because this installer is about 188 MB, above the 100 MB static file limit. Vercel Blob is available on Hobby with a free allowance; monitor storage and download transfer in the Vercel dashboard because use beyond included quotas may be restricted on Hobby. The Android release command requires a production keystore through `ANDROID_RELEASE_KEYSTORE`, `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`, and `ANDROID_RELEASE_KEY_PASSWORD`; it fails rather than silently shipping a debug-signed or unsigned APK. Keep the keystore and passwords private and backed up. Never put signing secrets or the cloud admin key in a `VITE_` variable.

On the cloud deployment configure:

```text
PWA_ALLOWED_ORIGINS=https://stockroom.globalcreest.com
SUBSCRIPTION_PUBLIC_URL=https://stockroom.globalcreest.com/
DEVELOPER_EMAIL=<your existing cloud developer owner email>
```

Deploy the cloud API before the frontend. Keep existing MongoDB and secrets. Registration uses MongoDB transactions (Atlas or another replica set is required). A unique partial index enforces one owner per business; audit and resolve any existing duplicate owners before rollout if index creation fails. Do not delete business data to resolve an index failure.

## Everyday use

- For advertising, share `https://stockroom.globalcreest.com/welcome`. The page identifies Stockroom as a product of S. B. Ibhadode technology.
- For key generation, open `https://stockroom.globalcreest.com/?screen=subscription` and sign in with the owner account matching Render's existing `DEVELOPER_EMAIL`. The Business registration keys section is developer-only.
- Generate the key and copy the customer instructions from that screen. Send those privately yourself.
- A new customer's installed app starts with **New business with a key** and **Existing business**. Manual admin-key installation is under **Developer installation tools**, not in the ordinary customer path.
- New visitors to the app root are sent to `/welcome`; **Start business registration** opens the request form in the app. The customer may also follow `https://stockroom.globalcreest.com/?screen=register` directly. The form provides WhatsApp, `info@sbi.globalcreest.com`, and `sbi.globalcreest.com` contact options to request a registration link.
- Returning customers use their saved workspace. Adding another device uses the existing owner credentials, not a new key. Subscription selection and payment stay in Stockroom.

## Generate and redeem a key

1. Sign in as the configured developer owner. Open **Subscription → Business registration keys**.
2. Enter a unique business ID, business name, owner email, and 1–30 days of validity (default 7).
3. Copy the displayed key and send it privately with `https://stockroom.globalcreest.com/?screen=register`. The server stores only a SHA-256 hash, never the usable key. It is not an admin/device token.
4. The customer uses **Register a new business** in Stockroom. The existing **Set up your shop** screen accepts the key, matching owner email, password, currency and optional referral code. The public landing page only links to this app screen.
5. Successful key registration reuses the app?s existing device enrollment and sign-in flows. Additional devices use **Existing business / Add another device**. Subscription selection, payments and referral management stay in the app?s existing Subscription screen. No installer admin key is shared.

Key consumption, owner creation, initial business settings, sync-log entry, and referral binding commit atomically. Failed registration rolls back the key use. Concurrent/replayed claims cannot create a second business with the same key. Expired keys cannot be redeemed even before MongoDB's TTL cleanup runs.

The old owner-registration endpoint now requires a valid enrolled device token for that business, preventing it from bypassing registration keys. The desktop local-server registration bridge supplies that token for the existing installer workflow. Deploy that bridge before using the old installer-based new-business setup against the updated cloud API. Existing sign-in and device enrollment are unaffected.

## Referrals and installation

The public page fetches only the two configured referral percentages from `/v1/public/landing`. If unavailable, it says so rather than advertising a guessed percentage. Invitation links open new-business registration: `https://stockroom.globalcreest.com/?screen=register&ref=<code>`. The code is retained and prefilled in the registration screen. Existing owners sign in normally and keep access to the Subscription flow.

PWA installation belongs to the **app origin**. On the separate public domain the PWA button opens the app, where supported browsers expose installation. On iOS use Safari's Share → Add to Home Screen. Do not install a second copy on the marketing origin and expect it to share the app origin's local database.
