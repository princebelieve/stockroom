# Stockroom Business

Stockroom Business is an offline-first business operations app for organizations that manage products, stock, sales, customers, and staff. Its implemented stock and checkout workflows suit retail shops and supermarkets. Business templates customize product forms and wording; they do not implement every sector's operating rules. The PWA is a complete installation option; the Windows installer and Android APK are optional clients for businesses that prefer installed apps.

## What the app does

- **Inventory:** maintain products, SKUs and barcodes, categories, costs, prices, quantities, and reorder points; record stock movements and stocktakes.
- **Point of sale:** record cash, bank transfer, manually confirmed external-terminal, split, and supported wallet payments. Sales reduce stock and produce receipts. Optional checkout settings support product-specific tax rates, customer reward redemption, and separate stock locations for offline tills.
- **Customers and wallets:** keep customer records, record deposits, repayments, and withdrawals, and track balances owed or prepaid. Wallet checkout is available when enabled in the payment policy; only the owner can approve a credit purchase.
- **Supermarket operations:** supplier orders, partial delivery receiving, pack conversions, supplier returns, wastage, optional expiry tracking, delivery-based costing and audited price/barcode changes. See [supermarket workflow](docs/supermarket-workspace.md).
- **Sales operations:** review sales, receipts, payment evidence, cashier activity, and reports. Import provider CSV data for reconciliation without changing the original sales.
- **Staff and access:** owners manage admin and cashier accounts. Cashiers can be limited to POS; owners can grant additional operational access.
- **Business and device setup:** set the business name, logo, currency, payment policy, and device-specific printer or checkout settings. The device wizard records setup and test status; connected Paystack checkout uses a separate server configuration.
- **Subscriptions and referrals:** owners can manage subscription payments and share business invitations. Visitor promoters can create an account, share a tracked link, and review verified rewards in their wallet.
- **Account closure:** signed-in owners can deactivate a business and schedule cloud record deletion; visitor promoters can close their account from the promoter wallet. The developer sets the waiting period (90 days by default). Offline device copies are not remotely erased.

See [hardware setup](docs/hardware-setup.md), [subscription behavior](docs/subscriptions.md), and [PWA deployment and platform limitations](PWA-DEPLOYMENT.md) for details.

### Easy shop setup

Owners can open **Business settings → Shop setup** for a three-step wizard: choose a business template, customize fields, then preview and save. General purpose, supermarket, printing, restaurant and other presets supply a starting point. Owners can rename labels, edit placeholders, reorder fields, remove/restore optional fields, and add up to 40 custom text, number, date or dropdown inputs. Custom fields can be required. Item names, catalogue names, usual units and suggested categories remain editable. Name, unit, stock and selling price remain available for stock and sales calculations.

Upload a clear JPG, PNG or WebP screenshot/photo of an old app or printed form to read headings locally using the bundled English OCR engine. Pasted text also works. Review suggested labels and connect them to existing fields or new custom fields before applying them to the draft. This creates a starting form; it does not copy an old app's design, calculations or inventory data. No Google recognition service is required for template reading.

The saved layout drives Add Product. Custom fields are also available during product import and completed-paper-form review. Use **Product details** on an inventory row to edit custom values or view previously saved values from removed fields. Removing a field hides it; it does not erase product values. Settings and custom values save offline and synchronize across updated clients. Industry suggestions use the existing stock and sales rules; they do not add kitchen or print-production workflows.

**Print customized form** prints visible fields in the chosen order for manual entry. **Print blank product form** retains the standard F01–F10 sheet for completed-form autofill. Automatic extraction of answers from arbitrary customized layouts is not included; custom answers can be entered beside the uploaded image. Write in BLOCK / CAPITAL LETTERS for best results.

### Product autofill and migration

Use **Print blank product form** beside **Add product** on Overview or Inventory to print a reusable, one-product sheet for handwriting and photocopying. It includes the existing Add Product fields, business identity, currency and business-type unit guidance, with product values left blank. It uses the report printer/system print dialog; completed paper forms can be entered through Add product.

Owners can also use **Upload completed product form** to enter details beside a photo and save after review. **Autofill on this device** uses the bundled English OCR reader without Google, an API key or a recognition-service bill. It works best for printed text; handwriting recognition is best-effort and must be checked. Optional Google Cloud Vision recognition is also retained. Both readers fill empty fields without replacing owner entries, and failures never prevent manual completion. Write in BLOCK / CAPITAL LETTERS for best results. Form recognition requires the current marked form (F01–F10). See [handwritten form setup, workflow and validation](docs/handwritten-product-forms.md).

In Inventory, open **Add products from a photo, barcode or file** to load CSV files, scan barcodes, or read package, invoice and product-list screenshots. Uploading a package photo reads it locally and opens the actual Add Product form with the detected name and barcode filled in. Add Product also has a photo input that fills empty fields without replacing owner entries. Selling price and stock must be entered explicitly. Invoice and product-list images continue to use a multi-product review table. You can also expand **Paste text or correct the photo text** and request new suggestions from edited text. Review and complete the results before saving. PDFs currently require a screenshot of the relevant table.

Completed-paper-form uploads are in their own expandable section. Online handwriting reading appears only when Stockroom's service reports it is available; it asks for permission before sending a photo to Google. Google configuration and any associated billing are managed by the Stockroom operator, not by shop owners. Local reading and manual entry remain available without it.

Barcode lookup uses Open Food Facts for packaged food when online; it is not a universal product catalogue. Only the barcode is sent, not photos or business records. Suggestions are attributed to [Open Food Facts](https://world.openfoodfacts.org), whose database is licensed under [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Missing results and network failures leave an editable barcode row. Lookup results are cached for the current session and requests are spaced to respect provider limits.

Package names and sizes are text-based suggestions, not guaranteed image recognition. Invoice lines require owner selection; only clear, explicitly labelled unit-cost columns are extracted as cost. Ambiguous lines retain their original text for correction. Invoice quantities never become current stock automatically. The owner must enter selling price and current stock, including explicit zero where appropriate; blank cost and reorder values save as zero. Review the selling unit carefully for cartons versus individual items. Duplicate barcodes are blocked in selected rows and the loaded catalogue. Confirmed imported rows are removed immediately, so a later row failure preserves only the unfinished work. After an uncertain network failure, refresh inventory before retrying.

### Simple supermarket use and switching from another app

Product creation does not require a supplier, batch number or expiry date. Start with a name, selling unit, selling price and current stock. Supply the purchase cost for meaningful profit figures; category, barcode and reorder settings can be completed as needed. Batch identifiers are created automatically. Optional expiry fields live in an expandable section when receiving a delivery.

For an existing catalogue, use CSV import and review the rows rather than re-enter every product from photos. The importer suggests familiar columns and lets owners map any other CSV headings. Existing barcode/SKU matches are skipped by default to preserve current records. Historical sales are not fabricated from a product list; existing supplier debt or credit can be entered as a supplier opening balance. See [product migration](docs/product-migration.md) for the supported columns and a cutover checklist.

### Expenses and estimated profit

The current-month estimate is net receipt revenue excluding checkout tax, minus net captured sold-stock costs, dated running expenses, recorded wastage, costed stock shortages and closed-register cash shortages, plus cash surplus. A negative result is a loss. Purchases remaining in stock are valued separately. Approved stock-count shortages and manual reductions capture the removed stock cost and deduct it from profit. Closed-register cash shortages are deducted and surplus is added. Zero or missing goods costs trigger a report warning; entering a new cost does not rewrite historical sale costs. See [report calculations and limits](docs/report-calculations.md).

## Offline work and synchronization

Each client keeps its own local database:

- **Windows desktop:** SQLite managed by the desktop app.
- **Browser/PWA:** SQLite stored in IndexedDB for that browser profile. Installing the PWA is optional; a browser tab uses the same profile workspace.
- **Android:** native SQLite on the device.

A new business can register in the PWA while online. New devices and browser profiles need internet for enrollment, initial sign-in, and download of business data. After setup, the saved workspace can reopen offline. Local sales and other supported changes are saved on the device first and queued for synchronization. Use **Sync now** when online to upload queued work; **Refresh** downloads cloud changes without discarding local work. Sync regularly, especially before changing or clearing browser/device storage.

Each browser profile or installed client is connected to one business at a time. For a new browser/PWA, staff can use the business-specific sign-in link shown to the owner in **Team management**, then sign in with their own username and password. The link identifies the business; it does not replace staff credentials. Each browser profile has separate storage and must download its own workspace.

Offline availability depends on data already downloaded and locally cached. New sign-ins, initial downloads, adding devices, cloud staff administration, subscription actions, and synchronization require internet. Some features also depend on platform hardware or operating-system services.

## Platform differences and limitations

- **PWA:** supports browser-based inventory, POS, customers, expenses, reports, stocktakes, team functions, and sync, with some platform-specific limitations. Receipts use browser printing; external terminal payments use manual confirmation or configured Paystack checkout. See the PWA guide for the current feature list and known limitations.
- **Windows:** runs a local app service and SQLite database. Printer access uses installed Windows printer queues. The customer display and filesystem backup features are desktop-only.
- **Android:** uses Capacitor and native SQLite. Printing opens Android's system print dialog and depends on a compatible print service.
- **Payment terminals:** [connected Paystack Terminal](docs/paystack-terminal.md) is implemented for configured businesses. Other external terminals use staff confirmation from the provider's receipt or reference. OCR can suggest a reference from a receipt photo, but staff must verify payment status, amount, and currency.
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
