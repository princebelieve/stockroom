# Stockroom Business

Stockroom Business is an offline-first business operations app for organizations that manage products, stock, sales, customers, and staff. It is not limited to a particular business size or industry. The PWA is a complete installation option; the Windows installer and Android APK are optional clients for businesses that prefer installed apps.

## What the app does

- **Inventory:** maintain products, SKUs and barcodes, categories, costs, prices, quantities, and reorder points; record stock movements and stocktakes.
- **Point of sale:** record cash, bank transfer, manually confirmed external-terminal, split, and supported wallet payments. Sales reduce stock and produce receipts.
- **Customers and wallets:** keep customer records, record deposits, repayments, and withdrawals, and track balances owed or prepaid. Wallet checkout availability depends on the client; it is not currently offered in the PWA.
- **Sales operations:** review sales, receipts, payment evidence, cashier activity, and reports. Import provider CSV data for reconciliation without changing the original sales.
- **Staff and access:** owners manage admin and cashier accounts. Cashiers can be limited to POS; owners can grant additional operational access.
- **Business and device setup:** set the business name, logo, currency, payment policy, and device-specific printer or checkout settings. The device wizard records setup and test status; it does not provide direct payment-terminal integration.
- **Subscriptions and referrals:** owners can manage subscription payments and share business invitations. Visitor promoters can create an account, share a tracked link, and review verified rewards in their wallet.
- **Account closure:** signed-in owners can deactivate a business and schedule cloud record deletion; visitor promoters can close their account from the promoter wallet. The developer sets the waiting period (90 days by default). Offline device copies are not remotely erased.

See [hardware setup](docs/hardware-setup.md), [subscription behavior](docs/subscriptions.md), and [PWA deployment and platform limitations](PWA-DEPLOYMENT.md) for details.

### Product autofill and migration

Use **Print blank product form** beside **Add product** on Overview or Inventory to print a reusable, one-product sheet for handwriting and photocopying. It includes the existing Add Product fields, business identity, currency and business-type unit guidance, with product values left blank. It uses the report printer/system print dialog; completed paper forms can be entered through Add product.

Owners can also use **Upload completed product form** to enter details beside a photo and save after review. **Autofill on this device** uses the bundled English OCR reader without Google, an API key or a recognition-service bill. It works best for printed text; handwriting recognition is best-effort and must be checked. Optional Google Cloud Vision recognition is also retained. Both readers fill empty fields without replacing owner entries, and failures never prevent manual completion. Write in BLOCK / CAPITAL LETTERS for best results. Form recognition requires the current marked form (F01–F10). See [handwritten form setup, workflow and validation](docs/handwritten-product-forms.md).

In Inventory, use **Product import and autofill** to load CSV files, scan barcodes, or read package, invoice and product-list screenshots. Image text is read locally with the bundled English OCR engine. You can also paste text. Select the document type, read the image, then choose **Suggest products from text**. Review and edit the resulting rows before importing. PDFs currently require a screenshot of the relevant table.

Barcode lookup uses Open Food Facts for packaged food when online; it is not a universal product catalogue. Only the barcode is sent, not photos or business records. Suggestions are attributed to [Open Food Facts](https://world.openfoodfacts.org), whose database is licensed under [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Missing results and network failures leave an editable barcode row. Lookup results are cached for the current session and requests are spaced to respect provider limits.

Package names and sizes are text-based suggestions, not guaranteed image recognition. Invoice lines require owner selection; only clear, explicitly labelled unit-cost columns are extracted as cost. Ambiguous lines retain their original text for correction. Invoice quantities never become current stock automatically. The owner must enter selling price and current stock, including explicit zero where appropriate; blank cost and reorder values save as zero. Review the selling unit carefully for cartons versus individual items. Duplicate barcodes are blocked in selected rows and the loaded catalogue. Confirmed imported rows are removed immediately, so a later row failure preserves only the unfinished work. After an uncertain network failure, refresh inventory before retrying.

## Offline work and synchronization

Each client keeps its own local database:

- **Windows desktop:** SQLite managed by the desktop app.
- **Browser/PWA:** SQLite stored in IndexedDB for that browser profile. Installing the PWA is optional; a browser tab uses the same profile workspace.
- **Android:** native SQLite on the device.

A new business can register in the PWA while online. New devices and browser profiles need internet for enrollment, initial sign-in, and download of business data. After setup, the saved workspace can reopen offline. Local sales and other supported changes are saved on the device first and queued for synchronization. Use **Sync now** when online to upload queued work; **Refresh** downloads cloud changes without discarding local work. Sync regularly, especially before changing or clearing browser/device storage.

Each browser profile or installed client is connected to one business at a time. For a new browser/PWA, staff can use the business-specific sign-in link shown to the owner in **Team management**, then sign in with their own username and password. The link identifies the business; it does not replace staff credentials. Each browser profile has separate storage and must download its own workspace.

Offline availability depends on data already downloaded and locally cached. New sign-ins, initial downloads, adding devices, cloud staff administration, subscription actions, and synchronization require internet. Some features also depend on platform hardware or operating-system services.

## Platform differences and limitations

- **PWA:** supports browser-based inventory, POS, customers, expenses, reports, stocktakes, team functions, and sync, with some platform-specific limitations. Receipts use browser printing; physical terminal payments are recorded with manual references and confirmation. See the PWA guide for the current feature list and known limitations.
- **Windows:** runs a local app service and SQLite database. Printer access uses installed Windows printer queues. The customer display and filesystem backup features are desktop-only.
- **Android:** uses Capacitor and native SQLite. Printing opens Android's system print dialog and depends on a compatible print service.
- **Payment terminals:** the app does not connect directly to payment providers. Staff confirm external payments from the provider's receipt or reference. OCR can suggest a reference from a receipt photo, but staff must verify payment status, amount, and currency.
- **Device setup:** the wizard guides setup and records test status; unsupported hardware integrations remain unavailable. See [hardware setup](docs/hardware-setup.md).

## Business registration and sign-in

New businesses can request a registration key from the app; Stockroom generates and emails it automatically using the validity period set in Developer settings. They redeem it with the same owner email. Registration and first data setup require internet. Owners use their email to sign in; staff use the username assigned in Team management. For a new PWA/browser profile, staff should open the business sign-in link supplied by the owner.

The public product and registration information is at [stockroom.globalcreest.com/welcome](https://stockroom.globalcreest.com/welcome). Subscription and account features are available inside the app after owner sign-in.

Account holders can request closure at [stockroom.globalcreest.com/account-deletion](https://stockroom.globalcreest.com/account-deletion). The same page is linked from the mobile landing-page menu and Privacy Policy.

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

The browser integration flow is documented in [PWA deployment](PWA-DEPLOYMENT.md). Android and Windows packaging commands are in `package.json`; release Android builds require the configured private signing keystore and credentials. `npm run android:release` creates both a sideloadable APK and a Play Store AAB in `release/android`, with versioned filenames, and refuses to overwrite an artifact with the same name. `npm run android:bundle` creates only the AAB. Increase Android `versionCode` before each Play Store upload and keep `versionName` aligned with `package.json`. Do not distribute debug builds as production releases.

## Cloud and secrets

The hosted cloud API uses MongoDB for accounts, business-scoped sync, subscriptions, and referral records. The desktop, Android, and PWA clients call the cloud API; database connection strings, JWT secrets, admin keys, payment secrets, and signing credentials must remain on the server or in the secure release environment. Never place them in `VITE_` variables or commit them to source control.

Deployment guides:

- [PWA deployment](PWA-DEPLOYMENT.md)
- [Public landing page and business registration](docs/LANDING-AND-REGISTRATION.md)
- [Subscription configuration and behavior](docs/subscriptions.md)
- [Hardware setup and limitations](docs/hardware-setup.md)
