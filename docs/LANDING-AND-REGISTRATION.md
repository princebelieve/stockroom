# Public website and remote registration

This updates the existing Render service and Vercel project; do not create a second business backend or replace the live database.

The public page is available after deployment at `https://stockroom.globalcreest.com/welcome` using the app's existing domain. Vercel clean URLs hide the `.html` suffix. This works without adding another domain. `sbi.globalcreest.com` already serves a separate website and should remain attached to that deployment.

Public navigation now opens separate pages: `/features`, `/workspaces`, `/hardware`, `/getting-started`, `/downloads`, `/referrals` and `/support`. Each has its own HTML entry, title and content; the shared navigation lives in `src/publicNavigation.ts`. Vercel clean URLs and the Windows server serve these destinations directly. The offline shell includes them, and referral codes are retained when moving between public pages. Account registration, subscriptions and authenticated wallets remain in their existing applications. Device information lists the owner-tested DKT-M81, HP LaserJet P1102 and model 8120 scanner; the supplied 230 mm/s figure is identified as printer speed rather than paper weight or a measured app benchmark.

The build contains the main app, the separate public information pages, and developer, visitor and account-deletion entry points. The two primary customer URLs are:

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
vercel blob put .\release\android\Stockroom-Android-VERSION-VERSIONCODE.apk --pathname downloads/Stockroom-Android-VERSION-VERSIONCODE.apk --access public
vercel blob put ".\release\Stockroom Business Setup VERSION.exe" --pathname downloads/Stockroom-Business-Setup-VERSION.exe --access public
```

Copy the public HTTPS URLs printed by the CLI into `VITE_APK_DOWNLOAD_URL` and `VITE_DESKTOP_DOWNLOAD_URL` in the Vercel project environment settings, then redeploy the frontend. Replace VERSION and VERSIONCODE with the generated release filenames; `scripts/publish-android-release.mjs` creates versioned Android artifacts and refuses overwrites. Link the Windows `.exe` directly. Choose storage that accepts the actual artifact size and check your hosting account's current limits and charges; the repository does not establish its allowance. The Android release command requires a production keystore through `ANDROID_RELEASE_KEYSTORE`, `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS`, and `ANDROID_RELEASE_KEY_PASSWORD`; it fails rather than silently shipping a debug-signed or unsigned APK. Keep the keystore and passwords private and backed up. Never put signing secrets or the cloud admin key in a `VITE_` variable.

On the cloud deployment configure:

```text
PWA_ALLOWED_ORIGINS=https://stockroom.globalcreest.com
SUBSCRIPTION_PUBLIC_URL=https://stockroom.globalcreest.com/
DEVELOPER_EMAIL=<your existing cloud developer owner email>
```

Deploy the cloud API before the frontend. Keep existing MongoDB and secrets. Registration uses MongoDB transactions (Atlas or another replica set is required). A unique partial index enforces one owner per business; audit and resolve any existing duplicate owners before rollout if index creation fails. Do not delete business data to resolve an index failure.

## Everyday use

- For advertising, share `https://stockroom.globalcreest.com/welcome`. The page identifies Stockroom as a product of S. B. Ibhadode technology.
- For a new business, open `https://stockroom.globalcreest.com/?screen=register` or choose **Register a new business** in the app. The owner enters a business name and email; Stockroom generates a one-use key and emails it automatically. Its expiry uses the duration set by the developer in Plan settings.
- The developer-only key form remains available in the Businesses dashboard for assisted signups.
- A new customer's installed app starts with **New business with a key** and **Existing business**. Manual admin-key installation is under **Developer installation tools**, not in the ordinary customer path.
- New visitors to the app root are sent to `/welcome`; **Start business registration** opens the request form in the app. The customer may also follow `https://stockroom.globalcreest.com/?screen=register` directly. The request form emails the generated key directly. The listed support channels are available if the email does not arrive.
- Returning customers use their saved workspace. Adding another device uses the existing owner credentials, not a new key. Subscription selection and payment stay in Stockroom.

## Generate and redeem a key

1. The owner opens `https://stockroom.globalcreest.com/?screen=register` or taps **Register a new business** in the app and enters a business name and email.
2. Stockroom creates a unique business ID and one-use key, then emails it to that address. The developer controls key validity (1–30 days, default 7) in Developer dashboard **Settings → Plan and reward settings**. Public key requests are rate-limited.
3. The owner enters the emailed key and the same email, then sets a password, currency, and optional referral code. The key can only be redeemed once and only with that email.
4. If a customer needs help or cannot receive the automated email, the developer can issue a key from the dashboard’s **Businesses** page. The server stores only a SHA-256 hash of the usable key.
5. Additional devices use **Existing business / Add another device**. Subscription and referral management stay in the app.

Key consumption, owner creation, initial business settings, sync-log entry, and referral binding commit atomically. Failed registration rolls back the key use. Concurrent/replayed claims cannot create a second business with the same key. Expired keys cannot be redeemed even before MongoDB's TTL cleanup runs.

The old owner-registration endpoint now requires a valid enrolled device token for that business, preventing it from bypassing registration keys. The desktop local-server registration bridge supplies that token for the existing installer workflow. Deploy that bridge before using the old installer-based new-business setup against the updated cloud API. Existing sign-in and device enrollment are unaffected.

## Referrals and installation

The public page fetches the configured business-owner and visitor-promoter reward percentages from `/v1/public/landing`. Visitors can create promoter accounts on `/welcome`; the account provides an invitation link and a view of verified commissions. New businesses opened from either kind of invitation retain the referral code through registration. Each referred business can generate rewards on up to four successful subscription payments. Every payment counts once regardless of whether it grants monthly, yearly or Enterprise access. Rates are saved when checkout starts. Payouts support configured Paystack transfers for supported destinations and currencies, with manual handling or review when required; see [subscriptions and payouts](subscriptions.md).

PWA installation belongs to the **app origin**. The public landing page uses the same configured Stockroom domain and its PWA button opens the app, where supported browsers expose installation. On iOS use Safari's Share → Add to Home Screen. Do not install a second copy on the marketing origin and expect it to share the app origin's local database.
