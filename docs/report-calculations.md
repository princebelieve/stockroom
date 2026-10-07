# Expenses, profit and stock losses

These calculations describe the implemented app, not a complete set of business accounts. Desktop, browser/PWA and Android call the shared `server/reports.mjs` calculation using the active branch's locally stored data. Synchronize before comparing reports from different tills.

## Reporting periods

Owners set **Business settings > Workspaces > Reporting timezone** using a timezone such as `Africa/Lagos` or `America/Los_Angeles`, then save and use **Sync now** to share it. Existing businesses without a saved timezone default to UTC, consistently across devices. Today begins at midnight in that business timezone; weeks begin on Monday; the month begins on its first day. Daylight-saving changes follow the selected timezone. Future-dated entries are excluded. Date-only expenses use their entered business calendar date. The Reports expired-stock summary also uses the business calendar date. Inventory batch alerts and stock allocation still use UTC calendar dates; this reporting setting does not change their stock rules. Changing the timezone recalculates reporting periods without rewriting recorded transaction timestamps. All participating clients must be updated and synchronized to use the same saved timezone. Sales totals use each receipt once and subtract refunds recorded in that period. Transaction counts count receipts, not refunds. Daily/weekly/monthly sales totals include receipt tax; the profit revenue figure excludes it.

## Current-month profit estimate

`Profit = sales receipts - refunds - net receipt tax - net sold-stock cost - consumed recipe-ingredient cost - used job-material cost - running expenses - wastage - stock shortages - cash shortages + cash surplus`

The result can be negative: that is an estimated loss. Recipe ingredients enter cost when preparation starts, including for cooked orders later cancelled or refunded; payment does not charge ingredient cost again. Sale costs are captured at checkout, using the allocated delivery batches. When different costs contribute to a sale line, its stored unit cost is their weighted average. A restocked partial return reverses the actual returned batch costs when those allocations are available; older returns fall back to the saved line cost. A return without restocking reduces revenue but retains the goods' original cost. Do not record that same cost again as stock wastage. A return from an older sale affects the month of the return and can create negative net sold-stock cost for that month.

Discounts are already included in receipt totals. Tax is off by default; when configured, receipts save their tax calculation. New partial returns preserve cumulative rounding so a complete return reverses exactly the receipt tax. Older return records without saved refund tax use proportional tax. Checkout supports a default rate with product-specific overrides, including 0 for exempt products; prepared menu items use the default rate. Owners configure these rates: the app does not determine exemptions or file tax returns.

## Expenses and purchasing

Record running expenses such as rent, electricity, transport and salaries with the date incurred. The month uses this date, not the date the record was entered. Positive amounts, descriptions, categories and valid dates are required. A future expense appears when its date falls within the report period.

Record stock deliveries in Purchasing. Purchasing value is shown separately: buying stock does not deduct the entire delivery from profit immediately, because unsold units remain inventory. Their costs enter profit when sold or recorded as wastage. Recording the same delivery as a running expense would deduct its cost twice. Supplier returns reduce net purchasing and stock; supplier invoice payments and outstanding supplier debt are tracked separately under Supplier balances and payments and do not reduce profit a second time.

## Stock values and losses

- Selling value is stock multiplied by catalogue selling price.
- Purchase value uses remaining batches' captured purchase costs; opening/untracked stock uses the catalogue cost when first established. A later catalogue cost change does not rewrite a batch or old receipt.
- Recorded wastage deducts allocated purchase cost in its recording month. An expiry alert alone does not deduct stock or profit; record disposal when appropriate.
- Newly approved stocktake shortages and manual stock reductions deduct the allocated purchase cost automatically. Positive stock adjustments create stock at the catalogue cost and are not treated as sales revenue. Wastage, stocktakes and manual reductions are alternative ways to record the same missing quantity: do not use more than one for a single loss. Historical adjustments without a captured cost are not retrospectively guessed.
- Closed cash-register shortages reduce profit and cash surplus increases it in the closing month. They are shown separately from running expenses. Do not add the same difference as another expense. Cash supplier payments/refunds join the staff member's open register automatically; cash-in/out movements for unrelated activity affect expected cash but are not themselves running expenses.

Zero or missing goods costs can overstate profit. The supermarket report flags goods sale lines with zero/missing cost; free goods may legitimately have zero cost. Enter known opening costs and delivery costs. Changing a product's cost later does not repair an old sale snapshot. Service receipt lines carry no inventory cost. Issued job materials are recorded separately and deducted at their captured batch cost when used; refunds do not restore those materials. Labour and overheads must be recorded as running expenses.

Best sellers show current-month units sold less units returned that month, floored at zero per product. Outstanding deliveries compare purchase orders with received quantities. The report currently shows the current-month estimate. Supplier debt/credit and payments are available in Purchasing. Bank fees and other running costs can be recorded as expenses. These operational reports do not replace a general ledger or statutory accounts.

The main report shows a prominent incomplete-cost warning when current-month goods have zero cost, paid prepared orders have no tracked recipe, or ingredient/job-material deductions have zero cost. It lists affected prepared-item names and points to Inventory/Purchasing and menu recipes. A delivery-charge line is excluded from recipe warnings. These warnings do not invent costs or change historical totals; the reported profit remains an estimate based on recorded data.

## Food batch production and job materials

Food production transfers the captured ingredient cost into a new finished-stock batch, divided by actual usable output. The expected output is a yield comparison only. Production inputs are not charged again as recipe costs or running expenses. Finished output enters profit cost when sold, consumed in restaurant preparation or written off. Poor yield raises the cost per usable unit; total failure is recorded as ingredient wastage. Labour and overheads are excluded from this material-only batch cost.

Service job materials enter profit cost on the date their use is recorded, whether the invoice is unpaid, partially paid, cancelled or refunded later. Job material history shows the physical quantities and captured costs. These reports use collected receipts for revenue, so invoice revenue and material costs can fall in different periods. Buying the materials and then consuming them must not also be entered as the same running expense.
