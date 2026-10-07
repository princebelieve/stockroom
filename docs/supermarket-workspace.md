# Supermarket workspace

Load and save the supermarket template in Business settings. Existing products, customers and sales remain intact.

## Small-store use

Tax and loyalty are optional and off by default. Selecting the supermarket template does not require either feature. Tax supports a default rate, product-specific rates and exempt items. Loyalty supports earning and spending branch rewards, with return adjustments.

A store selling branch stock through one till can continue its normal offline checkout. For multiple tills, the optional separate-stock mode assigns each till its own branch stock allocation through existing stock locations and transfers. Synchronize all tills before enabling it or changing assignments. When separate-stock mode is off and multiple independently offline tills sell the same branch inventory, each has its own stock view, so competing sales can exceed shared availability. Synchronize tills when connectivity is available and review reported discrepancies. Stock checks and conflict reporting remain active; they are safeguards, not optional business features.

Automated checks cover implemented stock and checkout behavior. They do not establish current production deployments or certify physical hardware. Assess additional tills, devices or sector workflows against the particular store's needs.

Supplier ordering, partial delivery receiving, pack conversions, supplier returns and wastage are available in Purchasing. Receiving records capture purchase cost and automatically create internal batches. Batch labels and expiry dates are optional and tucked under Expiry / batch (optional); they are not needed to create a product or sell ordinary stock. Inventory shows batch balances, expired stock, stock expiring within 30 days, purchase value and audited price/barcode/batch corrections.

Goods checkout allocates the earliest unexpired batch first. Expired stock cannot be sold. Transfers preserve batch dates and costs. Refunds restore the original batches and reverse captured costs only for items explicitly returned to stock; refunds without restocking retain the goods cost. Legacy stock without batch history receives an opening balance at the catalogue cost; historical costs are not reconstructed.

Reports share calculations across desktop, browser and Android: net revenue excludes checkout tax, profit uses captured delivery costs and deducts expenses and wastage, and supermarket reports show purchasing, outstanding orders, best sellers and expired stock. Inventory selling value remains available separately from purchase value.

Sales and their sync messages are saved atomically. Cloud coordination records competing stock, receiving and return activity, with visible conflicts for review. Shared basket/register and product price changes use revision checks. Independently offline tills cannot reserve one another's stock; completed offline receipts are retained and discrepancies require owner reconciliation.

The migration adds stock batches and events without replacing existing business tables. Desktop creates an upgrade snapshot. Deploy the updated cloud service and update tills together: clients request retail-v3 so older software cannot silently misapply batch operations.

The core supermarket stock and checkout workflows are implemented. Supplier account balances and payments, automatic costing of approved stock-count shortages/manual reductions, and CSV column mapping with existing barcode/SKU matching are implemented. See the operational rules below for opening balances and preventing duplicate deductions. Production deployment remains a separate release action. Restaurant and bar billing are implemented in the optional Tables & tabs workspace; table reservations are available there; hotel stays and club admission are not.

Read [product migration](product-migration.md) and [report calculations](report-calculations.md) before choosing how to bring an existing shop onto the app.

## Supplier and loss workflows

Supplier balances and payments are in an expandable Purchasing section. Positive balance is owed; negative balance is credit. New receiving defaults to paid in full, with a partial/unpaid option. Later payments, advances and supplier refunds record their method and reference. A supplier opening balance can be entered once per branch to carry existing debt or credit. Older deliveries with no recorded payment status are flagged and excluded from the new payable calculation; enter only their actual outstanding amount rather than treating all historic deliveries as unpaid.

Approved stocktake shortages and manual negative adjustments capture the removed batches' costs. Reports deduct those costs separately from explicit wastage. Closed-register shortages/surplus also enter profit. Supplier cash transactions link to the operator's open register and adjust expected cash. Do not deduct a loss through several stock workflows, record a supplier payment as a running expense, or record an automatically linked supplier payment again as cash-out.
