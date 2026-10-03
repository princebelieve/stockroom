# Supermarket purchasing and receiving

Owners and admins open **Inventory > Purchasing and receiving**.

1. Add suppliers.
2. Add product-specific pack conversions, for example one carton = 24 bottles.
3. Create an optional purchase order. Orders do not change stock.
4. Record actual deliveries, optionally linked to an order. Outstanding quantities remain visible after partial deliveries. Cost is entered per selected pack or selling unit. Expand **Expiry / batch (optional)** only when recording an expiry date or supplier batch label. Leave it blank for ordinary stock.
5. Record supplier returns against the original delivery, or record wastage with a reason. Both reduce stock and create stock movements.

Each delivery saves its conversion factor and purchase cost. Later conversion changes do not reinterpret history. Supplier returns retain the original delivery cost. Receiving does not change the catalogue's current cost; existing sale cost snapshots and historical receipts remain intact. Supplier balances track unpaid deliveries, opening debt/credit, later payments, return credits and refunds. Delivery receiving defaults to paid in full in the interface; expand **Payment: paid in full (change details)**, clear that option and enter the amount paid for credit or partial payment.

Requests use stable IDs. Repeating an identical request does not change stock twice. A request ID cannot be reused for different details. Pending saves survive page reloads for the same business and branch. Known rejected requests can be edited; interrupted requests can be retried. Check synchronized history before discarding a pending request.

## Storage and upgrade behavior

The shared retail module adds `retail_records` and `schema_migrations`. Existing product, sale, customer, branch, and movement tables retain their IDs and structure. New retail migrations run transactionally and reject databases written by a newer retail schema version. Legacy column additions check column existence and report errors instead of hiding failures.

Established desktop databases receive a consistent `pre-retail-upgrade-*.sqlite` snapshot in the local data directory before this upgrade. Browser storage persists changes in its normal IndexedDB transaction. Android uses native SQLite. Browser and Android backups still require their platform's own recovery/export arrangements; the desktop snapshot does not back up those clients.

Receiving, supplier returns, and wastage save their stock changes, movements, immutable records, and synchronization outbox together. Cloud receives `retail_record` operations and prevents duplicate record IDs from applying inventory notifications again. Updated desktop, browser, and Android clients replay these records once. The cloud must be updated before enabling purchasing on clients. Older clients are asked to update when a sync page contains purchasing records, rather than consuming records they cannot apply.

Stock creation, adjustments, stocktake counts, transfers, and checkout support up to three decimal places. Existing SQLite quantity columns have numeric affinity and already accept fractional values; no destructive table rebuild is required.

## Stock and reporting

Deliveries can record batch numbers and expiry dates. Checkout uses earliest unexpired stock and captures each batch's cost. Transfers and restocked refunds preserve batch metadata. Inventory includes audited batch corrections and product price/barcode changes; reports include purchase value, tax, wastage, best sellers and outstanding orders. See [workspace details](supermarket-workspace.md) for migration and multiple-till behavior.

Validation covers migration preservation, retries, transaction rollback, pack conversion, partial deliveries, supplier returns, fractional wastage, FEFO, expired stock, captured costs, transfers, cloud coordination and the browser receiving workflow.

To record damage, expiry or known stock loss with a cost in reports, use **Record wastage**. An approved stocktake shortage or manual quantity reduction automatically records its captured stock cost as a loss. Do not deduct the same stock twice. See [report calculations](report-calculations.md).

## Supplier account entries

Expand **Supplier balances and payments** to record a later supplier payment, an advance, a refund received, or the actual opening debt/credit. A positive balance is owed and a negative balance is supplier credit. Supplier returns create a credit against a delivery with known accounting status; receiving a refund from the supplier then uses that credit. Existing older delivery records have unknown payment status and are not assumed unpaid. Use a single opening amount for their verified outstanding balance. Entries and their sync messages save together and retry safely with the same request ID.

For cash payment/refund, an open register owned by the operator is adjusted automatically. With no open register, the supplier ledger records the cash method but does not adjust any till. Review the account ledger and reference before entering a replacement payment after an interrupted save.
