# Deploy the iPhone PWA

The PWA is an explicit, separate build. It uses SQLite compiled to WebAssembly
inside the browser, with the database durably saved in IndexedDB. Windows keeps
its Node/SQLite server; Android keeps Capacitor/native SQLite. Neither installed
version enables the browser adapter, even if someone accidentally packages the
PWA build. The existing packaging scripts rebuild in standard mode.

## 1. Update the existing Render cloud service

Deploy the updated `cloud` code. Keep the existing MongoDB and secrets.
Add this environment variable, replacing the example with your production URL:


```text
PWA_ALLOWED_ORIGINS=https://your-app.vercel.app
```

Use exact origins without trailing slashes. For a custom domain, add it as a
comma-separated entry. Do not allow every Vercel preview domain. Android's
`https://localhost` origin remains allowed automatically; Windows has no browser
CORS requirement. No business/device credentials belong in Vercel environment
variables or source control.

## 2. Deploy the interface to Vercel

Import this repository as a Vite project. The checked-in `vercel.json` selects:

- Build command: `npm run build:pwa`
- Output directory: `dist`

If using a cloud API other than the existing Render service, add the public
environment variable `VITE_SYNC_API_URL=https://your-api.example.com` and redeploy.
Do not set `VITE_APP_MODE` globally on your workstation; `.env.pwa` enables it only
for the PWA build. Leave MongoDB, JWT, installer and email secrets on Render.

To check the production PWA locally:

```powershell
npm.cmd run build:pwa
npm.cmd run preview
```

For live cloud calls from preview, temporarily add its exact origin to Render's
allowlist, then remove it after testing. Browser regression tests use fake cloud
accounts and do not need the live service:

```powershell
npm.cmd run build:pwa
node test/pwa.browser.mjs
```

The regression runner currently uses installed Microsoft Edge in headless mode.

## 3. Install and enroll on iPhone

Use an up-to-date iOS version (iOS 17 or newer is recommended). Open the production
HTTPS URL in Safari and choose Share → Add to Home Screen. Open the installed
icon **before enrolling**, since browser and installed-app storage may differ.

The owner joins an existing business with a unique device ID (for example
`shop-iphone-01`) and label, then signs in. Do not reuse another device's ID.
New-business provisioning still happens through the existing installation flow.
Initial enrollment, sign-in after logout, staff administration and password reset
need internet access. An existing signed-in session can reopen and work offline.
Owner sign-in renews the same device's token without deleting its database/outbox.

## Daily use and updates

- Inventory, cash/external-terminal sales, customer balances, expenses, reports,
  CSV export, staff management and cloud sync have browser implementations.
- **Sync now** is visible on phones and uploads queued changes. Keep the app open
  until it finishes. If more than 500 changes were queued, repeat until the queued
  count reaches zero. iOS background execution is not required or promised.
- **Refresh** in the three-dot menu and pull-to-refresh download changes without
  uploading queued work. Refresh can also activate a downloaded interface update.
- A failed write is not acknowledged as saved. Browser storage remains subject to
  the operating system and user clearing website data; sync regularly and do not
  clear the site's data while changes are queued.
- Local-server features (customer-display pairing, owner
  metrics dashboard, filesystem backups) are not offered by this PWA. Approved
  stocktake changes from Windows still update PWA inventory through sync.
- Stock take supports offline counting, restoring the latest draft after reopening,
  approval reasons, and audit history. Drafts remain on the originating browser;
  approval queues the completed session and adjustments for Sync now. Approval
  applies the variance to current stock, preserving sales recorded since counting
  began, and refuses any adjustment that would make local stock negative.
  Update the Android APK before relying on it to receive stocktake approvals;
  this change adds the missing Android reader for those sync operations.
- Customer balance adjustments are supported; wallet-funded checkout is not yet
  offered in the PWA. Physical terminal and printer support depends on the browser;
  external-terminal payments use manual references and receipts use browser print.

Before live use, verify on the actual iPhone: enrollment, login/logout, an offline
sale, closing/reopening offline, reconnecting and syncing, stock arriving from
Windows/Android, and an interface update. Automated Chromium tests cannot certify
iPhone storage, printing or installation behavior.

## Existing installers

No packaging is required to deploy the PWA. When you want new installed versions:

```powershell
npm.cmd run android:debug
npm.cmd run desktop:package
```

These continue to produce the Android APK and Windows installer in `release`.
