# Stockroom Business

Stockroom Business is an offline-first business operations app for organizations that manage products, stock, sales, customers, and staff. Its five selling workspaces cover stocked product sales, measured oil sales, non-stock payments and service jobs, counter-service orders, and restaurant/table billing. Business templates customize product forms and wording; they do not implement every sector's operating rules. The PWA is a complete installation option; the Windows installer and Android APK are optional clients for businesses that prefer installed apps.

## What the app does

- **Navigation and appearance:** related sidebar menus, tool search, a searchable guide with Previous/Next topics, consistent support access, and owner logo-derived or manually chosen brand colours. Customer portals use the business's public branding. Local reports include sales bars, payment-method doughnuts, product quantities and expense charts with accompanying tables. Catalogue, customer and receipt lists offer relevant search and sorting controls.

- **Inventory:** maintain products, SKUs and barcodes, categories, costs, prices, quantities, and reorder points; record stock movements and stocktakes.
- **Point of sale:** record cash, bank transfer, manually confirmed external-terminal, split, and supported wallet payments. Sales reduce stock and produce receipts. Optional checkout settings support product-specific tax rates, customer reward redemption, and separate stock locations for offline tills.
- **Oil sales:** sell oil by measured quantity or configured container with saved bulk thresholds and customer-specific prices. It is a separate workspace for oil businesses and does not control pumps or meters. See [workspace selection](docs/workspaces.md#oil-sales) and [pricing instructions](docs/user-guide.md#product-and-oil-sales-retail-bulk-and-customer-prices).
- **Payments & receipts:** record descriptive items and immediate full payment without changing stock. Its Church collections tab tracks funds, donor identities, pledges, contributions, refund-adjusted totals and donor statements. Its optional Jobs & invoices tab supports estimates, service progress, deposits, split payments, balance payments, refunds, search, overdue filters and branch invoice customer statements. Issued jobs can record stock materials used and their captured costs. Saved service prices are reusable; immediate payments also support owner-enabled customer wallets. See [Payments & receipts](docs/payments-and-receipts.md).
- **Order counter:** an owner-enabled workspace for menu orders, extras, preparation, full settlement and handover. Recipes consume ingredients when preparation starts; prepared items without recipes have no tracked ingredient consumption. Linked packaged goods deduct stock when paid. Dining options and mixed payments are supported. Owners/admins can preview and copy menu offerings, extras and recipes between enabled takeaway and restaurant workspaces, then edit them independently. Owners/admins can record advance food batches, actual yields, finished-stock costs and expiry. See [Order counter](docs/fast-food-workspace.md).
- **Tables & tabs:** a separate restaurant/bar workspace with reservations, tables, seats, named tabs, repeated rounds, kitchen/bar progress, partial bill settlement, moves, merges and refunds. Ingredients and packaged goods consume stock at preparation; settlement uses the original till. See [Tables & tabs](docs/restaurant-and-bar-workspace.md).
- **Kitchen/bar printers and till recovery:** Windows can route preparation tickets locally or handle a designated branch queue for synchronized orders from other devices, with explicit retry of uncertain output. Owners can retire a lost device and restore its original checkout identity on an enrolled replacement after reconciling unsynchronized work. See [hardware setup](docs/hardware-setup.md).
- **QR food ordering:** customers can submit guest orders using their pickup name. Staff accept an order on one till before preparing or taking payment. Owner-configured bank details appear on the QR menu. Optional delivery collects address/phone, captures fixed or area-based charges and records agent assignment, dispatch and completion. Bank transfer references require staff verification; customer wallet sign-in remains optional. Customer entry and acceptance require internet and synchronized menus/devices. See [Fast food](docs/fast-food-workspace.md).
- **Windows backups:** owner-only encrypted downloads, daily backups to a chosen folder, and validated restore across supported additive schema updates that preserves current staff access. Product export fees remain controlled by developer settings.
- **Customers and wallets:** keep customer records, record deposits, repayments, and withdrawals, and track balances owed or prepaid. Wallet checkout is available when enabled in the payment policy; only the owner can approve a credit purchase.
- **Supermarket operations:** supplier orders, partial delivery receiving, pack conversions, supplier returns, wastage, optional expiry tracking, delivery-based costing and audited price/barcode changes. See [supermarket workflow](docs/supermarket-workspace.md).
- **Sales operations:** review sales, receipts, payment evidence, cashier activity, and reports. Import provider/bank CSV data for reconciliation of external POS, transfers and split-payment portions, with missing/duplicate/reference/amount exceptions, without changing original sales.
- **Staff and access:** owners manage admin and cashier accounts, including Remove staff to revoke access while retaining sales and activity history. Owners choose individual selling and operational access checkboxes for each admin or cashier. New staff need access granted before operating; existing staff retain their previous access until the owner saves a selection. Staff continue to use their own login.
- **Business and device setup:** set the business name, logo, currency, payment policy, and device-specific printer or checkout settings. Owners choose a synchronized reporting timezone under Business settings > Workspaces; existing businesses default to UTC. The device wizard records setup and test status; connected Paystack checkout uses a separate server configuration.
- **Subscriptions and referrals:** owners can manage subscription payments and share business invitations. Visitor promoters can create an account, share a tracked link, and review verified rewards in their wallet.
- **Account closure:** owners can close the business; staff have no account-deletion control; visitor promoters can close their promoter account. The waiting period defaults to 14 days. Offline device copies are not remotely erased. The confirmation screen explains the effects and offers Cancel and a red confirmation button.

Support: [support@sbi.globalcreest.com](mailto:support@sbi.globalcreest.com), [info@sbi.globalcreest.com](mailto:info@sbi.globalcreest.com), [WhatsApp +234 703 392 8277](https://wa.me/2347033928277). The owner confirmed real transactions using XPrinter DKT-M81, HP LaserJet P1102 (HP 85A / CE285A toner) and a model 8120 2D barcode scanner. Connection and test records can be retained through Devices. Public Features, Workspaces, Devices, Getting Started, Downloads, Referrals and Support pages explain the current product through shared navigation.

See [hardware setup](docs/hardware-setup.md), [subscription behavior](docs/subscriptions.md), and [PWA deployment and platform limitations](PWA-DEPLOYMENT.md) for details.

### Easy shop setup

Owners can open **Business settings > Workspaces** for a three-step wizard: choose a business template, customize fields, then preview and save. General purpose, supermarket, printing, restaurant and other presets supply a starting point. Owners can rename labels, edit placeholders, reorder fields, remove/restore optional fields, and add up to 40 custom text, number, date or dropdown inputs. Custom fields can be required. Item names, catalogue names, usual units and suggested categories remain editable. Name, unit, stock and selling price remain available for stock and sales calculations.

Upload a clear JPG, PNG or WebP screenshot/photo of an old app or printed form to read headings locally using the bundled English OCR engine. Pasted text also works. Review suggested labels and connect them to existing fields or new custom fields before applying them to the draft. This creates a starting form; it does not copy an old app's design, calculations or inventory data. No Google recognition service is required for template reading.

The saved layout drives Add Product. Custom fields are also available during product import and completed-paper-form review. Use **Product details** on an inventory row to edit custom values or view previously saved values from removed fields. Removing a field hides it; it does not erase product values. Settings and custom values save offline and synchronize across updated clients. Industry suggestions use the existing stock and sales rules. Hotel, pharmacy, agriculture and other catalogue choices describe goods, not complete sector management systems. See the [sector scope](docs/workspaces.md#sector-scope). Configure recipes, food batches and job materials in their dedicated workspaces; a catalogue template alone does not set up those operations.

**Print customized form** prints visible fields in the chosen order for manual entry. **Print blank product form** retains the standard F01–F10 sheet for completed-form autofill. Automatic extraction of answers from arbitrary customized layouts is not included; custom answers can be entered beside the uploaded image. Write in BLOCK / CAPITAL LETTERS for best results.

### Product autofill and migration

Use **Print blank product form** beside **Add product** on Overview or Inventory to print a reusable, one-product sheet for handwriting and photocopying. It includes the existing Add Product fields, business identity, currency and business-type unit guidance, with product values left blank. It uses the report printer/system print dialog; completed paper forms can be entered through Add product.

Owners can also use **Upload completed product form** to enter details beside a photo and save after review. **Autofill on this device** uses the bundled English OCR reader without Google, an API key or a recognition-service bill. It works best for printed text; handwriting recognition is best-effort and must be checked. Optional Google Cloud Vision recognition is also retained. Both readers fill empty fields without replacing owner entries, and failures never prevent manual completion. Write in BLOCK / CAPITAL LETTERS for best results. Form recognition requires the current marked form (F01–F10). See [handwritten form setup, workflow and validation](docs/handwritten-product-forms.md).

In Inventory, open **Add products from a photo, barcode or file** to load CSV files, scan barcodes, or read package, invoice and product-list screenshots. Uploading a package photo reads it locally and opens the actual Add Product form with the detected name and barcode filled in. Add Product also has a photo input that fills empty fields without replacing owner entries. Selling price and stock must be entered explicitly. Invoice and product-list images continue to use a multi-product review table. You can also expand **Paste text or correct the photo text** and request new suggestions from edited text. Review and complete the results before saving. PDFs currently require a screenshot of the relevant table.

Completed-paper-form uploads are in their own expandable section. Online handwriting reading appears only when Stockroom's service reports it is available; it asks for permission before sending a photo to Google. Google configuration and any associated billing are managed by the Stockroom operator, not by shop owners. Local reading and manual entry remain available without it.

Barcode lookup uses Open Food Facts for packaged food when online; it is not a universal product catalogue. Only the barcode is sent, not photos or business records. Suggestions are attributed to [Open Food Facts](https://world.openfoodfacts.org), whose database is licensed under [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Missing results and network failures leave an editable barcode row. Lookup results are cached for the current session and requests are spaced to respect provider limits.

Every selling workspace also has searchable generic starter suggestions for product names, service descriptions or menu items. They are editable prompts rather than a bundled supplier catalogue: they contain no assigned GTIN barcodes, market prices, costs or opening stock. Owners review entries and add their own business details. The former `public/stockroom_comprehensive_products.csv` was removed because it contained unverified sample prices and stock and no barcodes.

Package names and sizes are text-based suggestions, not guaranteed image recognition. Invoice lines require owner selection; only clear, explicitly labelled unit-cost columns are extracted as cost. Ambiguous lines retain their original text for correction. Invoice quantities never become current stock automatically. The owner must enter selling price and current stock, including explicit zero where appropriate; blank cost and reorder values save as zero. Review the selling unit carefully for cartons versus individual items. Duplicate barcodes are blocked in selected rows and the loaded catalogue. Confirmed imported rows are removed immediately, so a later row failure preserves only the unfinished work. After an uncertain network failure, refresh inventory before retrying.

### Simple supermarket use and switching from another app

Product creation does not require a supplier, batch number or expiry date. Start with a name, selling unit, selling price and current stock. Supply the purchase cost for meaningful profit figures; category, barcode and reorder settings can be completed as needed. Batch identifiers are created automatically. Optional expiry fields live in an expandable section when receiving a delivery.

For an existing catalogue, use CSV import and review the rows rather than re-enter every product from photos. The importer suggests familiar columns and lets owners map any other CSV headings. Existing barcode/SKU matches are skipped by default to preserve current records. Historical sales are not fabricated from a product list; existing supplier debt or credit can be entered as a supplier opening balance. See [product migration](docs/product-migration.md) for the supported columns and a cutover checklist.

### Expenses and estimated profit

The current-month estimate is net receipt revenue excluding checkout tax, minus net captured sold-stock and consumed recipe-ingredient and used job-material costs, dated running expenses, recorded wastage, costed stock shortages and closed-register cash shortages, plus cash surplus. A negative result is a loss. Purchases remaining in stock are valued separately. Approved stock-count shortages and manual reductions capture the removed stock cost and deduct it from profit. Closed-register cash shortages are deducted and surplus is added. Zero or missing goods costs trigger a report warning; entering a new cost does not rewrite historical sale costs. See [report calculations and limits](docs/report-calculations.md).

## Offline work and synchronization

Each client keeps its own local database:

- **Windows desktop:** SQLite managed by the desktop app.
- **Browser/PWA:** SQLite stored in IndexedDB for that browser profile. Installing the PWA is optional; a browser tab uses the same profile workspace.
- **Android:** native SQLite on the device.

A new business can register in the PWA while online. New devices and browser profiles need internet for enrollment, initial sign-in, and download of business data. After setup, the saved workspace can reopen offline. Local sales and other supported changes are saved on the device first and queued for synchronization. Use **Sync now** when online to upload queued work; **Refresh** downloads cloud changes without discarding local work. Sync regularly, especially before changing or clearing browser/device storage.

Each browser profile or installed client is connected to one business at a time. For a new browser/PWA, staff can use the business-specific sign-in link shown to the owner in **Staff & access**, then sign in with their own username and password. The link identifies the business; it does not replace staff credentials. Each browser profile has separate storage and must download its own workspace.

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

Requirements: Node.js 22.13 or newer (the desktop/local API uses built-in SQLite) and npm. Install dependencies and start Vite. For standard-mode development, also start `npm run api` in another terminal; Vite proxies `/api` to port 8787. For browser/PWA development, use `npm run dev -- --mode pwa` instead.

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
- [Owner and cashier guide](docs/user-guide.md)
- [Workspace selection](docs/workspaces.md)
- [Documentation alignment review](docs/documentation-alignment.md)

Product sales and Oil sales share owner/admin-configured bulk thresholds and customer-specific prices under **Inventory > Product price tiers** (labelled **Oil price tiers** for oil businesses). Thresholds use the combined base-unit quantity of the same product. Customer rates override qualifying bulk rates; explicit manual prices take priority. Saved receipts and refunds retain the original sale prices. Service charges and food-menu prices are configured separately. See [pricing instructions](docs/user-guide.md#product-and-oil-sales-retail-bulk-and-customer-prices).

Weighed-goods checkout supports reviewed keyboard-output readings and configurable EAN-13 gram-weight labels for kg stock products. Set up each checkout under **Business settings > Devices > Weighed goods hardware**. See [supported output formats and physical acceptance checks](docs/hardware-setup.md#weighed-goods); model-specific serial/live scale integrations require separate work.

Owners can enable online retail ordering in Business settings, select products to publish and share the retail customer link. Staff use Online retail orders for acceptance, picking, payment and handover. Stock is deducted on payment, not when a customer requests an order. Existing food ordering is retained. Customer birthday reminders reuse the notification centre and push channels; local reminders and birthday edits remain available offline. The owner guide includes a saved setup checklist, setup/training support contacts and Gmail support requests with offline drafts and persistent references. Supplier/manufacturer CSVs can also be saved as a separate offline reference catalogue (up to 100,000 rows per import), searchable by barcode or name prefix without importing prices, costs or stock. Barcode lookup covers the Open Facts product databases with a 30-day local suggestion cache; it does not replace saved products or supply prices and opening stock.
