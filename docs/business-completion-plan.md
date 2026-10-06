# Business app completion plan

Review date: 2026-10-06. This is a completion specification, not a claim that the listed gaps have been implemented. Scope: the four existing workspaces; preserve Product sales basket, customer display, payment-reference scanner, theme and existing manual sync controls. Do not add paid dependencies.

## Evidence and comparison

The review inspected ShopSetup and shared shop-profile settings, main navigation/printing/refresh, ServicePayments, CounterService, RestaurantService, RestaurantPayment, recipe modules, pricing/payment modules, existing workspace documentation and workflow tests. Recent automated checkout checks exist for all four workspaces. This is not a physical-device, deployment or production acceptance audit.

Use official examples as operational references rather than a feature-shopping list:

- [Square modes](https://squareup.com/help/us/en/article/8458-use-modes-with-square-point-of-sale): different selling operations have different modes.
- [Loyverse open tickets](https://help.loyverse.com/help/open-tickets): save a ticket before collecting payment.
- [Loyverse unpaid bills](https://help.loyverse.com/help/how-print-bill): a bill precedes a payment receipt.
- [Loyverse kitchen printers](https://help.loyverse.com/help/using-kitchen-printers): preparation work and customer receipts have separate printing purposes.
- [Square invoices](https://squareup.com/help/us/en/article/8387-create-and-send-invoices) and [deposits](https://api.squareup.com/help/us/en/article/6581-request-deposits-with-square-invoices): invoices retain amounts owed and accept payments over time.
- [Square projects](https://squareup.com/us/en/invoices/features/project-management): customer jobs can link estimates, invoices, payments and notes.

These sources establish comparable workflows, not exact equivalence, platform availability or a requirement to copy their paid features.

## What exists and what remains

| Area | Verified existing operation | Completion work |
| --- | --- | --- |
| Product sales | Catalogue, basket, checkout, customer display, payment reference scanner, stock operations and receipt returns | Preserve the familiar selling flow. Verify configured POS defaults and removals, reference scanning, saved basket recovery, refunds and downloaded stock with queued local work. Do not add job fields here. |
| Payments & receipts | Multiple descriptive lines, quantities/prices, customer name/phone, full payment, saved receipt profile/footer, history and sharing; no stock deduction | Keep this quick payment path. Add an optional saved service job/invoice path, including balances and payments, without making it compulsory for church-office fees or other immediate payments. Give this workspace a direct receipt refund path using shared return operations rather than a second refund engine. |
| Order counter | Separate menu/extras, preparation queue, recipes/captured ingredient costs, packaged goods, payment, collection, correction/cancellation/refunds and preparation printing | Make preparation tickets clearly operational: quantities, options, notes, order identity; remove customer payment totals from that print layout. Verify busy-counter pay-before-preparation and pay-at-collection journeys. Explain editing restrictions at the point of use. |
| Tables & tabs | Tables/seats and named tabs; repeated rounds; kitchen/bar readiness; itemized bill; payments across rounds, quantities/seats/equal shares and mixed methods; closing/history/move/merge/refunds | Verify unpaid, partially paid and fully paid bill presentation. Improve station printing and correction communication. Explain original-till ownership without implying live coordination between disconnected devices. |
| Devices | Existing receipt/preparation print controls and station-filtered content | Station filtering is not automatic printer routing. Add optional saved receipt/kitchen/bar printer destinations only for transports actually supported; keep manual printing as a fallback. Test actual devices before claiming support. |
| Business setup | Explicit presets choose real workspaces, preview changes and preserve data; catalogue template separate | Integrate preset choice into first-owner setup. Add a short first-use checklist for actual items/prices/tables. Do not prefill saleable fake products or make advanced configuration compulsory. Existing businesses retain preview-and-apply control. |
| Refresh and Sync | Refresh pulls data; Sync uploads and downloads; queued local work and drafts persist | Verify sales/history/refunds, current menus/bills, customers, receipt profile, reports and stock all become consistent after refresh. Recent targeted stock/outbox check does not prove every data view or conflict case. Show partial-refresh errors honestly. |
| Documentation | Multiple guides and a searchable in-app manual | Workspace docs still contain old navigation names and actions. Update all guides together after each finished slice. Keep technical deployment instructions outside owner flows. |

## Daily UI boundaries

Product sales stays catalogue -> basket -> Payment Method -> receipt.

Payments & receipts starts on New payment. Add Jobs & invoices as a second, optional tab. Its first screen is a short list of open jobs with customer, due date, status and balance, plus New job. Details open only when a job is selected. Keep receipt history separate from unpaid invoices. The New payment screen must not acquire stock, recipes, tables or mandatory invoicing fields.

Order counter stays New order, Orders and Preparation. Menu, recipes, printer destinations and policy belong in Business settings.

Tables & tabs stays tables/named tabs -> selected bill -> add round or Take payment. Kitchen/bar queues remain operational. Table layout, menu and printer setup belong in Business settings.

## Proposed service-job lifecycle

A walk-in can continue paying immediately. A business needing work before full payment can create a job with a customer, description, quantities, prices and optional due date/note. Estimates are optional; creating a job should not require an estimate first.

- Estimate: a quotation, not a sale or proof of payment. Accepting it creates a job/invoice with a snapshot of the agreed lines.
- Job: instructions and status (New, In progress, Ready, Completed, Cancelled). Job progress and payment status are independent.
- Invoice: numbered amount owed with immutable issued pricing, amount paid, credited/refunded adjustments and balance. Draft invoices remain editable. After payment, corrections require a recorded adjustment rather than silently rewriting receipts.
- Payment: cash, POS Terminal or Bank Transfer against the invoice; supports a deposit or remaining balance. Each saved payment has its own receipt ID and reference. A deposit receipt must show money received and remaining balance; it must not falsely mark the whole invoice paid.
- Completion: Ready and Paid are distinct. The business can finish work before payment; releasing completed work with an outstanding balance should require an explicit policy/permission.
- Cancellation/refund: retain the original job and financial history; return money outside the app for externally recorded methods and record confirmation. Never delete a payment to make a balance appear correct.

Printing must offer separately labelled Estimate, Job ticket, Invoice and Payment receipt. A job ticket contains instructions rather than financial settlement totals. An invoice is an amount owed, not proof of payment. Paid receipts remain reproducible from saved snapshots.

Reuse the existing receipt, customer, monetary calculation, permission, printing, reporting and synchronization infrastructure. Introduce a distinct service-job/invoice aggregate; do not represent debt as a fake fully paid sale, restaurant table or stock product.

Do not count an invoice and its collected payments twice in revenue. Separate invoiced totals, money collected, outstanding balances and refunds. Explicitly define reporting treatment before implementing it; existing sales reports must continue reconciling to receipts. Recipe/stock costs remain unrelated to non-stock service jobs.

## Implementation order and acceptance gates

1. **Finish the existing selling and printing journeys.** Correct preparation-ticket layout, document labels and outdated guides; verify POS selection/default/removal and Refresh across active data views. Acceptance: each workspace can start, calculate, collect, print/reprint, recover after reload and handle a correction/refund without entering owner configuration mid-sale.
2. **Implement service jobs, invoices and deposit/balance payments as one complete slice.** Include local persistence, stable IDs, transaction/retry safety, issued-price snapshots, receipts, returns, permissions, reports, all supported local engines and compatible cloud synchronization. Acceptance: a 100-unit invoice paid 30 then 70 has two receipts, zero balance and no duplicated 100-unit sale; reload/retry and later price edits preserve it. Also test partial refund, cancellation after deposit, concurrent stale edits and offline recovery.
3. **Finish optional printer destinations and cross-device operations.** Acceptance: receipt, kitchen and bar destinations use existing supported hardware, reprints are identifiable, printer failure never duplicates a payment, original-till restrictions are enforced and conflicts remain reviewable. Do not claim automatic routing from content filtering alone.
4. **Finish first-use setup and owner guidance.** Acceptance: a new owner chooses a preset, enters real items/menu/tables only as needed and completes a first transaction; advanced fields remain optional. An existing supermarket retains its basket/display/scanner and can decline a preset.
5. **Conduct realistic acceptance sessions and release checks.** Use a supermarket queue, takeaway order paid before preparation, takeaway paid at collection, restaurant with two rounds/two payers, a bar tab and a print job with deposit. Repeat essential recovery cases on desktop, offline PWA and Android. Physical printers/scanners/POS devices require real hardware checks. Audit deployed sync compatibility before shared-device use.

Do not call a workspace complete solely because its settings, API or browser test exists. It must pass the daily end-to-end journey, document/output checks, recovery and money reconciliation. Missing courses/reservations/bookings, online delivery marketplaces and specialized hotel/pharmacy/manufacturing operations are later sector-specific work, not prerequisites for these four workflows.
