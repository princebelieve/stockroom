# Business app completion plan

Review date: 2026-10-06; current scope reconciled 2026-10-16. The original five-workspace plan below is historical. The app now also includes the Hospitality destination, with independently selectable Hotel operations and Nightlife operations under one entitlement. See [current hospitality workflow](hospitality-workspace.md). This plan distinguishes implemented code from deployment and real-device acceptance; do not treat old out-of-scope statements below as current product limits.

## Evidence and comparison

The review inspected ShopSetup and shared shop-profile settings, main navigation/printing/refresh, ServicePayments, CounterService, RestaurantService, RestaurantPayment, recipe modules, pricing/payment modules, existing workspace documentation and workflow tests. Automated checks cover the four general selling screens, and separate browser checks exercise oil pricing. This is not a physical-device, deployment or production acceptance audit.

Use official examples as operational references rather than a feature-shopping list:

- [Square modes](https://squareup.com/help/us/en/article/8458-use-modes-with-square-point-of-sale): different selling operations have different modes.
- [Loyverse open tickets](https://help.loyverse.com/help/open-tickets): save a ticket before collecting payment.
- [Loyverse unpaid bills](https://help.loyverse.com/help/how-print-bill): a bill precedes a payment receipt.
- [Loyverse kitchen printers](https://help.loyverse.com/help/using-kitchen-printers): preparation work and customer receipts have separate printing purposes.
- [Square invoices](https://squareup.com/help/us/en/article/8387-create-and-send-invoices) and [deposits](https://api.squareup.com/help/us/en/article/6581-request-deposits-with-square-invoices): invoices retain amounts owed and accept payments over time.
- [Square projects](https://squareup.com/us/en/invoices/features/project-management): customer jobs can link estimates, invoices, payments and notes.

These sources establish comparable workflows, not exact equivalence, platform availability or a requirement to copy their paid features.

## What exists and what remains

| Area | Implemented operations | Remaining release verification |
| --- | --- | --- |
| Product sales | Original catalogue, basket, payment-reference scanner, customer display, checkout, returns and stock operations retained | Physical scanner/customer-display devices. |
| Payments & receipts | Immediate multi-line payments; separate Jobs & invoices; estimates, job progress, deposits/balances, receipts, refunds and cancellation without stock | Existing production sync deployment and real printer. |
| Order counter | Menu/extras, recipes/ingredient costs, preparation, corrections/cancellation, pay-before-preparation or pay-at-collection, dining options and mixed payment | Busy-counter acceptance on installed devices. |
| Tables & tabs | Tables/seats/named tabs, repeated rounds, kitchen/bar readiness, itemized bills, partial/item/seat/equal-share and mixed payments, closing/history/move/merge/refunds | Multiple actual tills with the deployed compatible sync service. |
| Hospitality operations | Hotel rooms, stay calendar/bookings, housekeeping readiness/staff/schedule, linked invoices/folios and stocked-product charges; nightlife events, assigned staff, guest lists, admission invoices/QR check-in and customer portal bookings; event-linked tables/tabs when enabled | Current customer/staff flows and sync require deployed compatible services; real-device QR scanning and an operational hotel/nightlife pilot remain release acceptance. The feature is not a full PMS or ticket/accounting suite. |
| Printing | Existing printer handles the selected receipt, order review, preparation ticket, bill, estimate, job ticket or invoice; 58/80 mm layouts | Physical output and platform printer drivers; content filtering does not imply automatic routing. |
| Business setup | New-owner preset selection, existing-owner preview/apply, initial product/menu checklist and separate owner configuration | First-use acceptance with business owners. |
| Refresh and Sync | Download-only Refresh, deliberate upload/download Sync, preserved drafts/pending invoice work and manager report refresh | Real network interruptions and deployed compatibility. |
| Documentation | Workspace guides and searchable in-app guide updated with the same operations | Owner feedback on the instructions. |

## Daily UI boundaries

Product sales stays catalogue -> basket -> Payment Method -> receipt.

Payments & receipts starts on New payment and includes Jobs & invoices as a second, optional tab. Its first screen is a short list of open jobs with customer, due date, status and balance, plus New job. Details open only when a job is selected. Keep receipt history separate from unpaid invoices. The New payment screen must not acquire stock, recipes, tables or mandatory invoicing fields.

Order counter stays New order, Orders and Preparation. Menu, recipes, printer destinations and policy belong in Business settings.

Tables & tabs stays tables/named tabs -> selected bill -> add round or Take payment. Kitchen/bar queues remain operational. Table layout, menu and printer setup belong in Business settings.

## Service-job lifecycle

A walk-in can continue paying immediately. A business needing work before full payment can create a job with a customer, description, quantities, prices and optional due date/note. Estimates are optional; creating a job should not require an estimate first.

- Estimate: a quotation, not a sale or proof of payment. Accepting it creates a job/invoice with a snapshot of the agreed lines.
- Job: instructions and status (New, In progress, Ready, Completed, Cancelled). Job progress and payment status are independent.
- Invoice: numbered amount owed with immutable issued pricing, amount paid, credited/refunded adjustments and balance. Form drafts remain editable until saved. Saved estimates and issued jobs retain their agreed details; replacement uses recorded refunds and cancellation rather than silently rewriting receipts.
- Payment: cash, POS Terminal or Bank Transfer against the invoice; supports a deposit or remaining balance. Each saved payment has its own receipt ID and reference. A deposit receipt must show money received and remaining balance; it must not falsely mark the whole invoice paid.
- Completion: Ready and Paid are distinct. The business can finish work before payment; this implementation requires full payment before marking a job Completed.
- Cancellation/refund: retain the original job and financial history; return money outside the app for externally recorded methods and record confirmation. Never delete a payment to make a balance appear correct.

Printing must offer separately labelled Estimate, Job ticket, Invoice and Payment receipt. A job ticket contains instructions rather than financial settlement totals. An invoice is an amount owed, not proof of payment. Paid receipts remain reproducible from saved snapshots.

Reuse the existing receipt, customer, monetary calculation, permission, printing, reporting and synchronization infrastructure. Introduce a distinct service-job/invoice aggregate; do not represent debt as a fake fully paid sale, restaurant table or stock product.

Do not count an invoice and its collected payments twice in revenue. Separate invoiced totals, money collected, outstanding balances and refunds. Current reporting counts collected receipts and refunds; issued invoice totals are not additional revenue. Keep this treatment when extending reporting. Recipe/stock costs remain unrelated to non-stock service jobs.

## Acceptance checks before release

The operations below are implemented locally. These are verification criteria, not a list of missing features; production deployment and physical-device acceptance remain separate.

1. **Finish the existing selling and printing journeys.** Correct preparation-ticket layout, document labels and outdated guides; verify POS selection/default/removal and Refresh across active data views. Acceptance: each workspace can start, calculate, collect, print/reprint, recover after reload and handle a correction/refund without entering owner configuration mid-sale.
2. **Verify the implemented service jobs, invoices and deposit/balance payments.** Include local persistence, stable IDs, transaction/retry safety, issued-price snapshots, receipts, returns, permissions, reports, all supported local engines and compatible cloud synchronization. Acceptance: a 100-unit invoice paid 30 then 70 has two receipts, zero balance and no duplicated 100-unit sale; reload/retry and later price edits preserve it. Also test partial refund, cancellation after deposit, concurrent stale edits and offline recovery.
3. **Finish shared-printer document handling and cross-device operations.** Acceptance: receipt, order review, preparation ticket and bill layouts use the same existing supported receipt printer, reprints are identifiable, printer failure never duplicates a payment, original-till restrictions are enforced and conflicts remain reviewable. Do not claim automatic routing from content filtering alone.
4. **Finish first-use setup and owner guidance.** Acceptance: a new owner chooses a preset, enters real items/menu/tables only as needed and completes a first transaction; advanced fields remain optional. An existing supermarket retains its basket/display/scanner and can decline a preset.
5. **Conduct realistic acceptance sessions and release checks.** Use a supermarket queue, takeaway order paid before preparation, takeaway paid at collection, restaurant with two rounds/two payers, a bar tab and a print job with deposit. Repeat essential recovery cases on desktop, offline PWA and Android. Physical printers/scanners/POS devices require real hardware checks. Audit deployed sync compatibility before shared-device use.
6. **Accept Hospitality end to end.** Test a hotel-only business, a nightlife-only venue, and a business with both flags; verify the Overview destination label, staff permissions, guest portal booking, QR check-in, invoice/deposit/receipt and cancellation paths. For hotels, include overlapping room dates, housekeeping readiness/assignment, folio product stock deduction and paid check-out. For nightlife, include capacity, assigned host/door lead, paid/free admission, event-linked table reservation/tab, cancellation and settlement. Verify branch separation, offline/sync conflict handling and real phone camera scanning. The code-level workflow is documented; this list is outstanding acceptance, not a claim that these scenarios have been run.

Do not call a workspace complete solely because its settings, API or browser test exists. It must pass the daily end-to-end journey, document/output checks, recovery and money reconciliation. Hotel bookings and nightlife admissions now exist and are in scope for acceptance. Room-rate/channel management, ticket marketplaces, online delivery marketplaces, and specialized pharmacy/manufacturing operations remain separate capabilities.


Implementation update: preparation tickets now omit prices and payment totals; order reviews remain printable; itemized bills print paid amount and balance due; receipt lines use a stacked layout for 58/80 mm rolls. Payments & receipts offers direct manager refunds through the existing return engine. Refresh now also reloads reports, expenses and sale voids for managers. Jobs & invoices now provides optional estimates, issued invoices, job stages, deposit/balance payments, saved receipts, amount-based refunds and cancellation. A 100 invoice paid 30 then 70 records two payments totalling 100, with no stock deduction or duplicated invoice revenue. New-owner setup offers business presets; Overview offers initial item/menu setup links without moving configuration into checkout. Order counter supports dining options and mixed payments.

Automated verification covers transaction rollback, payment retry/stale revisions, saved invoice prices, invoice tax allocation, refund/balance reconciliation, cancellation permissions, non-stock accounting and receipt replay on another local database. Browser journeys cover the selling screens, including Oil sales, and offline browser persistence/sync. The shared local operation handler is used by desktop, PWA and Android; actual Android devices, physical printers/scanners and production Mongo synchronization have not been exercised by these checks.

The existing sync service adds the service-jobs-v1 capability. Later source adds hospitality-operations-v1, but this document does not establish that the deployed sync service has it. Confirm deployed capability compatibility before shared-device hospitality use. No additional paid service is introduced. Course sequencing, automated dispatch systems, online marketplace integrations and full PMS functions remain outside the implemented workflows.

## Agreed adoption batches

The agreed backlog includes completed payment/service improvements (batch 1), job material use and food production/yields (batch 2), and reservations with browser checks and aligned guides (batch 3). Batch 4 adds structured church funds, donor identities, pledges, received contributions and refund-adjusted statements through the existing payment engine. It does not provide fund spending or full charity accounts. Compatible sync deployment and real-business acceptance remain required.

Batch 5 adds oil bulk thresholds and customer-account rates using combined base-unit quantities across loose oil and containers, with receipt price snapshots. Desktop container loading now reads the saved business profile. Batch 6 implements reviewed keyboard-output weights and configured EAN-13 gram labels. Actual scale models remain unverified; serial/live protocols need specific adapters. Batch 7 adds recoverable register commands, original-till shift controls, owner/admin staff-shift review and corrected cash-extra/refund attribution. Automated trading-day reconciliation and browser recovery checks are simulated acceptance, not a real-business pilot. Batch 8 aligns catalogue names, preset previews, in-app help and sector claims with implemented capabilities; see [sector scope](workspaces.md#sector-scope). Hospitality implementation is recorded in [Hotel and nightlife operations](hospitality-workspace.md); real customer/staff acceptance and deployed sync remain to verify.

Reliability follow-up: the owner reports successful XPrinter, LaserJet, barcode-scanner and real-transaction testing. Existing support contacts are retained and now appear in the in-app guide. Sync issues show competing records and require a checked outcome with local review history. Reconciliation covers transfers and split-payment portions plus missing statement entries. Windows backups now handle supported additive upgrades; unsupported schema conversions remain explicitly rejected.
