# Payments & receipts

In receipt settings, **Preloaded catalogue starters** provides generic, editable service-description ideas. Add the descriptions that apply and enter your own prices; no fees or business transactions are created automatically.

Use this workspace for payments described by the cashier, without automatic product stock or ingredient deduction on payment. Issued jobs can separately record materials actually used. It has three tabs: **New payment**, **Jobs & invoices**, and **Payment history**.

## Start using it

A new owner can choose **Printing and copy shop** or **Services / church office** during account setup. Existing owners can preview and apply a preset in **Business settings > Workspaces**, or enable this workspace alongside other screens. Changing workspace choices preserves products, orders and receipts. Use **Sync now** to share a saved choice.

## Immediate payment

1. Open **New payment**. Enter what the customer is paying for, quantity and unit price.
2. Use **Add another item** for more descriptions. Customer name and phone are optional; receipt details can be expanded when needed.
3. Choose **Payment Method**: **Cash**, **POS Terminal**, **Bank Transfer**, or **Split payment**. Split parts must add up to the total; each external part needs its provider and reference. Owner-enabled **Customer wallet** is available for immediate payments; only the owner may explicitly approve credit when enabled. Selected POS terminals from Business settings populate the dropdown; the first selected terminal is the default.
4. For cash, enter the amount handed over if it exceeds the total. For POS Terminal or Bank Transfer, confirm success outside the app and record its reference.
5. Save once, then print or share the receipt. Reprinting does not create another payment.

These are descriptive receipt lines, with no SKU or inventory lookup. Saving clears this form's draft for the next customer. Switching screens or reloading preserves an unfinished draft independently of the supermarket basket.

## Work that needs an invoice or deposit

1. Open **Jobs & invoices > New job / estimate**. Enter a job description, customer, item descriptions, quantities and prices. Add an optional due date or instructions.
2. Save directly as a job/invoice, or check **Start as an estimate**. An estimate cannot receive payment until **Accept estimate / issue invoice** is selected.
3. Select the job and use **Take payment**. Enter a deposit or the full balance. Each payment has a separate receipt showing that amount and the remaining balance.
4. Use **Job details and actions** to mark work **In progress**, **Ready**, then **Completed**. Ready describes the work; paid describes the money. Completion requires no remaining balance.
5. Return to the same job for later payments. Payment history retains every receipt and supports reprinting.

Example: an invoice for 100, paid 30 then 70, has two receipts, 100 collected and no balance. The invoice itself is not another sale. Existing sales reports count collected payments and recorded refunds; the jobs list and Overview show outstanding invoices separately.

Draft form entries remain editable before saving. Saved job descriptions, prices, customer details and receipt settings are retained as snapshots. To replace an issued job, the owner/admin refunds any retained payment, cancels the job and creates its replacement. Cancelled jobs and original receipts remain in history.

## Saved services, finding jobs and statements

Owners/admins can save reusable service names and prices in **Business settings > Receipts > Saved services and prices**. Use **Add saved service** on a payment or job; saved receipts and invoices retain their original prices.

Search jobs by customer, phone, description or invoice ID. Filter unpaid invoices or overdue unfinished work using the business reporting timezone. Owners/admins can print invoice customer statements for this branch. Statements keep currencies separate and include refunds in net paid; they exclude estimates, cancelled jobs, separate walk-in receipts and wallet balances. Choose an existing customer account when creating a job to link its invoices reliably. Unlinked customers without a phone remain separate. Invoice payments support cash, terminal, bank transfer and split payments.

## Job materials and costs

Owners/admins can open an issued job and use **Job materials and costs** on its original till. Add paper, ink or other supplies as stock, choose each material and its actual quantity used, and enter a work reference. **Review stock changes** shows the physical deductions. **Cancel** changes nothing; the red **Confirm stock changes** saves the material use and captured batch costs once. Retrying a failed response uses the same draft ID.

Use **Purchasing and wastage** inside this screen for suppliers, deliveries, changing batch purchase costs, supplier payments and spoiled stock. This works without enabling Product sales. Use one stock unit consistently: sheets, kg or litres, for example. Opening stock uses the purchase cost entered when adding the stock product.

Materials are expensed when used, separately from deposits or invoice payments. The job shows the total recorded material cost, excluding labour and overheads. Refunds and cancellation retain consumed stock and cost. Saved material records cannot be edited or deleted; correct physical stock with a reason through the stock tools. Do not record the same supplies again as running expenses. This records job materials; it does not schedule printing machines or manage automated press production.

Material-use synchronization requires the updated app and sync server capability `stock-work-v1`. An older server leaves these records queued rather than sharing unsupported stock changes.

## Refunds

Owners and admins can refund an immediate payment from **Payment history** or an invoice payment from its job's **Payment history**. Invoice refunds use a money amount, not a product quantity. The shared returns engine prevents refunding more than remains on the receipt. A refund increases the invoice balance; cancellation requires all retained money to be refunded. External refunds must be completed outside the app and confirmed with a reference.

## Printing and receipt settings

**Business settings > Receipts** holds contact details, the custom footer and optional receipt tax. Tax is off by default. Old receipts retain their saved settings.

Use the same configured 58 mm or 80 mm receipt printer for all selected documents:

- **Estimate:** the quoted items and amount.
- **Job ticket:** customer, quantities and work instructions.
- **Invoice:** items, amount paid and balance due.
- **Payment receipt:** the money actually received, method/reference and change where applicable.

An estimate, job ticket or invoice is not proof of payment. Detailed operational history stays in the app; the small printed documents contain the relevant details. Digital receipt sharing uses the existing controls.

## Offline work and sharing devices

Jobs, payment drafts, receipts and queued changes save locally. Interrupted payment requests can be retried without duplicating receipts. Manage a job on its original till and branch. Refresh downloads updates without uploading local work; it preserves a job with pending changes and reports when Sync is needed to reconcile it. **Sync now** deliberately uploads and downloads.

Shared-device invoice operations require the updated app and existing sync server to support `service-jobs-v1`. An older server keeps uploads queued. This adds no paid service. Printer hardware and deployed server compatibility must be checked before shared-device rollout.

## Church collections, funds and pledges

Open **Payments & receipts > Church collections**. Owners/admins use **Add fund** and **Add donor** to create branch records. Donors have distinct identities even if names match. Anonymous one-off donations are supported; pledges require a registered donor. Archive a fund or donor with confirmation to stop new commitments without deleting existing receipts or history. Issued commitments retain the saved donor and fund names; corrections require a replacement identity rather than rewriting old records.

Use **New pledge / donation**, select a fund and donor, enter the purpose and commitment amount, and save. A pledge can have a due date and shows overdue/outstanding amounts. Search commitments by donor, phone, fund or purpose; filter pledges, outstanding commitments or overdue pledges. A prepared one-off donation is an unpaid draft commitment, not a received contribution or a pledge. Neither records income until **Receive contribution > Save contribution**. Contributions use the existing payment engine: cash, confirmed bank transfer, external terminal or split payments, without changing stock or applying the service sales-tax setting. Each payment creates one normal receipt showing its donor and fund. Existing general collection/donation receipts are not automatically assigned to funds or donors.

Partial contributions reduce a pledge's outstanding amount. Owners/admins can **Refund contribution** using the existing monetary-refund controls. Confirm external refunds outside the app. Refunds reduce net contributions and reopen the remaining pledge balance. Refund all retained payments before confirming cancellation of a commitment; original receipts remain. Manage payments on the commitment's original till. Draft IDs and payment commands survive reload; retry an interrupted action using the original entry. If another action changed the commitment, review its current balance before preparing a new payment.

Owners/admins can filter **Fund contribution totals and donor statements** by registered donor, fund and date range in the business reporting timezone. Print statements or export received contributions and refunds as CSV. Currencies remain separate. Outstanding pledges use their current lifetime balances, separately from date-filtered receipts. Statements cover this branch's structured church records; legacy unassigned receipts are excluded. Fund totals are contributions received less refunds, not bank balances or spending budgets. General financial reports count received contributions through the existing receipts; pledges are not revenue. These statements are accounting records, not tax certificates. Fund spending, bank reconciliation and a full charity accounting ledger remain outside this feature.

Sharing requires updated participating apps and the existing sync backend supporting `church-collections-v1` and `service-jobs-v1`. Older servers keep uploads queued. Conflicting records remain for review, and offline devices cannot see another device's unsynchronized payments.
