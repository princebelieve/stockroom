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

Submitted orders retain their item names, options, quantities, prices, business identity and currency. Later menu edits do not change them. Drafts are saved per business, staff member and branch and restore after a reload.

Creating or preparing an order does not deduct stock. Saving payment deducts only linked packaged goods, once. Unpaid orders do not reserve stock; insufficient packaged stock blocks payment. Prepared food does not consume ingredients automatically.

## Devices and recovery

Orders, progress changes, receipts and their outbound sync records persist locally. The workspace refreshes local order data every five seconds. **Sync orders** uploads local changes and downloads changes from other devices; it requires configured cloud synchronization and a connection. Saving orders, progress, menu changes and packaged-stock changes also attempts synchronization through the existing backend. If synchronization fails, saved local changes remain queued for retry. Printing receipts works locally. Sending an email receipt uses the existing online receipt service and synchronizes first.

Take payment on the original till. Another synchronized device can display and update preparation progress. Updates carry an expected revision, so stale local edits are rejected. Rejected edits remain in the sync-conflict log; the accepted cloud order/menu version is restored when returned by the cloud. Offline devices do not provide exclusive ownership of a shared preparation queue. An owner/admin should review **Sync issues** before relying on a conflicted order.

Here, "cloud server" means the project's existing Stockroom synchronization backend (`cloud/index.mjs`), currently configured with a Render address. This workspace adds no hosting provider, paid synchronization service or subscription. The desktop server also retains its existing background synchronization worker, which runs every 30 seconds. The explicit sync buttons remain available. These changes do not establish the hosting account's pricing or usage limits.

The existing synchronization server and participating apps must be updated for this workflow. Capability checks hold Fast food uploads on the device until the cloud supports them, and prevent older apps from consuming Fast food records and settings. Ordinary supermarket synchronization retains its existing protocol. The cloud changes in this repository must be deployed before using Fast food across devices.

## Current scope

This implementation covers menu ordering, a preparation queue, full payment, receipts and handover. The omissions below are possible future additions, not technical barriers or a required roadmap. It uses existing owner/admin/cashier accounts. It does not add table service, open tabs, recipes, ingredient consumption, kitchen-printer routing, deposits, order editing or cancellation. Existing receipt returns remain separate from preparation tracking.

Menu prices plus selected extras determine the final amount. Stock-checkout tax, discount and loyalty settings are not applied to counter orders. Existing financial reporting includes their saved receipts and recorded packaged-stock costs; it does not estimate prepared-food ingredient costs.
