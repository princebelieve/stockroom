# Fast food workspace

Fast food is a separate, optional workspace for counter-service orders. Enabling it does not add menu or preparation controls to supermarket checkout.

## Setup

Open **Business settings → Business type**:

- Choose **Fast food only** under **Payment screens** for a dedicated workspace.
- To keep stock checkout or payment entry as well, choose those screens and check **Enable separate Fast food workspace**.
- Click **Save payment screens**. Use **Sync now** to share the setting with other devices.

Open **Fast food → Menu**. Owners and admins can add menu items, prices and optional priced extras. Turn off **Available to order** when an item is unavailable.

Choose **Prepared food** for meals made to order. They require no inventory product and do not deduct stock. Choose **Packaged goods** for bottled drinks or other stocked goods and link an existing product. **Packaged stock** lets owners/admins create and restock packaged products within this workspace. Restocking there is a stock adjustment at the product's saved cost; it is not a supplier invoice or payment.

## Daily operation

1. **New order:** choose items, quantities and extras. Add an optional customer name and preparation note, then **Send for preparation**.
2. **Preparation:** the saved order enters the queue. Staff use **Start preparing**, then **Mark ready**.
3. **Orders:** use **Take payment** on the till that created the order. Record cash, bank transfer or an externally confirmed terminal payment. Print or share the linked receipt.
4. **Hand over:** once the order is Ready and its payment has been saved, mark it Collected. It remains in collected-order history.

Payment can be recorded before or during preparation. Its state is separate from preparation progress. The order number appears on its receipt; payment retries use one receipt ID for that order. A retry with different payment details is rejected.

Submitted orders retain their item names, options, quantities, prices, tax, discounts, rewards, business identity and currency. Later menu or settings edits do not change them. **Correct order** can replace an unpaid Queued order on its original till; the correction must include a reason and retains the previous items and amount in its history. Once preparation or payment has started, refund/cancel as appropriate and create a new order instead. Drafts are saved per business, staff member and branch and restore after a reload.

Creating or preparing an order does not deduct stock. Saving payment deducts only linked packaged goods, once. Unpaid orders do not reserve stock; insufficient packaged stock blocks payment. Prepared food does not consume ingredients automatically.

## Devices and recovery

Orders, progress changes, receipts and their outbound sync records persist locally. The workspace refreshes local order data every five seconds. **Sync orders** uploads local changes and downloads changes from other devices; it requires configured cloud synchronization and a connection. Saving orders, progress, menu changes and packaged-stock changes also attempts synchronization through the existing backend. If synchronization fails, saved local changes remain queued for retry. Printing receipts works locally. Sending an email receipt uses the existing online receipt service and synchronizes first.

Take payment on the original till. Another synchronized device can display and update preparation progress. Updates carry an expected revision, so stale local edits are rejected. Rejected edits remain in the sync-conflict log; the accepted cloud order/menu version is restored when returned by the cloud. Offline devices do not provide exclusive ownership of a shared preparation queue. An owner/admin should review **Sync issues** before relying on a conflicted order.

Here, "cloud server" means the project's existing Stockroom synchronization backend (`cloud/index.mjs`), currently configured with a Render address. This workspace adds no hosting provider, paid synchronization service or subscription. The desktop server also retains its existing background synchronization worker, which runs every 30 seconds. The explicit sync buttons remain available. These changes do not establish the hosting account's pricing or usage limits.

The existing synchronization server and participating apps must be updated for this workflow. Capability checks hold Fast food uploads on the device until the cloud supports them, and prevent older apps from consuming Fast food records and settings. Ordinary supermarket synchronization retains its existing protocol. The cloud changes in this repository must be deployed before using Fast food across devices.

## Corrections, cancellation and refunds

- **Correct order:** available only before payment and preparation, on the original till. Review the current menu and totals, enter a correction reason, then save. The saved order number stays the same.
- **Cancel order:** stops an unpaid open order, requires a reason and retains its history. Cancelling does not deduct stock. A paid order must be refunded in full first.
- **Refund order:** owners/admins can refund paid open or collected orders inside this workspace. Choose quantities and a reason. The amount uses the original receipt's tax, discounts and rewards. For bank/terminal refunds, first return the money outside the app, then confirm and record its reference. Cash refunds likewise record money staff return to the customer.
- **Packaged stock:** a refund restores a packaged item's stock only when **Return this packaged item to stock** is selected. Prepared food is never restocked. Retries do not duplicate the refund. Fully refunded open orders cannot continue preparation or be handed over; cancel them to close the queue.
- **Print preparation ticket:** prints the order number, customer, items, options and preparation note using the existing printer/browser print setup. It is clearly marked as a preparation ticket, not proof of payment. It does not automatically send jobs to a separate kitchen printer.

## Prices, tax and rewards

Menu prices plus selected extras form the subtotal. Owners can use **Menu -> Tax and rewards settings** to enable tax, choose whether prices include tax and set the default rate. These are the existing business-wide checkout settings, so a mixed business shares them with stock checkout. Existing product-specific rates remain in effect for linked packaged goods; prepared food uses the default rate.

Owners/admins can apply a fixed or percentage discount before submitting an order. Selecting an existing customer account enables earning/spending rewards when the owner has enabled them. Available rewards are checked again when saving payment; offline tills do not reserve a shared reward balance. If payment is blocked because the customer's balance changed, correct the unpaid queued order to reduce the rewards, or cancel and replace it if preparation has started.

Receipts, digital receipts, refunds and financial reporting use the order's saved adjustments. Refunding items restores their spent rewards and reverses earned rewards. Old orders saved before these changes keep their original totals and do not acquire tax or rewards retroactively.

## Optional business operations

The counter-service workflow supports ordering, preparation, full payment, receipts, corrections, cancellation, refunds and handover. The following are separate extensions for businesses that actually need them; they are not prerequisites for operating a Fast food counter:

- **Tables and open tabs:** for customers who remain seated or add purchases before paying, typically table-service restaurants and bars.
- **Deposits:** for advance payments on future orders. Counter orders currently settle in full.
- **Recipes and ingredient consumption:** for tracking how much flour, meat, oil and other ingredients each prepared item uses, including wastage. Prepared food currently does not deduct ingredient stock.
- **Kitchen-printer routing:** for automatically sending specific items to separate kitchen/bar printers. Manual preparation tickets are available now.

Financial reports include saved receipts, refunds, receipt tax, packaged-stock costs and recorded expenses. They do not calculate recipe costs. To avoid overstating prepared-food profit, record ingredient costs as expenses when you are not already accounting for them through stock. Reliable item-by-item prepared-food margins require a future recipe/costing workflow. Do not charge the same costs through both stock and expenses.

No new external service or paid subscription is introduced by these operations. Cross-device use requires all participating apps and the existing sync backend to support `counter-v2`; older deployments keep these uploads queued rather than accepting records they cannot handle.
