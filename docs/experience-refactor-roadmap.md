# App experience refactor roadmap

## Purpose

This is the working map for improving the app's visual clarity and day-to-day feel. It records the intended journey, boundaries, checkpoints and completion conditions so work can resume from the last marked step. Every screen matters to the person using it. The phase order is a work sequence only; it does not rank screen importance or decide which screens receive attention.

The goal is a confident, lively business tool on both desktop and phone: owners should see the important status, recognize the main action and move through work without reading a wall of explanation. Desktop is a first-class layout target, not a stretched phone view or a final responsive check. We can learn from the quick visual feedback and clear priorities in other sales apps without copying another app or turning this one into a game.

The attached DothPro photos are visual references. Even though the photos are faint, they show a desktop workspace with generous open space, a persistent left menu, small colored status/action tiles, strong section bars, and separate work panels. The second photo also shows a dense records area balanced with a chart and another summary panel. The useful direction is clean, tactile surfaces with clear depth and color cues, while keeping tables and operational data easy to scan.

## Product rules to preserve

- One task belongs on one screen. Buttons identify and navigate to the next task.
- Give every destination screen its own deliberate layout and complete review. Overview is simply where the audit starts, not the most important screen.
- Keep setup and configuration away from transaction entry.
- Put detailed guidance in that screen's Help & support explanation. Keep validation and transaction feedback beside the action that caused it.
- Give each screen a clear purpose, a visible primary action, and a useful result or status.
- Make frequent actions easy to reach on a phone as well as desktop.
- Design desktop and phone compositions deliberately: use the available desktop width for well-proportioned panels and useful side-by-side work areas; use a focused, touch-friendly flow on phone.
- Use clear visual hierarchy and polished, tactile-feeling surfaces: spacious cards/panels, purposeful accent bars, compact status/action tiles, and restrained depth. Avoid flat, text-heavy document layouts.
- Use color, icons, charts, product images, status badges and small motion only when they make meaning or progress clearer.
- Preserve existing routes, saved data, workspace separation, permissions, offline behavior, and sales, stock and payment calculations unless a separately reviewed change requires otherwise.
- Do not treat visual polish as evidence that a workflow works. Check the screen's actual behavior and its connected data.

## Journey map

| Phase | Work sequence | Completion checkpoint | Status |
| --- | --- | --- | --- |
| 0. Baseline | Record current screen on desktop and phone, role, workspace and key interaction | Reproducible before pictures and observed issues at both sizes | In progress |
| 1. Direction | Set shared visual and interaction principles using the attached desktop references and current app examples | A design language for spacious desktop panels, tactile surfaces, hierarchy, color, status, motion and phone behavior | Complete |
| 2. Daily landing | Review Overview after baseline | Overview's own task and information are clear and well presented | In progress |
| 3. Core work | Product sales / Oil sales / Payments & receipts / Order counter / Tables & tabs | Each screen supports its main task with clear state changes and immediate feedback | Not started |
| 4. Stock work | Find or add product, receive/count/move stock, inspect result | Product and stock tasks remain distinct, navigable screens | Not started |
| 5. Records and decisions | Sales history, customers, expenses, reports, staff activity | Lists and figures are scannable; alerts and next actions are easy to identify | Not started |
| 6. Setup and recovery | Settings, help, sync, permissions, subscription and empty/error states | Configuration remains separate; recovery is understandable and actionable | Not started |
| 7. Consistency pass | Check workspace variants, desktop compositions, phone layouts and key roles | Shared components behave consistently without erasing workspace-specific needs; desktop is independently reviewed, not merely scaled | Not started |
| 8. Acceptance | Recheck real journeys, accessibility, responsive behavior and release build | Agreed acceptance list passes and this roadmap is marked complete | Not started |

## Screen-by-screen review queue

This queue names destination screens rather than bundling tasks together. All rows receive an individual review and a finished result. The row order is an execution convenience, not a priority ranking. Add rows whenever code inspection or a real user journey reveals another distinct destination. Record the current screen and exact evidence before changing it.

| Screen / destination | What to inspect | Status |
| --- | --- | --- |
| Overview | Today's sales, active work, stock attention, workspace choice and primary actions | In progress |
| Introduction and sign-in / registration | Welcome journey, sign-in and sign-up fields, validation and recovery | Not started |
| Branch selection | Available businesses/branches, selected state and continue action | Not started |
| Workspace and business setup | Workspace selection, business type and each separate setup step | Not started |
| Payment method list and add/edit | Existing methods, add method task, store selection and saved state | Not started |
| Sales task navigation | Workspace-specific entry to new sale, sales records and customer balances | Not started |
| Product sales | Catalogue search, basket, payment handoff and completion feedback | Not started |
| Oil sales | Oil-specific product selection, quantities and checkout | Not started |
| Payments & receipts | Payment tasks, jobs/invoices, payment completion and receipt access | Not started |
| Order counter | Order entry, preparation/collection states, payment and active queue | Not started |
| Tables & tabs | Table selection, adding rounds, bill state and settlement | Not started |
| Product catalogue | Search, add/edit product, starter catalogue and import entry points | Not started |
| Add or search product | Product lookup/search, scan entry point and continue-to-add action | Not started |
| Product list | Product totals, search, category/status filters, empty/populated list and product actions | Not started |
| Purchasing and receiving | Supplier/delivery task, saved result and related next destination | Not started |
| New supply | Product selection, supplier, quantities/costs, save and stock result | Not started |
| Supply records | Supply history, find/inspect record and follow-up action | Not started |
| Stock count | Count entry, discrepancy review and save result | Not started |
| Stock movements | Transfer/adjustment tasks and movement history | Not started |
| Sales history | Find, inspect, reprint and authorized return actions | Not started |
| Sales records search and filters | Receipt search, time/payment/customer/staff filters, results and empty state | Not started |
| Customer accounts | Search, customer activity, balances and next action | Not started |
| New customer | Single-purpose customer form, optional details, validation and save result | Not started |
| Customer balances / owing records | Owing and owed views, filters, search and useful empty state | Not started |
| Expenses | Expense list, single-purpose entry and saved result | Not started |
| New expense | Single-purpose expense entry, validation and saved result | Not started |
| All expenses | Expense history, filters, totals and record inspection | Not started |
| New supplier | Single-purpose supplier entry, validation and saved result | Not started |
| Supplier list | Supplier search, records and relevant actions | Not started |
| Reports | Key business figures, time range, chart/table readability and follow-up actions | Not started |
| Staff & access | Role clarity, permissions and staff activity | Not started |
| Business settings | Separate settings destinations, selection controls and save feedback | Not started |
| Main menu and menu groups | Navigation labels, group expansion, current screen, account/support and sign-out | Not started |
| Notifications and feature notices | Relevant alert, one clear next action, dismissal and persistence choice | Not started |
| Help & support | Screen-specific answers and direct links to the relevant next task | Not started |
| Sync and recovery | Current sync state, understandable failure reason and retry/recovery actions | Not started |

## Working method

For each screen, complete these steps before marking its row done. Desktop and phone are separate review contexts; passing one does not imply passing the other:

1. Capture or describe the existing behavior on a representative desktop size and phone size, including a realistic empty state and populated state where applicable.
2. Record who uses the screen, what they came to do, the main action, the expected result, and any permission or workspace differences.
3. Identify the specific causes of visual clutter, weak hierarchy or unclear feedback. Keep unrelated screens out of the change.
4. Make the smallest coherent improvement within the screen's task boundary.
5. Verify the interaction and data result, desktop composition, phone layout, keyboard/accessibility basics, and relevant saved state. Record exactly what was checked and what was not.
6. Update this roadmap's row, checkpoint, and any supporting screen documentation before moving on.

Do not add explanatory paragraphs to compensate for unclear navigation. Improve the label, layout, state or button flow; put necessary detail in screen-specific Help & support.

## Overview baseline findings

**Screen purpose:** Give the owner a useful view of the selected selling workspace and a direct way to enter its next task. This is a landing destination; it does not combine product, order, payment, or stock tasks into one screen.

**Phone, first-use state:** [Existing rendered screenshot](screenshots/fresh-overview.png), captured at 390 px wide. The screen shows the business header, a selling-workspace dropdown, then a centered empty state with an inbox icon, explanatory paragraph and one primary button. There is a large quiet area between the workspace selector and the empty-state message. Product starter/import/scan actions and the records shortcuts appear farther down or only in the no-products state. It is clear that the account is new, but it does not use the screen space to show much business context.

**Desktop, first-use state:** [Rendered 1440 x 1000 capture](screenshots/experience-overview-desktop-before.png) from an isolated new business. Browser measurements confirmed a 280 px navigation and 1160 px main content area, with no horizontal overflow. The Overview itself remains a centered empty state with a large open area; its content is not arranged into desktop-specific panels. Its workspace selector and empty state retain the same vertical sequence as phone.

**Active-state behavior from source:** The owner chooses one selling workspace at a time. The screen shows that workspace's recorded total for today and its start action. Counter, restaurant and payment workspaces additionally fetch active work for only the selected workspace; the overview does not show active counts for all enabled workspaces at once. A fetch failure appears as a message directing the owner to open the corresponding selling screen. The selected workspace's history, customers and expenses are separate shortcut buttons.

**Baseline boundary:** First-use states are captured at both sizes. Populated behavior and workspace options were inspected in source; role visibility is gated to owners, admins, or staff with operational access. The next interaction review will check those source-described states in the running UI.

## Overview proposed direction and implementation

The DothPro desktop reference informs the panel treatment, not a screen hierarchy. The Overview now uses a large work panel beside a separate related-work panel on desktop. The first-use product setup actions remain separate destination buttons. On phone, the same information is stacked in a touch-friendly column and the main action fills the available width; it is not a compressed desktop grid. After-sale states use a prominent daily amount, transaction count, optional active-work count and the selected workspace action.

**Current implementation status:** First-use and no-product Overview layout implemented in `WorkspaceOverview.tsx` and `operational.css`. The PWA production build passes. Desktop and phone first-use previews were inspected. Active/records behavior, workspace variants, and role-specific visibility still need interaction review before this screen can be marked complete.

## Reference journey represented in the supplied images

The supplied ShopKite screenshots are examples of screen variety and navigation, not instructions to copy their exact behavior or styling. They show an introduction, sign-up and sign-in, business type and branch selection, loading, sales and product entry points, menu groups for sales, products, supplies, expenses and customers, payment method list/add, new supply, sales records, product list, customer entry, customer balances, and a feature notice. Review each corresponding destination in this app on its own. If one screenshot shows a task without a matching row above, add that destination rather than absorbing it into a neighboring task.

## Checkpoint log

| Checkpoint | Date | Completed | Evidence / next step |
| --- | --- | --- | --- |
| Roadmap created | 2026-10-10 | Journey, boundaries and screen queue documented | Next: Phase 0, baseline the Overview on desktop and phone, including sales workspaces and fresh/active states. |
| Desktop direction added | 2026-10-10 | Added the attached DothPro desktop references and explicit desktop-first-class review criteria | No UI changes yet. Continue Phase 0 by capturing the Overview at desktop and phone sizes. |
| All screens clarified as equal scope | 2026-10-10 | Stated that phases are execution order, not screen priority; expanded the queue using the supplied ShopKite journey images | Continue baseline with Overview, then apply the same full review and quality bar to every destination. |
| Overview baseline started | 2026-10-10 | Recorded the existing 390 px phone fresh state, captured the 1440 px desktop fresh state in an isolated business, measured desktop navigation/content widths, and inspected empty/active behavior | Phase 0 remains open. Capture representative active states at both sizes and confirm workspace/role variants, then finish the Overview baseline. |
| Overview first-use layout implemented | 2026-10-10 | Added a tactile desktop panel layout and separate phone stacking; preserved task-per-screen navigation and added daily transaction/status tiles for populated states | `npm run build:pwa` passes. Continue with active-state, workspace-variant and role review; then close the Overview screen row. |

## Current stopping point

**Active phase:** Phase 2 — Daily landing (Overview)  
**Last completed:** Overview fresh state recorded at 390 px phone and 1440 px desktop; desktop dimensions measured; visual direction documented; first-use Overview refactor implemented.  
**Next:** Review populated Overview behavior at desktop and phone sizes, including today's totals, open counter/restaurant/payment work, workspace switching, and role access. Finish this screen before moving to another destination. Apply the same care and review depth to every screen in the queue; starting with Overview does not rank its importance.

## Definition of done

This refactor is complete when:

- Every destination screen in the queue is individually verified complete or explicitly removed with a reason. No screen is skipped because another screen was considered more important.
- All eight phases have a recorded outcome, including the final acceptance pass.
- Each screen has one recognizable purpose and one clear primary task; next steps are navigated to by buttons or links.
- Each screen presents the information and actions needed for its own task without burying them in long instructions or undifferentiated lists.
- Status, success, warning, empty and failure states are visually distinct and explain the next available action.
- Desktop and phone layouts are each intentionally composed and usable; desktop uses available width with balanced panels and legible data, while phone keeps a focused touch-friendly flow. Text, controls, focus, contrast and motion meet the project's accessibility expectations.
- Workspace rules, role permissions, saved data, offline use, calculations and recovery flows have been checked for unintended changes.
- Supporting docs match the shipped behavior, and the final checkpoint identifies what was verified, the build/release state, and known limitations.

## Related documentation

- [Navigation review](navigation-review.md)
- [Setup and sales UI review](setup-and-sales-ui-review.md)
- [Refactor comparison](refactor-comparison.md)
- [Workspace guide](workspaces.md)
