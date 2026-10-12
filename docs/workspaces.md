# Choosing and using a workspace

Stockroom has five selling workspaces: Product sales, Oil sales, Payments & receipts, Order counter, and Tables & tabs. A **business type** describes what kind of business this is and guides catalogue suggestions. A **workspace** is an enabled area where staff do a specific kind of work. A business type does not enable a workspace, and labels such as “Oil inventory” only change displayed wording. Owners choose available workspaces separately in Business settings > Available workspaces. Product sales is for stocked goods; Oil sales is for measured oil and containers; Payments & receipts records service payments without changing stock; Order counter handles menu orders; Tables & tabs handles open bills. These examples do not restrict combinations.

| Workspace | Use it when | Everyday flow |
| --- | --- | --- |
| Product sales | You sell stocked products | Scan or choose products, review the basket, take payment, print the receipt. |
| Oil sales | You sell oil by measured quantity or configured container | Choose or scan oil products, enter quantity, apply configured customer or bulk rates, and complete the sale. |
| Payments & receipts | You record payment for descriptions entered by staff, without changing stock | Enter descriptions, quantities and unit prices, choose payment method, save and print. |
| Order counter | You sell from a configured menu and track preparation and collection | Build an order, send and take payment (or collect payment later), follow preparation and hand over. |
| Tables & tabs | Customers have open bills with repeated orders | Choose a table or named tab, add rounds, take payment, close the bill when items are served and paid. |

## Product sales

Open Product sales in Daily work. Scan or tap products to add them to the basket. Change quantities in the basket and select Take payment. Customer selection, discounts and notes are under Customer, discount and note (optional); applied amounts remain visible in the totals. Choose Cash, POS, Transfer or another owner-enabled method. Manual POS payment keeps the provider, receipt reference, reference scanner and receipt photo controls. The connected Paystack POS has its own send/verification controls. Complete sale records the sale and issues its receipt. The existing customer display follows this basket.

## Oil sales

Oil sales is a standalone workspace for measured quantities and configured containers, with saved bulk and customer pricing rules. It can be enabled with any business type and alongside other workspaces. Choose it under Business settings > Available workspaces. A business type may guide catalogue suggestions, but does not turn this workspace on or off.

## Payments & receipts

Start with the receipt items. Add another item for each description and quantity paid for. Customer name, phone and transaction type are under Customer and receipt details (optional). Choose the payment method and save. Print or share the saved receipt. Payment history is a separate view. These entries never deduct stock. Jobs & invoices is a separate optional tab for estimates, work progress, deposits and balance payments; see [Payments & receipts](payments-and-receipts.md).

## Order counter

Choose menu items, quantity and any extras, then add them to the order. The order lines and total are the focus. Customer account, name and preparation note are under Customer and order details (optional). Send and take payment opens payment for the saved order. Send for preparation saves it for later payment. Payment entry hides the order queue; Close payment returns to it. Preparation tracks progress, while Orders offers payment and handover. Corrections, cancellation and refunds are under Order actions. Existing reasons, permissions and consumed-stock safeguards still apply.

## Tables & tabs

Choose a table or open a named tab, then add orders to its bill. Take payment opens the bill payment form and hides new-order entry while paying. Whole-bill payment is the starting choice; seat, item and shared-payment choices remain available. Print the saved receipt. Close bill and free table becomes available once the bill is paid and all items are served or cancelled. Moving and merging bills are under Bill actions.

## Setup and other daily work

Owners configure Business, Workspaces and Sales. Owners and admins configure Receipts, Devices and enabled menus/recipes/tables where existing permissions allow it. Product variants and extras are under product management. Cash register has its own daily-work screen for opening cash, movements and closing counts. Sales history contains receipt records, customer history and authorised returns.

### Start from workspace suggestions

During first-time setup, choose the business type and selling workspace separately, search suggested names, select what the business sells, review and confirm. The selected workspace is enabled; other workspaces can be enabled later in Business settings. Product entries are saved with generated SKUs, no barcode, and zero opening stock, cost and selling price. Set actual values before selling. Service descriptions and menu items are saved at zero price; menu items start unavailable. You can skip the catalogue step, change the selection before saving, or add and edit entries later. Use the **Starter products** task in Inventory to add further product suggestions. Business settings does not contain a second starter catalogue task.

The starter lists offer broad, editable name suggestions in all five selling workspaces. Each stock business type has common retail goods plus relevant specialist names; Oil sales includes oil products and handling supplies. Payments & receipts offers reusable service descriptions, while Order counter and Tables & tabs offer food, drink, snack and meal ideas. The lists are name suggestions, not a supplier/manufacturer feed: they do not contain GTIN barcodes, prices, costs, opening stock or verified package specifications. A barcode is optional; scan the code on the actual item when available. Stockroom generates an SKU when a saved product has no SKU. Review each entry and set the business's real details. Adding a starter does not replace existing entries.

Starter names are generic and unbranded. Their coverage was informed by public grocery category groupings and Nigerian grocery and menu examples, including [Jumia Nigeria grocery categories](https://www.jumia.com.ng/groceries/), a [Nigerian grocery checklist](https://www.diasporagroceryhub.com/blog/nigerian-grocery-items-list), and publicly listed [Nigerian restaurant menu groupings](https://tantalizersng.com/listing). These references help identify common kinds of offerings; they do not provide this app with supplier-confirmed barcodes, exact variants, prices or stock.

### Configure category and unit dropdowns

Owners open **Business settings > Workspace catalogues**, choose Product sales, Oil sales, Order counter or Tables & tabs from the centered workspace selector, and edit category and unit choices. The highlighted workspace name is reflected in the help sentence, so it is clear which list is being changed. Each stock-selling workspace saves its own lists. When staff add a product from Oil sales or Product sales, the form uses that workspace's list; inventory entry uses the primary available stock workspace. Payments & receipts records described service items and does not use product catalogue categories. **Other (please specify)** remains available; after the product or ingredient is saved, its new category or unit is added to that workspace's dropdown for future entries. Existing choices are not duplicated. Business type provides starting suggestions and does not decide which saved workspace list is used. Product form custom dropdown fields have their own choices under **Product form**.

These names describe workflows, not full industry packages. Order counter still uses the existing menu/preparation model; Tables & tabs manages open bills, not hotel reservations or club memberships. Oil sales handles oil quantities, containers and pricing; it does not integrate with pumps or meters. Validate the five selling workspaces with real staff and hardware before adding another sector.

## Visual guidance

Product sales uses green, Payments & receipts blue, Order counter orange and Tables & tabs purple. Overview pairs icons and business examples with compact totals and a single start action. Routine instructions are available under Help. Order statuses retain text labels beside colour; table tiles display Free or Open bill. Errors, payment confirmations and empty-screen guidance remain visible. Detailed cost information is available under Cost details rather than competing with payment actions.

## Business type and workspace settings

Starter setup records the business type separately from the selected workspace. For an established business, changing Business type only changes type-based defaults and suggestions; it does not silently switch workspaces or custom labels. Workspace availability has its own controls and save action.

The former “business preset” action combined business type with workspace selection, which made the concepts appear coupled. It has been removed from existing-business Settings. Existing workspace choices are saved explicitly, while older saved profiles retain their historical workspace behavior when loaded.

## Payments and data updates

Payment Method offers Cash, POS Terminal and Bank Transfer where supported. POS provider choices come from the ordered selections in Business settings. The first selected provider is the default; removing it promotes the next selected provider. Cashiers can choose another selected provider. Device configuration does not override this list.

Refresh downloads business updates and reloads selling data without uploading queued local work. Desktop offline product creations, stock adjustments and sales are overlaid on the downloaded catalogue; pending settings remain local. Refresh leaves baskets and order/payment drafts open. Sync now uploads pending changes and downloads updates; it has not been changed to upload-only. Cloud changes made offline on another device cannot be downloaded until that device uploads them.

## Reporting timezone

Owners set **Business settings > Reporting timezone**, save, then use **Sync now** to share the setting. The searchable settings task selector jumps to this focused task. Choose an IANA timezone such as `Africa/Lagos`; businesses without a saved choice default to UTC. Reports and their expired-stock summary use the business calendar across updated devices. See [report calculations](report-calculations.md).

## Sector scope

Business type guides catalogue suggestions; workspace settings enable selling screens; item and catalogue labels only change displayed wording. None of those choices creates a complete industry system. Configure real items, prices, stock, recipes, materials, tables and devices where needed.

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
