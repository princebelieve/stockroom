# Stockroom Business

Stockroom Business is an offline-first business operations app for organizations that manage products, stock, sales, customers, and staff. It is not limited to a particular business size or industry. It supports Windows desktop, Android, and browser/PWA use.

## What the app does

- **Inventory:** maintain products, SKUs and barcodes, categories, costs, prices, quantities, and reorder points; record stock movements and stocktakes.
- **Point of sale:** record cash, bank transfer, manually confirmed external-terminal, split, and supported wallet payments. Sales reduce stock and produce receipts.
- **Customers and wallets:** keep customer records, record deposits, repayments, and withdrawals, and track balances owed or prepaid. Wallet checkout availability depends on the client; it is not currently offered in the PWA.
- **Sales operations:** review sales, receipts, payment evidence, cashier activity, and reports. Import provider CSV data for reconciliation without changing the original sales.
- **Staff and access:** owners manage admin and cashier accounts. Cashiers can be limited to POS; owners can grant additional operational access.
- **Business and device setup:** set the business name, logo, currency, payment policy, and device-specific printer or checkout settings. The device wizard records setup and test status; it does not provide direct payment-terminal integration.
- **Subscriptions and referrals:** owners can manage subscription payments and share referral invitations. The tracked referral program currently credits existing business owners; independent referral-partner accounts are not available.

See [hardware setup](docs/hardware-setup.md), [subscription behavior](docs/subscriptions.md), and [PWA deployment and platform limitations](PWA-DEPLOYMENT.md) for details.

## Offline work and synchronization

Each client keeps its own local database:

- **Windows desktop:** SQLite managed by the desktop app.
- **Browser/PWA:** SQLite stored in IndexedDB for that browser profile. Installing the PWA is optional; a browser tab uses the same profile workspace.
- **Android:** native SQLite on the device.

A new device or browser profile needs internet for its initial sign-in, business enrollment, and download of business data. After setup, the saved workspace can reopen offline. Local sales and other supported changes are saved on the device first and queued for synchronization. Use **Sync now** when online to upload queued work; **Refresh** downloads cloud changes without discarding local work. Sync regularly, especially before changing or clearing browser/device storage.

Each browser profile or installed client is connected to one business at a time. For a new browser/PWA, staff can use the business-specific sign-in link shown to the owner in **Team management**, then sign in with their own username and password. The link identifies the business; it does not replace staff credentials. Each browser profile has separate storage and must download its own workspace.

Offline availability depends on data already downloaded and locally cached. New sign-ins, initial downloads, adding devices, cloud staff administration, subscription actions, and synchronization require internet. Some features also depend on platform hardware or operating-system services.

## Platform differences and limitations

- **PWA:** supports browser-based inventory, POS, customers, expenses, reports, stocktakes, team functions, and sync, with some platform-specific limitations. Receipts use browser printing; physical terminal payments are recorded with manual references and confirmation. See the PWA guide for the current feature list and known limitations.
- **Windows:** runs a local app service and SQLite database. Printer access uses installed Windows printer queues. The customer display and filesystem backup features are desktop-only.
- **Android:** uses Capacitor and native SQLite. Printing opens Android's system print dialog and depends on a compatible print service.
- **Payment terminals:** the app does not connect directly to payment providers. Staff confirm external payments from the provider's receipt or reference. OCR can suggest a reference from a receipt photo, but staff must verify payment status, amount, and currency.
- **Device setup:** the wizard guides setup and records test status; unsupported hardware integrations remain unavailable. See [hardware setup](docs/hardware-setup.md).

## Business registration and sign-in

New businesses request a registration key from S. B. Ibhadode technology and redeem it in the app with the matching owner email. Registration and first data setup require internet. Owners use their email to sign in; staff use the username assigned in Team management. For a new PWA/browser profile, staff should open the business sign-in link supplied by the owner.

The public product and registration information is at [stockroom.globalcreest.com/welcome](https://stockroom.globalcreest.com/welcome). Subscription and account features are available inside the app after owner sign-in.

## Development

Requirements: Node.js and npm. Install dependencies and start the local Vite development server:

```powershell
npm install
npm run dev
```

Available build commands:

```powershell
npm run build       # standard Windows/Android web assets
npm run build:pwa   # browser/PWA build
npm test            # automated Node tests
```

The browser integration flow is documented in [PWA deployment](PWA-DEPLOYMENT.md). Android and Windows packaging commands are in `package.json`; release Android builds require the configured private signing keystore and credentials. Do not distribute debug builds as production releases.

## Cloud and secrets

The hosted cloud API uses MongoDB for accounts, business-scoped sync, subscriptions, and referral records. The desktop, Android, and PWA clients call the cloud API; database connection strings, JWT secrets, admin keys, payment secrets, and signing credentials must remain on the server or in the secure release environment. Never place them in `VITE_` variables or commit them to source control.

Deployment guides:

- [PWA deployment](PWA-DEPLOYMENT.md)
- [Public landing page and business registration](docs/LANDING-AND-REGISTRATION.md)
- [Subscription configuration and behavior](docs/subscriptions.md)
- [Hardware setup and limitations](docs/hardware-setup.md)
