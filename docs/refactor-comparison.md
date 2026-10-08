# Frontend and backend refactor comparison

The comparison baseline is commit `9f19007`, before the initial screen refactor. Commit `9953cde` already contains the first changes and is not the original baseline. An isolated checkout of `9f19007` was built and run with synthetic business data; existing business data was not used or changed.

The Shopkite filenames describe a journey: introduction (Screens 1–5), registration/sign-in (6–8), branch choice (9–10), loading and payment setup (11–16), navigation (17 and menu images), then individual supply, expense, sales and debt tasks (18–22). These are references for task separation, empty states and gradual setup. They do not require a desktop app to become a phone layout, or the example merchant's personal details to be copied.

## Before and after

| Area | Original / refactor problem | Current change |
| --- | --- | --- |
| Fresh Inventory | Empty catalogue followed by transfer, expiry, pricing, purchasing, import and product-option panels | Separate task selection; empty catalogue explains the next action |
| Entry | Long setup and operational configuration mixed into entry | Introduction, sign-in/registration, three account steps, review and branch choice; operational setup remains available later |
| Branch choice | Failed request silently creates a Main-branch placeholder | Display the API error, disable Continue, offer retry and sign-out |
| Desktop | Early refactor applied drawer navigation at all sizes | Persistent desktop sidebar and full-width workspace; drawer on narrower screens |
| Sales, staff, customers, expenses | Lists and unrelated creation/configuration forms share a page | Selected task displays its own content; customer, supplier and expense saves lead to the corresponding list |
| Navigation | Subsection changes did not enter browser history | Back/Forward, reload and legacy purchasing hashes restore the selected task; unknown sections fall back safely |
| Purchasing draft | Changing Inventory tasks unmounted the form | Keep purchasing state while switching Inventory tasks; its content is hidden outside the selected task |
| Purchasing retry | Server errors discarded the pending request ID | Retain the ID for server errors and lost responses; retry uses the same operation |
| Reports | Refactor's empty state hid stock valuation before the first sale | Only show a wholly empty report when there are no sales, stock or profit inputs |
| Overview | Removing panels also removed active-work information | Load active orders, open bills or unpaid invoices for the selected workspace; daily payments use that workspace and business timezone |
| Staff access | Purchasing-only staff saw product modification tasks | Show purchasing as their Inventory task; hide stock editing/transfer choices. Sales task choices respect sales/refund permissions |

Original mobile [Inventory](screenshots/before-inventory.png), [Overview](screenshots/before-overview.png), [Settings](screenshots/before-settings.png), and [desktop Inventory](screenshots/before-desktop-inventory.png) were captured from the isolated baseline. Compare with current [mobile Inventory](screenshots/fresh-inventory.png), [desktop Inventory](screenshots/desktop-inventory.png), [supplies](screenshots/fresh-supplies.png), [branch entry](screenshots/entry-branch.png) and [account review](screenshots/entry-review.png). These are real rendered screenshots from isolated test businesses.

## Frontend/backend contract comparison

| Workflow | Frontend | Desktop backend | Browser / Android local backend |
| --- | --- | --- | --- |
| Account and branch entry | `main.tsx` registration/login and branch choice | `server/index.mjs`, `cloud-auth.mjs`, repository session/branch functions | `browserApi.ts`, `mobileApi.ts` |
| Product sale and receipt | POS basket, payment and receipt history | `/api/sales`, repository sale transaction and stock ledger | Local SQLite sale transaction, stock ledger and outbox |
| Supply and supplier accounts | `Purchasing.tsx`, pending operation ID | `/api/retail`, `retail.mjs` | Shared retail handler and local outbox |
| Customer accounts | Customer creation, balances and history | `/api/customers`, wallet repository operations | Local customer and wallet handlers |
| Food / restaurant work | `CounterService.tsx`, `RestaurantService.tsx` | Shared counter/restaurant handlers, preparation and payment validation | Same shared domain handlers, local persistence and sync |
| Reports and expenses | Separate summary, stock, expense list and entry tasks | `reports.mjs`, report charts, expense repository | Shared report calculation and local expense handlers |
| Staff access | Screen and task visibility | `staff-permissions.mjs`, operation-level checks | Same permission rules and shared operation handlers |

The original desktop server could fall back to Main when no active branch was permitted. Browser/Android rejected this for staff, but also blocked recovery operations and allowed an owner fallback. Branch-dependent operations now reject this condition consistently. Account/session and branch-management routes remain reachable for recovery. The operation classification is shared through `server/branch-access.mjs`; the desktop active-assignment check has an integration regression test that verifies a rejected sale leaves stock unchanged.

Sale calculations, stock consumption, refunds, recipe costs, supplier balances, subscription enforcement and outbox semantics are retained. A frontend reorganization does not justify replacing validated financial and stock logic. No existing business database migration is required by these changes.

## Verification and limits

- Production TypeScript/Vite build passes. Vite still warns about a bundle over 500 kB; this is an existing performance concern, not a failed build.
- All 290 Node tests pass after the branch changes. Coverage includes API permissions, sale idempotency, offline persistence/sync, stock pools, refunds, counter recipes and financial reports.
- The usability browser test covers fresh states, isolated tasks, successful supplier/customer creation, draft retention between Inventory tasks, real product checkout and receipt persistence, stock reports before sales, mobile drawer/desktop sidebar, Back/Forward/reload, real local sign-in, failed branch loading/retry, and registration-step value retention.
- Three older browser scripts were also run against the original baseline. Purchasing timed out on its Pack conversions selector; supermarket checkout and service payments timed out locating Business settings. These baseline failures are recorded, not counted as successful workflow validation.
- Registration-step checks use a mocked settings response and do not prove production cloud enrollment. Physical printers, native Android packaging, production payment integrations and live multi-device synchronization were not exercised by this browser run. Node tests cover their local rules, not real hardware or production services.

This comparison establishes the implemented screen and contract changes. It is not a claim that every legacy browser script, production integration or platform package has completed release acceptance.
