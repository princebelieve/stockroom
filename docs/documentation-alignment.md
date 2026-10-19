# Documentation alignment

Original full review: 2026-10-06. Incremental screen/subscription review: 2026-10-12. Current implementation reconciliation: 2026-10-19. The dated inventories below are snapshots, not permanent authorities. Generated builds, dependencies and release artifacts are not documentation authorities; current source code is.

## Current authority

Use [README](../README.md) for product scope, [workspaces](workspaces.md) for workspace choice, [user guide](user-guide.md) and its paired [in-app guide source](../src/user-guide.json) for staff instructions, [hospitality operations](hospitality-workspace.md) for hotel/nightlife workflows, and [report calculations](report-calculations.md) for financial treatment. Historical research and audits are snapshots; their old proposals or findings do not override these current guides.

The Markdown user-guide chapters match `src/user-guide.json`, which supplies Help and its downloadable text guide. When changing a user instruction, update both representations.

## Corrections made

- README now includes service jobs/invoices/deposits, Tables & tabs, Hospitality, recipe consumption, current cashier scope, reporting timezone and local development requirements.
- Prepared food with recipes consumes ingredients at preparation; counter packaged goods consume stock at payment; restaurant packaged goods consume stock at preparation. Refunds do not recreate cooked ingredients.
- Setup paths point to the focused Settings task selector: Available workspaces, Sales tasks, Receipt details, Service catalogue, and Devices. Product options and daily Cash register remain operationally separate.
- Reports use a synchronized business timezone, defaulting to UTC. Their expired-stock summary uses that calendar; inventory batch alerts and stock allocation still use UTC dates. The profit formula includes consumed recipe ingredients.
- Account-deletion default is 14 days, consistent with `cloud/index.mjs`, `cloud/account-deletion.mjs` and configurable plan settings. Previously README/PWA/public deletion text said 90 days.
- Direct subscriptions can use explicitly authorized recurring monthly/yearly Paystack renewal; public terms no longer describe every direct subscription as manual renewal. Play Store billing remains separate.
- Cloud legacy owner registration requires an enrolled device token; ordinary onboarding uses registration keys. All devices in one business share its business ID and have unique device IDs.
- Release examples use versioned Android artifact names. Landing documentation includes supported Paystack referral transfers and no longer asserts a particular hosting allowance or installer size.
- Unsupported claims about shops already using this version were removed. Historical setup recommendations are identified as implemented or still proposed.
- The Hospitality guide was rechecked against the current UI, server handlers and browser flows. The user guide and workspace overview now distinguish supported folio settlement, online invoice checkout, housekeeping history, cashier-reviewed night audit, and Channex-mediated channel sync from still-missing complete accounting, automatic till close, provider certification and property-specific deployment acceptance.

## Coverage

| Document | Areas checked |
| --- | --- |
| `README.md` | Product purpose, six workspace choices and shared Hospitality entitlement, platforms, roles, registration, reports and build commands. |
| `docs/hospitality-workspace.md` | Current hotel, nightlife and customer portal workflows; staff/branch reuse, invoice integration and limits. |
| `features.html` / `workspaces.html` | Public-facing descriptions of workspace choices and sector workflows. |
| `PWA-DEPLOYMENT.md` | Browser adapter, enrollment, cached offline session, sync/refresh, printing and release compatibility. |
| `cloud/README.md` | Authentication/enrollment endpoints, mail configuration, sync, subscription enforcement and capabilities. |
| `docs/app-updates.md` | Installed-client version notices and PWA service-worker updates. |
| `docs/business-completion-plan.md` | Implemented operations versus remaining rollout acceptance checks. |
| `docs/fast-food-workspace.md` | Menu setup, recipes, packaged stock, order states, settlement, retries and refunds. |
| `docs/google-play-billing.md` | Product flavors, verification/account binding, RTDN and versioned outputs. |
| `docs/handwritten-product-forms.md` | Local OCR, optional Vision proxy, markers, review, upload limits and data handling. |
| `docs/hardware-setup.md` | Device wizard, printing, drawer/cutter, scanner and display limits. |
| `docs/LANDING-AND-REGISTRATION.md` | Entry points, release download examples, registration-key flow and payouts. |
| `docs/navigation-review.md` | Current visible labels versus retained internal identifiers. |
| `docs/notifications.md` | Cloud-generated inbox, VAPID, Android FCM and offline limits. |
| `docs/payment-terminal-setup.md` | Ordinary manual device profile versus connected Paystack and proposed OPay adapter. |
| `docs/payments-and-receipts.md` | Immediate payment, estimates/jobs, deposits, refunds, printing and original-till restrictions. |
| `docs/paystack-terminal.md` | Product-sales controls, business-scoped credentials, verification and manual refunds. |
| `docs/pos-workflows.md` | Basket, cash register, returns, tax/rewards and optional stock allocation. |
| `docs/product-migration.md` | CSV mapping, duplicate handling, opening stock and excluded historical data. |
| `docs/product-purpose-and-competitor-review.md` | Historical research notice and current guide links; old sector-scope statements are not operational guidance. |
| `docs/report-calculations.md` | Report periods, taxes, receipt/refund costs, ingredients, losses and expenses. |
| `docs/restaurant-and-bar-workspace.md` | Bill sessions, rounds, station progress, partial settlement, moves/merges and stock effects. |
| `docs/service-payment-research.md` | Historical research/proposals clearly separated from implemented service jobs. |
| `docs/setup-and-sales-ui-review.md` | Current configuration locations and permissions; obsolete relocation proposals replaced. |
| `docs/subscriptions.md` | Renewal, configurable access/grace, referrals and payout handling. |
| `docs/supermarket-receiving.md` | Receiving, pack conversion, supplier accounts, batches and migration persistence. |
| `docs/supermarket-workspace.md` | Stock allocation, FEFO, restock-dependent refunds, reports and deployment limits. |
| `docs/universal-business-audit.md` | Historical notice; old workspace and hospitality statements are superseded by current guides. |
| `docs/user-guide.md` / `src/user-guide.json` | Matching staff instructions, settings, reporting timezone and recipe terminology. |
| `docs/workspaces.md` | Presets, workflow boundaries, service jobs, provider defaults and data updates. |
| `public/privacy.html` | Described storage/providers, optional OCR/notifications and account-deletion default. |
| `public/terms.html` / `account-deletion.html` | Factual subscription renewal and account-closure behavior. |

## What this confirms

The October 6 review confirms the implementation facts listed in its coverage table as of that date. The October 19 reconciliation verifies hotel-facing claims against current source and browser workflows. It does not certify that current code is deployed, that provider credentials are configured, that released installers contain these changes, or that a property's operational and statutory requirements are satisfied. Historical audits retain their original dates and findings; follow current operational guides when they differ.

## Incremental review: 2026-10-12

- Complex Settings, Inventory, Staff & access, and Subscription screens use a searchable task selector for focused task views. The selector navigates between tasks; it does not itself save configuration or enable workspaces.
- Existing-business Settings separates business type, enabled workspaces, workspace catalogues, reporting timezone, and product form. The highlighted workspace name identifies which catalogue dropdown choices are being edited.
- Staff & access separates Team members and Access permissions; the user guide now reflects the available Add staff, Sign-in links, and conditional password-reset tasks.
- The Subscription guide now explains the explicit Free plan, paid workspace entitlements, renewal cancellation, expiry fallback to Payments & receipts, and the difference between trial expiry and paid-plan grace.
- `docs/user-guide.md` and `src/user-guide.json` are the paired owner/staff instructions. Both were updated together for the changed navigation and subscription behavior. `support.html` remains a contact/how-to route and does not promise a separate support workflow.
- The app's contextual “Help for this screen” descriptions in `src/lib/screenHelp.ts` now describe the focused task selector, separate staff access task, and trial/grace/expiry behavior in concise screen-specific language.
- Historical audit notes are not rewritten as if they described today's UI. Update their date or mark them historical when reusing them as operational instructions.

## Verification results

The initial October 6 review inventoried 29 project Markdown documents. The October 12 incremental pass reconciled task-navigation and subscription guides against that source snapshot. Relative-link and guide-pair checks are only claimed when rerun. That historical pass changed documentation only; it did not certify physical-device/provider acceptance.

## Current implementation reconciliation: 2026-10-16

- The app offers six workspace choices: Product sales, Oil sales, Payments & receipts, Order counter, Tables & tabs, and Hospitality operations. Payments & receipts is the free workspace. Hotel operations and Nightlife operations are independent settings that open the same Hospitality destination and count together as one subscription entitlement. Overview labels the destination according to the selected option(s).
- Hotel implementation includes room records/rates/status, overlap-checked stay bookings, a monthly availability calendar, housekeeping state/staff assignment/schedule, invoice and folio charges, stocked-product charges, payment-gated check-out, customer booking and QR passes.
- Nightlife implementation includes events, capacity, assigned host/door lead, guest entries, admission invoices, paid check-in, customer event/table bookings and QR passes. Event table reservations and tabs reuse Tables & tabs; that workspace retains its own food/drink ordering and settlement.
- Customer portal booking is online. It can link to a signed-in customer account and show linked invoice balances/wallet balance; invoice payment is recorded by business staff through Jobs & invoices. Staff roles use existing staff accounts and branch permissions.
- Workspace subscription decisions follow the developer enforcement switch. With enforcement on, Save workspaces compares the selection against current entitlement; with enforcement off it does not block the save. The over-limit dialog carries the pending workspace count and names to Subscription, prices the requested count, and preserves the selection across checkout. Confirmed payment grants the requested count; the owner then returns to Business settings and saves the workspace selection. The application build passed after this reconciliation; production deployment and payment-provider acceptance remain separate.
- Historical documents with obsolete hotel/nightlife claims are marked or corrected: [universal business audit](universal-business-audit.md), [product purpose review](product-purpose-and-competitor-review.md), [business completion plan](business-completion-plan.md), [restaurant guide](restaurant-and-bar-workspace.md), and [supermarket guide](supermarket-workspace.md).
- This is a source-to-document review, not proof of production deployment or an end-to-end acceptance run. The build verifies documentation-source compilation; QR camera behavior, customer booking on live services, deployed hospitality sync compatibility, and real business workflows require their own checks.

## Account closure and removal controls

Only owners can open business account deletion; staff cannot see or call that workflow. Promoters close their own promoter account. Both flows show a warning screen with Cancel and a red confirmation button; owner confirmation additionally requires typing DELETE. Deactivation is immediate, deletion is scheduled after the configured waiting period (14 days by default), and cancellation is available before the deadline. Offline copies and recurring subscriptions require separate handling.

Removal controls in order baskets, intake rows, purchase lines, split payments, recipe ingredients, menus, service lines, table layouts and stock-pool assignments modify drafts or configuration. Clear filters resets filters; Remove one records a stock reduction; branch deactivation retains branch records; removing a custom field hides it. Completed sales use the existing return/void workflows. These handlers were traced, rather than all being tested on physical devices. The inert topbar Filter icon was removed.

Staff & access provides creation, roles, operational access, password recovery and owner-only Remove staff. Removal requires owner password confirmation, disables the retained profile, revokes cloud sessions, and sends a removal record through sync. Local sign-in/session recovery cannot reactivate a removed identity. Historical sales/activity remain; usernames remain reserved. Devices receive this change when they reconnect and sync.

Navigation, request parsing, status retry, pending-business access checks and scheduled cloud cleanup were corrected. Changes require client release and cloud deployment. Review documents describe repository state at the dated review, rather than guaranteeing deployed behavior.
