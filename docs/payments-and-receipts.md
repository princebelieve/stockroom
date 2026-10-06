# Payments & receipts

Use this workspace for payments described by the cashier, without product stock or ingredient deduction. It has three tabs: **New payment**, **Jobs & invoices**, and **Payment history**.

## Start using it

A new owner can choose **Printing and copy shop** or **Services / church office** during account setup. Existing owners can preview and apply a preset in **Business settings > Workspaces**, or enable this workspace alongside other screens. Changing workspace choices preserves products, orders and receipts. Use **Sync now** to share a saved choice.

## Immediate payment

1. Open **New payment**. Enter what the customer is paying for, quantity and unit price.
2. Use **Add another item** for more descriptions. Customer name and phone are optional; receipt details can be expanded when needed.
3. Choose **Payment Method**: **Cash**, **POS Terminal**, or **Bank Transfer**. Selected POS terminals from Business settings populate the dropdown; the first selected terminal is the default.
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
