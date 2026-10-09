# Order counter workspace

For the original-versus-refactored frontend and backend comparison, rendered screenshots, verified workflows and remaining acceptance limits, see [Refactor comparison](refactor-comparison.md).

For the additional product screenshots, product cancellation/scanning fixes, settings conflict investigation and registration-email verification limit, see [Product entry and registration review](product-entry-and-registration-review.md).

Fast food is a separate, optional workspace for counter-service orders. Enabling it does not add menu or preparation controls to supermarket checkout.

Online orders also support explicitly published goods in Product sales and Oil sales workspaces. These screens use picking and fulfilment language; food ordering keeps its menu and preparation workflow. Ingredient stock alone does not enable retail online orders. Product ordering and delivery settings, customer links, navigation and staff-access choices follow the enabled workspaces. Hidden staff permissions remain saved when a workspace is disabled. Printing uses job/material permissions; church collections appear only in the services/church profile. Service bookings and online invoice requests are not currently implemented.

The workspace also includes Inventory, Purchasing, Stock count, Stock movements and stock reports for ingredients and packaged goods. Owners and administrators can receive supplier deliveries, track batch costs and expiry dates, and record wastage without enabling Product sales.

## Setup

First-time sign-in opens a skippable introduction with seven illustrated benefits: offline trading after setup; retail, oil, services, counter and table workspaces; payments/receipts; stock/purchasing; preparation; customer/supplier balances; and sales/cost/staff visibility. Each screen has one caption. Select **Explore what Stockroom can do** on the sign-in screen to replay it. The full capability and expectation review is in [Product capabilities and user expectations](product-capabilities-and-expectations.md).

Owner registration progresses through business details, account details and review; Back retains entered values. After branch selection, new owners choose the business type and selling workspace separately, then search and select matching starter products, services or menu items before reviewing and confirming. Oil sales is available for the oil business type and remains enabled alongside the selected workspace. Product starters are saved with generated SKUs, no barcode, and zero price, cost and opening stock; update these before trading. Service and menu starters use zero prices; menu items start unavailable. Owners can skip this step or edit entries later. Currency, timezone and payment provider are configured alongside setup. Setup can be postponed. Existing businesses enter their saved workspace directly. Reopen setup through **Help > Open the user guide > Set up my workspace**. Add products, a menu, staff and devices as needed.

Desktop keeps a persistent sidebar and a workspace that uses the available width. Phones and smaller tablets use the Menu drawer. Operational screens use a white canvas; **Choose screen**, **Order screen** or **Restaurant screen** selects one task within that area. Inventory opens the product list, while supply records, new supply, suppliers, transfers, imports and stock costs have separate screens. Customer and staff creation, expenses and receipt tasks are also separate from their lists.

The mobile drawer opens without focusing a text field. It has no tool-search box, scrolls independently, and blocks touches to the workspace until dismissed. Desktop keeps tool search. Sync controls are inside the mobile drawer rather than floating over business records. Waiting setup/settings changes are identified separately from business activity; a connection error does not mean a sale occurred or remove saved changes.

Desktop **Log out** stays beside Help at the sidebar bottom. For the investigated cloud fetch failure and deployment requirement, see [Sync connectivity review](sync-connectivity-review.md).

A new business shows empty placeholders until records are created. Empty products, supplies, receipts, customers, stock counts, stock movements, sales reports, order queues and tables explain the action that will populate them. No sample transactions or inventory are created for these placeholders. Screenshots from an isolated fresh-business browser check are saved under [screenshots](screenshots/).

Select **Help & support > Help for this screen** for contextual instructions. Routine instructions stay out of working screens; errors, payment confirmations and destructive-action warnings remain visible when needed. Close Help with **Close** or Escape.

Subscription reminders do not occupy operational screens or appear as a permanent sidebar badge. Expired selling access shows a short prompt and **Open subscription** on selling screens. Inventory, customer records, sales history, reports, settings and Help remain available. Grace-period access continues without a banner; subscription details are available on the dedicated Subscription page.

Open **Business settings > Workspaces**:

- Choose **Order counter only** under **Payment screens** for a dedicated workspace.
- To keep stock checkout or payment entry as well, choose those screens and check **Enable separate Order counter**.
- To combine Order counter and Tables & tabs, choose the appropriate **Payment screens** selection and enable both separate workspace checkboxes. For oil businesses, Oil sales remains available while Product sales and Payments & receipts can be enabled in **Customise workspaces (optional)**.
- Click **Save workspaces**. Use **Sync now** to share the setting with other devices.

Open **Business settings > Food menu & recipes > Menu**. Owners and admins can search workspace-specific starter menu ideas, then add and edit menu items, prices and optional priced extras. Starters are suggestions only: new entries begin unavailable and at zero price until reviewed. Turn off **Available to order** when an item is unavailable.

## Customer portal orders

Share the business customer link or QR code from Business settings. For food/restaurant workspaces, customers can enter their pickup name and continue as guests without an account. Owners/admins can also create a sign-in from a customer's Wallet account for wallet activity and ordering. Guest sessions cannot use customer wallets. Submitted orders await staff acceptance; in Orders, review availability and select **Accept on this till**, then synchronize. Acceptance requires internet and assigns one checkout till for payment and ingredient preparation. Another till cannot accept the same order. Customers see acceptance and preparation progress; tracking refreshes every fifteen seconds while connected. Guest tracking stays with that browser session for up to 24 hours.

Online checkout currently supports pay-at-pickup, a bank transfer claim, or a wallet payment request. A bank transfer reference is not verified automatically: staff must confirm funds and record payment in the order queue. A wallet request does not reserve or debit funds at submission; staff confirm and record the charge against the customer's wallet from the order's payment screen. This keeps the wallet charge in the business's normal local accounting and sync flow.

The portal caches its last loaded account and menu on the customer device and saves the basket locally, so those can be viewed or edited offline. Submitting an order, signing in on a new session, and getting fresh order status require internet. Checkout shows applicable tax; changed prices/tax require a refresh. If the submission reply is lost, Retry saved order resends the same request ID and contents. New customer orders enter the cloud queue and reach business devices when they synchronize; staff can still take local orders and record wallet payments while offline, with their changes syncing later. A bank transfer claim and payment confirmation still need staff review.

Choose **Prepared food or drinks** for meals made to order. They require no linked finished-product inventory record. Configured recipes deduct raw ingredients when preparation starts; prepared items without recipes do not consume tracked stock. Choose **Stocked goods - deduct stock** for bottled drinks, produced portions or other stocked goods and link an existing product. **Packaged stock** lets owners/admins create and restock packaged products within this workspace. Restocking there is a stock adjustment at the product's saved cost; it is not a supplier invoice or payment.

## Daily operation

1. **New order:** choose items, quantities and extras. Add an optional customer name and preparation note, then **Send for preparation**.
2. **Preparation:** accepted orders enter the queue. Filter by All stations, Kitchen or Bar to focus on the relevant items. Staff use **Start preparing**, then **Mark ready**.
3. **Orders:** use **Take payment** on the till that created the order. Record cash, bank transfer or an externally confirmed terminal payment. Print or share the linked receipt.
4. **Hand over:** once the order is Ready and its payment has been saved, mark it Collected. It remains in collected-order history.

Payment can be recorded before or during preparation. Its state is separate from preparation progress. The order number appears on its receipt; payment retries use one receipt ID for that order. A retry with different payment details is rejected.

Submitted orders retain their item names, options, quantities, prices, tax, discounts, rewards, business identity and currency. Later menu or settings edits do not change them. **Correct order** can replace an unpaid Queued order on its original till; the correction must include a reason and retains the previous items and amount in its history. Once preparation or payment has started, refund/cancel as appropriate and create a new order instead. Drafts are saved per business, staff member and branch and restore after a reload.

Creating an order does not deduct or reserve stock. **Start preparing** deducts saved recipe ingredients once; **Save order payment** deducts linked packaged goods once. Insufficient or expired ingredient stock blocks preparation, and insufficient packaged stock blocks payment. Prepared items without a recipe do not consume ingredients.

## Devices and recovery

Orders, progress changes, receipts and their outbound sync records persist locally. The workspace refreshes local order data every five seconds. **Sync orders** uploads local changes and downloads changes from other devices; it requires configured cloud synchronization and a connection. Saving orders, progress, menu changes and packaged-stock changes also attempts synchronization through the existing backend. If synchronization fails, saved local changes remain queued for retry. Printing receipts works locally. Sending an email receipt uses the existing online receipt service and synchronizes first.

Take payment on the original till, or the accepting till for online orders. For orders with recipes, start preparation on that same till so separate offline devices cannot consume the same order twice. Another synchronized device can display the queue and mark an already-preparing order Ready or Collected. Orders without recipes keep their existing preparation controls. Updates carry an expected revision, so stale local edits are rejected. Rejected edits remain in the sync-conflict log; the accepted cloud order/menu version is restored when returned by the cloud. Offline devices do not provide exclusive ownership of a shared preparation queue. An owner/admin should review **Sync issues** before relying on a conflicted order.

Here, "cloud server" means the project's existing Stockroom synchronization backend (`cloud/index.mjs`), currently configured with a Render address. This workspace adds no hosting provider, paid synchronization service or subscription. The desktop server also retains its existing background synchronization worker, which runs every 30 seconds. The explicit sync buttons remain available. These changes do not establish the hosting account's pricing or usage limits.

The existing synchronization server and all participating apps must be updated before using QR ordering. Older clients are blocked from downloading online orders because they lack the till acceptance safeguard. Capability checks hold Fast food uploads on the device until the cloud supports them, and prevent older apps from consuming Fast food records and settings. Ordinary supermarket synchronization retains its existing protocol. The cloud changes in this repository must be deployed before using Fast food across devices.

The owner can recover a lost or broken checkout under **Business settings > Devices > Lost or broken till recovery**. Enroll a replacement with a different device ID, synchronize all its changes and resolve conflicts, then load recoverable tills. Finish or cancel its active work first. Select the lost checkout, enter the owner password, confirm that the source device is stopped and unsynchronized payments/preparation/stock have been reconciled, and type RECOVER. Recovery permanently retires the source device cloud access and assigns its checkout identity to the replacement, preserving receipt, bill, job and consumption IDs. The replacement downloads the latest synchronized history and reloads. If interrupted, resume the same saved request. Work that never reached the cloud must be reconciled manually. Original hardware must stay stopped; revocation cannot prevent it from operating while offline. Reusing that hardware requires a new enrollment ID. Recoverable ownership comes from checkout registration during synchronization or unambiguous original creation events; an unidentified legacy checkout cannot be guessed safely.

## Corrections, cancellation and refunds

- **Correct order:** available only before payment and preparation, on the original till. Review the current menu and totals, enter a correction reason, then save. The saved order number stays the same.
- **Cancel order:** stops an unpaid open order, requires a reason and retains its history. Cancelling does not deduct stock. A paid order must be refunded in full first.
- **Refund order:** owners/admins can refund paid open or collected orders inside this workspace. Choose quantities and a reason. The amount uses the original receipt's tax, discounts and rewards. For bank/terminal refunds, first return the money outside the app, then confirm and record its reference. Cash refunds likewise record money staff return to the customer.
- **Packaged stock:** a refund restores a packaged item's stock only when **Return this packaged item to stock** is selected. Prepared food is never restocked. Retries do not duplicate the refund. Fully refunded open orders cannot continue preparation or be handed over; cancel them to close the queue.
- **Print preparation ticket:** prints the order number, customer, items, options and preparation note using the existing printer/browser print setup. It is clearly marked as a preparation ticket, not proof of payment. Windows can also route tickets to configured kitchen/bar printers automatically after sending or accepting an order.

## Prices, tax and rewards

Menu prices plus selected extras form the subtotal. Owners can use **Menu -> Tax and rewards settings** to enable tax, choose whether prices include tax and set the default rate. These are the existing business-wide checkout settings, so a mixed business shares them with stock checkout. Existing product-specific rates remain in effect for linked packaged goods; prepared food uses the default rate.

Owners/admins can apply a fixed or percentage discount before submitting an order. Selecting an existing customer account enables earning/spending rewards when the owner has enabled them. Available rewards are checked again when saving payment; offline tills do not reserve a shared reward balance. If payment is blocked because the customer's balance changed, correct the unpaid queued order to reduce the rewards, or cancel and replace it if preparation has started.

Receipts, digital receipts, refunds and financial reporting use the order's saved adjustments. Refunding items restores their spent rewards and reverses earned rewards. Old orders saved before these changes keep their original totals and do not acquire tax or rewards retroactively.

## Optional business operations

The counter-service workflow supports ordering, preparation, full payment, receipts, corrections, cancellation, refunds and handover. The following are separate extensions for businesses that actually need them; they are not prerequisites for operating a Fast food counter:

- **Tables and open tabs:** for customers who remain seated or add purchases before paying, typically table-service restaurants and bars.
- **Deposits:** for advance payments on future orders. Counter orders currently settle in full.
- **Preparation printer routing:** Windows supports configured kitchen/bar queues and automatic tickets. Browser and Android use manual system-dialog printing.

## Recipes, ingredient stock and food cost

Open **Fast food -> Recipes** (owner/admin):

1. Expand **Ingredient stock** to add flour, meat, oil and other ingredients, or use existing stock products. Choose a stock unit, purchase cost per unit, opening quantity and low-stock level.
2. Choose a prepared menu item. Use **Add recipe ingredient** to set what one portion consumes. Quantities use the ingredient's stock unit, with up to three decimals: 125 grams is `0.125` when flour is stocked in kg; 50 ml is `0.05` when oil is stocked in litres.
3. Configure additional ingredients under each extra, such as one extra cheese slice. Base and selected-extra quantities are combined, then multiplied by the number of portions ordered.
4. **Save recipe**. The screen shows estimated ingredient cost using current purchase costs. Existing submitted orders keep their saved ingredient quantities, names and units.
5. Restock ingredients here at their saved cost, or use Purchasing for supplier invoices and batches with new costs/expiry dates. Never change a stock unit without converting the stock and recipe quantities consistently.

Ingredient availability is checked when **Start preparing** is saved. The app consumes unexpired stock batches in expiry order, captures their actual purchase costs, and saves ingredient usage, preparation status and outbound sync records together. A failure rolls the whole operation back; retrying does not consume twice. Preparation on the original till is required for recipe orders. Ingredient stock is not reserved by unpaid queued orders.

Cooking is a physical stock event. Cancelling before preparation consumes nothing. Cancelling after preparation, refunding the customer, or rejecting a conflicting preparation-status edit does not restore ingredients already used. Ingredient usage persists independently of the order's editable progress, including after restart and synchronization. Prepared food is never automatically put back into raw ingredient stock. Record separate spoilage or damage through the existing wastage/stock-adjustment tools; do not also record the same cooked ingredients as wastage.

Financial reports include captured ingredient costs once when preparation happens, alongside packaged-stock costs, receipt tax, refunds and recorded expenses. Cancelled/refunded cooked food retains its ingredient cost. Order cards show the actual ingredient cost used. Revenue and food cost can fall in different reporting periods if an order is paid and prepared on different dates.

Do not also record tracked ingredient purchases as expenses: supplier purchases add stock, preparation charges its consumed cost. Prepared items without recipes and ingredients with missing purchase costs still overstate profit; add recipes and accurate purchase costs before relying on food margins. This implementation handles per-portion recipes and option extras. It does not add advance batch production or conversions between separate stock units.


No new external service or paid subscription is introduced by these operations. Cross-device use requires all participating apps and the existing sync backend to support `counter-v3`; older deployments keep these uploads queued rather than accepting records they cannot handle.


For tables, seats, open bills and serving before payment, enable the separate [Tables & tabs workspace](restaurant-and-bar-workspace.md). Fast food retains its pay-before-handover flow and separate menu.

## Finding the transaction screen

**Overview > Take a new order**, or **Order counter**, opens the order-entry screen. Choose menu items and quantities. Use **Send and take payment** to save the order and open its payment form immediately, or **Send for preparation** when payment will be taken later. **Orders > Take payment** opens payment for an existing unpaid order.

Menu editing, recipes and packaged stock are under **Business settings > Food menu & recipes**. They do not appear on the transaction screen. The separate Tables & tabs screen starts at tables and tabs; its configuration is under Business settings and its history has separate navigation.

Configuration now lives under **Business settings**, separate from transaction screens. Owners configure workspaces and sales rules; owners and admins can configure receipts, devices and enabled food/table workflows. Product variants and extras are under product management. **Cash register** is a separate daily-work screen; returns and customer history are under Sales history. The supermarket basket, POS receipt-reference scanner and customer display continue to use their existing operational controls.


Manual printing uses the configured 58 mm or 80 mm receipt printer for payment receipts, order reviews, preparation tickets and itemized bills. The selected action determines the document. Preparation tickets contain quantities and instructions, not payment totals. Customer documents retain item quantities/prices and applicable financial summaries. Detailed history stays available in the app. No additional printer is required for manual printing. On Windows, choose separate Kitchen ticket and Bar ticket printer queues in Device settings and enable automatic preparation routing. Each station receives only its lines. Corrections replace earlier tickets; removed station items and cancellations are labelled. Failed or interrupted print jobs remain under Preparation tickets need attention for explicit retry. Check physical output before retrying because an interrupted job may already have printed. Printing failures do not recreate orders, payments or stock deductions. Local automatic routing keeps its queue on that device. For orders from other devices, an owner can enable Shared kitchen and bar printing in Devices on a Windows checkout. That checkout handles the branch queue after orders synchronize; keep it open, connected and on the configured branch. Interrupted or uncertain tickets require explicit review and retry. Driver acceptance does not prove that paper printed.

## Order type and split payment

In **New order > Customer and order details**, choose **Takeaway** (default), **Dine in**, or **Delivery**. This describes how to hand over the order; it does not add table billing. QR delivery orders use the delivery progress controls described below. The saved order and preparation ticket retain the choice.

Use **Take payment > Payment Method > Split payment** when one order is paid using more than one method. Enter each cash, POS Terminal or Bank Transfer part; the parts must match the order total. If cash handed over exceeds its part, enter it to calculate change. Confirm external payment parts before saving. One receipt lists the parts; stock and ingredients are still charged only once.

## Reporting periods

Financial reports use the saved business reporting timezone, configured under Business settings > Workspaces and shared with Sync now. Existing businesses default to UTC. See [report calculations](report-calculations.md) for period boundaries and preparation-cost treatment.

## QR transfer and delivery setup

Under Business settings > Business, enter the public bank name, account name, account number and transfer instructions. Save and synchronize. The QR menu offers bank transfer only when all bank details are present; staff must still verify money received.

Delivery is hidden until the owner enables it. Set a fixed delivery charge before tax, including zero for free delivery, or add delivery areas with their own charges. If areas exist, customers must choose a served area; the server captures its configured charge. QR customers must enter a phone number and complete address. The charge is included in the order total and receipt. Staff see the complete delivery details on the order and preparation ticket. Assign a delivery agent by name and phone, prepare the order, mark it ready, confirm payment, then choose **Dispatch delivery**. Customer tracking shows **Out for delivery** after synchronization. Choose **Complete delivery** when it arrives. Assignment, dispatch and completion are retained in order history; these controls work locally after acceptance and synchronization. This is recorded delivery progress, not GPS tracking. Agent reassignment is blocked after dispatch. Local counter orders retain their existing handoff choices.

## Food batch production

Owners/admins open **Order counter > Batch production** for food prepared before customers order. Add or choose a separate finished stock product and the raw ingredients actually used. Enter expected yield, actual usable finished quantity, a work reference and optional finished-batch expiry. **Review stock changes** shows ingredient deductions and output. **Cancel** changes nothing; the red **Confirm stock changes** records the batch. Failed saves retain the draft ID for safe retry.

The batch deducts ingredients and adds the usable output to stock. All captured ingredient cost is allocated across the actual usable output: inputs costing 8 and eight finished portions create stock costing 1 per portion. Expected yield is recorded for comparison; it does not add stock. **Use for new batch** copies an earlier batch into a new draft; review actual quantities and enter its new expiry. If nothing usable was produced, record the ingredients through wastage instead.

Link the finished product in Menu as **Stocked goods - deduct stock**, or use it as an ingredient in a recipe assembled to order. Do not consume both the raw recipe and the finished stock for the same portion. Counter stocked offerings consume finished stock at payment; restaurant stocked offerings consume it when preparation starts. Produced stock retains its batch cost and expiry. Unsold output remains inventory; input cost is not also deducted as a running expense. Labour and overheads belong in Expenses.

**Purchasing and wastage** is available within Batch production. Record spoiled finished units through wastage so their captured cost is recognized once. Material-use and batch-production synchronization require app/server support for `stock-work-v1`; older servers keep the new records queued. This is a single-output food batch workflow, not production scheduling or a manufacturing system.

## Copy offerings between workspaces

Owners/admins open the destination menu under Business settings, then **Copy menu items from restaurant/takeaway**. Both workspaces must be enabled and synchronized to load the other saved menu. Preview the source, select items and choose **Add selected items to menu draft**. Review prices, linked stock, ingredient quantities, extras and availability, then **Save menu**. Cancel copy preview changes no menu; Discard menu changes removes unsaved additions.

Copies receive fresh item/extra identities and retain recipes and stock-product links. Restaurant copies use kitchen for prepared items and bar for stocked items when no station is specified; takeaway copies omit station assignments. Existing destination items are retained. Same-name items and previously copied source items are blocked to prevent accidental duplication. Copies can be edited independently; later source edits do not update them or change submitted orders. Recipes and linked products remain subject to the normal save validation and 200-item menu limit. Saving uses the existing menu synchronization capabilities.
