# Stockroom Business

Stockroom Business is an offline-first inventory, point-of-sale, and business-operations app for small businesses. It supports Windows Desktop, browser/PWA, and Android clients.

## Offline-first by design

Each client has its own local workspace and saves operational work locally before cloud sync:

- **Windows Desktop:** local SQLite managed by the desktop app.
- **Browser/PWA:** Browser SQLite backed by IndexedDB in the browser profile that opened the app URL. Opening the URL is enough; browser installation is optional.
- **Android:** native SQLite on the phone.

Products, sales, stock takes, customers, receipts, and business settings remain available from the local database after a successful sign-in. When internet is available, queued changes synchronize through the hosted cloud sync API.

## Businesses, devices, and identity

Cloud records are tenant-separated with `businessId`. A browser profile or app installation is enrolled for one business at a time, preventing it from reading or writing another business's data. This enrollment identifies a local app workspace; it does not make a physical device the owner of a business.

The app uses two different credentials:

- A **local app session** restores the already signed-in user for offline use.
- A **cloud owner credential** authorizes sensitive online operations such as subscription checkout, referrals, and cloud team management. Its short-lived access token is renewed using a rotating refresh credential. Password reset deliberately revokes cloud refresh credentials and device enrollments.

Staff usernames are unique within their business. Owner emails are globally unique. Do not manually alter cloud accounts, device records, or sync operations to resolve a local sign-in problem.

## What needs internet

Internet is not required to reopen a saved local workspace or perform normal local operations. It is required to:

- enroll a new device or browser profile;
- download cloud changes or upload queued changes;
- create or change cloud staff accounts;
- complete payment, subscription, referral, or developer subscription actions.

The active screen is retained across a normal reload. **Refresh** downloads cloud changes into the local database without discarding local work. Subscription access and the last retrieved owner summary are cached locally for offline display.

## Client notes

### Windows Desktop

The installed desktop app starts its own local service and SQLite database; clients do not run `npm`.

The normal database path is typically:

`%APPDATA%\stockroom-business-app\data\stockroom.sqlite`

Back up that file before upgrades, recovery work, or moving a workstation. Do not delete it merely to solve a cloud-session problem.

### Browser / PWA

The deployed URL runs in PWA mode. Browser tabs and an installed app window in the same browser profile share the same local workspace. A different browser profile has separate storage and needs its own enrollment.

See [PWA deployment instructions](PWA-DEPLOYMENT.md) for hosting and service-worker details.

### Android

Android uses its own device-local SQLite database through Capacitor. The current project build path produces a debug APK for testing; it is not a Play Store release workflow.

## Development and validation

```powershell
npm run build
npm test
```

For the PWA integration test:

```powershell
npm run build:pwa
node test/pwa.browser.mjs
npm run build
```

Desktop packaging and Android APK generation are release operations, not routine validation commands.

## Cloud service and release checks

MongoDB is accessed only through the hosted cloud sync API. Connection strings, admin keys, and other server secrets must never be placed in the desktop build, PWA bundle, APK, or browser settings.

Before public distribution, test local restart and identity restoration, offline work, Refresh, two-device sync, and rejection of a different business account on an enrolled client. Configure support, privacy, signing, and store-release details before distributing production installers or APKs.
