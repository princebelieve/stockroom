# Choosing and using a workspace

Workspace selection and Overview include familiar examples: Product sales for supermarkets, mini-marts and retail shops; Payments & receipts for printing presses, church offices and service businesses; Order counter for fast food, cafes and takeaways; Tables & tabs for restaurants, bars and lounges. These are examples, not restrictions. Daily transaction screens retain the short workflow names. Choose by the way the business takes a sale, rather than its industry. Owners enable the required screens under Business settings > Workspaces. A business can enable more than one. Configuration stays in Business settings and product management; cashiers use the transaction screens.

| Workspace | Use it when | Everyday flow |
| --- | --- | --- |
| Product sales | You sell stocked products | Scan or choose products, review the basket, take payment, print the receipt. |
| Payments & receipts | You record payment for descriptions entered by staff, without changing stock | Enter descriptions, quantities and unit prices, choose payment method, save and print. |
| Order counter | You sell from a configured menu and track preparation and collection | Build an order, send and take payment (or collect payment later), follow preparation and hand over. |
| Tables & tabs | Customers have open bills with repeated orders | Choose a table or named tab, add rounds, take payment, close the bill when items are served and paid. |

## Product sales

Open Product sales in Daily work. Scan or tap products to add them to the basket. Change quantities in the basket and select Take payment. Customer selection, discounts and notes are under Customer, discount and note (optional); applied amounts remain visible in the totals. Choose Cash, POS, Transfer or another owner-enabled method. Manual POS payment keeps the provider, receipt reference, reference scanner and receipt photo controls. The connected Paystack POS has its own send/verification controls. Complete sale records the sale and issues its receipt. The existing customer display follows this basket.

## Payments & receipts

Start with the receipt items. Add another item for each description and quantity paid for. Customer name, phone and transaction type are under Customer and receipt details (optional). Choose the payment method and save. Print or share the saved receipt. Payment history is a separate view. These entries never deduct stock. Jobs & invoices is a separate optional tab for estimates, work progress, deposits and balance payments; see [Payments & receipts](payments-and-receipts.md).

## Order counter

Choose menu items, quantity and any extras, then add them to the order. The order lines and total are the focus. Customer account, name and preparation note are under Customer and order details (optional). Send and take payment opens payment for the saved order. Send for preparation saves it for later payment. Payment entry hides the order queue; Close payment returns to it. Preparation tracks progress, while Orders offers payment and handover. Corrections, cancellation and refunds are under Order actions. Existing reasons, permissions and consumed-stock safeguards still apply.

## Tables & tabs

Choose a table or open a named tab, then add orders to its bill. Take payment opens the bill payment form and hides new-order entry while paying. Whole-bill payment is the starting choice; seat, item and shared-payment choices remain available. Print the saved receipt. Close bill and free table becomes available once the bill is paid and all items are served or cancelled. Moving and merging bills are under Bill actions.

## Setup and other daily work

Owners configure Business, Workspaces and Sales. Owners and admins configure Receipts, Devices and enabled menus/recipes/tables where existing permissions allow it. Product variants and extras are under product management. Cash register has its own daily-work screen for opening cash, movements and closing counts. Sales history contains receipt records, customer history and authorised returns.

These names describe workflows, not full industry packages. Order counter still uses the existing menu/preparation model; Tables & tabs manages open bills, not hotel reservations or club memberships. Validate the four workflows with real staff and hardware before adding another sector.

## Visual guidance

Product sales uses green, Payments & receipts blue, Order counter orange and Tables & tabs purple. Overview pairs icons and business examples with compact totals and a single start action. Routine instructions are available under Help. Order statuses retain text labels beside colour; table tiles display Free or Open bill. Errors, payment confirmations and empty-screen guidance remain visible. Detailed cost information is available under Cost details rather than competing with payment actions.

## Business presets

Owners can open Business settings > Workspaces > Start with your business, choose a preset and preview it. Apply preset and start selling saves the workspace choice and opens its selling screen. Retail/supermarket uses Product sales; printing/services uses Payments & receipts; takeaway uses Order counter; restaurant/bar uses Tables & tabs.

Applying a preset hides other selling screens without deleting their records. Existing product fields and custom catalogue configuration are retained. Menu items, recipes, tables, receipts, payment settings, devices and branding are not replaced. Add actual menu items/prices or tables in the relevant settings tab. Extra workspaces can be enabled below the preset chooser. Sharing settings with other devices still uses Sync now. Presets do not implement hotel bookings or other sector-specific operations.

## Payments and data updates

Payment Method offers Cash, POS Terminal and Bank Transfer where supported. POS provider choices come from the ordered selections in Business settings. The first selected provider is the default; removing it promotes the next selected provider. Cashiers can choose another selected provider. Device configuration does not override this list.

Refresh downloads business updates and reloads selling data without uploading queued local work. Desktop offline product creations, stock adjustments and sales are overlaid on the downloaded catalogue; pending settings remain local. Refresh leaves baskets and order/payment drafts open. Sync now uploads pending changes and downloads updates; it has not been changed to upload-only. Cloud changes made offline on another device cannot be downloaded until that device uploads them.

## Reporting timezone

Owners set **Business settings > Workspaces > Reporting timezone**, save, then use **Sync now** to share the setting. Choose an IANA timezone such as `Africa/Lagos`; businesses without a saved choice default to UTC. Reports and their expired-stock summary use the business calendar across updated devices. See [report calculations](report-calculations.md).

## Sector scope

Business presets choose selling screens; catalogue templates suggest labels, categories and units. Neither creates a complete industry system. Configure real items, prices, stock, recipes, materials, tables and devices where needed.

| Business | Implemented daily work | Additional specialist work outside this scope |
| --- | --- | --- |
| Retail and supermarket | Stock checkout, returns, supplier operations, cash shifts; configured keyboard weights and gram labels | Model-specific live scale protocols; actual hardware still needs a pilot |
| Wholesale/retail oil | Measured and container sales, bulk thresholds and customer rates | Automatic pump/meter integration |
| Services and printing | Receipts, reusable prices, estimates, jobs, invoices, deposits, statements and recorded job materials/costs | Appointments, print-machine metering and automatic material use merely from issuing a receipt |
| Church office | Funds, donors, pledges, received contributions, refunds and statements | Fund spending, general ledger and full charity accounts |
| Fast food, bakery and food goods | Orders, recipes and optional single-output batches, actual yield and captured costs | Production scheduling, multi-output manufacturing and agricultural processing |
| Restaurant and bar | Tables, tabs, rounds, preparation, partial settlement and table reservations | Reservation deposits, admission and memberships |
| Hotel and hospitality supplies | Stock sales and payment receipts | Rooms, stays, occupancy, accommodation billing, event bookings and rentals |
| Pharmacy stock | Stock checkout and optional delivery batch/expiry records | Prescriptions and dispensing |
| Clothing, electronics, furniture, books, stationery, building supplies, automotive and other goods | Catalogue, stock and checkout; optional configured variants and service jobs | Serial-number histories, warranty management, rentals and specialist installation/repair management |
| Agriculture and farm supplies | Produce, feed and farm-input stock sales | Crop cycles, livestock management and processing |

A selected label is not evidence of specialist support. Check the relevant workspace guide and complete a supervised trading day with the intended devices before adoption.
