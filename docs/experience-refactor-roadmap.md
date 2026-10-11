# App experience refactor roadmap

## Purpose

This is the working map for improving the app's visual clarity and day-to-day feel. It records the intended journey, boundaries, checkpoints and completion conditions so work can resume from the last marked step. Every screen matters to the person using it. The phase order is a work sequence only; it does not rank screen importance or decide which screens receive attention.

The goal is a confident, lively business tool on both desktop and phone: owners should see the important status, recognize the main action and move through work without reading a wall of explanation. Desktop is a first-class layout target, not a stretched phone view or a final responsive check. We can learn from the quick visual feedback and clear priorities in other sales apps without copying another app or turning this one into a game.

The attached DothPro photos are visual references. Even though the photos are faint, they show a desktop workspace with generous open space, a persistent left menu, small colored status/action tiles, strong section bars, and separate work panels. The second photo also shows a dense records area balanced with a chart and another summary panel. The useful direction is clean, tactile surfaces with clear depth and color cues, while keeping tables and operational data easy to scan.

## Product rules to preserve

- One task belongs to one screen or one clearly bounded flow. If completing that task takes several decisions or inputs, break it into simple, sequential steps with a clear next action, visible progress or context where useful, and a way to go back and correct earlier answers. Keep other tasks on their own screens; do not interpret this rule as one input per screen.
- Give every destination screen its own deliberate layout and complete review. Overview is simply where the audit starts, not the most important screen.
- Keep setup and configuration away from transaction entry.
- Put detailed guidance in that screen's Help & support explanation. Keep validation and transaction feedback beside the action that caused it.
- In an empty state, show the state and a useful next action in the initial viewport. Avoid blank vertical gaps, long introductory copy, or secondary content that pushes all actionable content below the fold. Scrolling is appropriate for populated records and genuinely long tasks; it should not be a prerequisite to discover what to do next on a fresh screen.
- Keep screen copy short and task-oriented. Use a small set of clearly labeled navigation/actions to continue the user's flow; move necessary explanation to contextual help. Do not hide long instructions or piles of unrelated tasks inside accordions. Use disclosure only for genuinely optional details that are useful in place.
- Treat consumer-app patterns as evidence, not a universal rule: make the next action visible and place secondary destinations in navigation, while matching explanation and disclosure to task complexity. Prefer plain-language labels and immediate actions when the action is self-evident.
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
| 2. Daily landing | Review Overview after baseline | Overview's own task and information are clear and well presented | Complete |
| 3. Core work | Product sales / Oil sales / Payments & receipts / Order counter / Tables & tabs | Each screen supports its main task with clear state changes and immediate feedback | In progress |
| 4. Stock work | Find or add product, receive/count/move stock, inspect result | Product and stock tasks remain distinct, navigable screens | Not started |
| 5. Records and decisions | Sales history, customers, expenses, reports, staff activity | Lists and figures are scannable; alerts and next actions are easy to identify | Not started |
| 6. Setup and recovery | Settings, help, sync, permissions, subscription and empty/error states | Configuration remains separate; recovery is understandable and actionable | Not started |
| 7. Consistency pass | Check workspace variants, desktop compositions, phone layouts and key roles | Shared components behave consistently without erasing workspace-specific needs; desktop is independently reviewed, not merely scaled | Not started |
| 8. Acceptance | Recheck real journeys, accessibility, responsive behavior and release build | Agreed acceptance list passes and this roadmap is marked complete | Not started |

## Screen-by-screen review queue

This queue names destination screens rather than bundling tasks together. All rows receive an individual review and a finished result. The row order is an execution convenience, not a priority ranking. Add rows whenever code inspection or a real user journey reveals another distinct destination. Record the current screen and exact evidence before changing it.

| Screen / destination | What to inspect | Status |
| --- | --- | --- |
| Overview | Today's sales, active work, stock attention, workspace choice and primary actions | Complete |
| Introduction and sign-in / registration | Welcome journey, sign-in and sign-up fields, validation and recovery | Not started |
| Branch selection | Available businesses/branches, selected state and continue action | Not started |
| Workspace and business setup | Workspace selection, business type and each separate setup step | Not started |
| Payment method list and add/edit | Existing methods, add method task, store selection and saved state | Not started |
| Sales task navigation | Workspace-specific entry to new sale, sales records and customer balances | In progress |
| Product sales | Catalogue search, basket, payment handoff and completion feedback | In progress |
| Oil sales | Oil-specific product selection, quantities and checkout | Not started |
| Payments & receipts | Payment tasks, jobs/invoices, payment completion and receipt access | Not started |
| Order counter | Order entry, preparation/collection states, payment and active queue | Not started |
| Tables & tabs | Table selection, adding rounds, bill state and settlement | Not started |
| Product catalogue | Search, add/edit product, starter catalogue and import entry points | Not started |
| Add or search product | Product lookup/search, scan entry point and continue-to-add action | Not started |
| Product list | Product totals, search, category/status filters, empty/populated list and product actions | Not started |
| Stock costs and expiry | Batch cost, expiry alerts, correction tasks and audit history | In progress |
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

**Current implementation status:** First-use and no-product Overview layout implemented in `WorkspaceOverview.tsx` and `operational.css`. The PWA production build passes. Desktop and phone first-use previews were inspected. The owner is satisfied with the current Overview and is closing this refactor checkpoint. Any remaining populated-state, workspace-variant and role-specific behavior checks belong in the later journey/acceptance review; they do not block moving to the next screen.

## Empty-state and copy review

The initial viewport of a fresh screen should already show what the screen is and a direct next action. A user should not have to scroll through blank space or explanatory paragraphs to begin. Keep the empty-state message brief, then provide only the few relevant navigation buttons needed to continue the flow. Do not use an accordion to conceal long instructions or a large collection of tasks; split distinct tasks into their own destinations and offer screen-specific Help when explanation is needed.

This is a strong default, not a rule that every popular app follows identically. Everyday apps such as Uber Eats separate destinations like Account and Orders from the main flow, and make actions such as viewing a receipt or reordering available from the relevant order. That supports visible navigation and contextual actions; it does not establish that onboarding copy, scrolling, or disclosure is always wrong. Judge by task complexity: scrolling is fine for real records and long forms, while an empty screen should not require it just to reveal the first useful action. [Uber Eats order history and receipt guidance](https://help.uber.com/en/ubereats/stores/article/%E6%88%91%E5%A6%82%E4%BD%95%E6%9F%A5%E7%9C%8B%E6%94%B6%E6%8D%AE%E5%92%8C%E8%AE%A2%E5%8D%95%E8%AE%B0%E5%BD%95%EF%BC%9F?nodeId=047bb2c1-5c7d-4ca2-a45d-01478826958b) and [reorder flow](https://help.uber.com/ubereats/restaurants/article/%E5%A6%82%E4%BD%95%E9%87%8D%E6%96%B0%E8%B3%BC%E7%BD%AE%E6%9B%BE%E8%B3%BC%E7%BD%AE%E7%9A%84%E9%A4%90%E9%BB%9E%EF%BC%9F?nodeId=012e1e38-acdf-4022-989c-4d3921999e21) illustrate that pattern. This is a design reference, not a complete survey of popular apps.

**Mobile input and scale behavior:** Keep app text inputs, selects and textareas at 16 CSS px or larger on phone layouts to avoid iOS Safari's automatic focus zoom. The Android native app should behave like a fixed-scale app surface, so disable WebView pinch zoom in native settings rather than relying on viewport metadata. Browser and iOS PWA zoom remains under browser/accessibility control; viewport metadata alone cannot reliably disable pinch zoom in modern iOS Safari. Inspect native and browser delivery separately.

## Phase 3 initial screen inspection

**Scope decision:** Product sales is one task—complete a sale—with three meaningful parts: choose products, review the basket and take payment. Keep this as one sale flow; there is no reason to create five destinations. The interaction should adapt by device: desktop/register keeps catalogue and editable basket visible together, then places payment beside the basket; phone keeps a focused Products → Basket → Payment sequence.

**Sales navigation observed in source:** Overview offers workspace-specific start actions and a sales-history shortcut. Product sales has its own navigation destination; sales history is separate. This is a reasonable task boundary so far, pending rendered desktop/phone review and role-specific checks.

**Initial implementation finding:** The first small copy change in `PosCatalog.tsx` was insufficient on its own. The desktop layout hid the editable basket during product selection and imposed a step-by-step sequence better suited to a phone. The wider redesign now gives the sale a clearer visual hierarchy: a labeled product-search surface, quick category chips, scannable product cards with a strong price/add affordance, and a live editable basket with a prominent total. On register-sized screens the basket stays beside the catalogue; on phones the sale stays a focused three-step flow and an in-progress basket becomes a compact fixed bottom action instead of a second list pushed above the products. The empty catalogue gives managers an Add product action and tells staff without that permission to ask a manager.

**Pattern review:** Square documents item grids and shortcut tiles for fast checkout; Shopify documents customizable smart-grid tiles, pages and arrangement, with its POS screen references showing a working cart beside item/action tiles. Toast describes hiding less-used controls on its handheld to preserve room for the order. Adapted here: retain a fast searchable/scannable catalogue and clear cart total, keep the basket visible on register-sized screens, and reduce simultaneous work on phone. Do not import restaurant-only controls or configurable tile complexity without evidence this business needs them. Sources: [Square item grid setup](https://squareup.com/help/us/en/article/8334-set-up-item-grid), [Square cart building options](https://square.site/help/au/en/article/8238-build-your-customer-s-cart-in-the-square-retail-pos-app), [Shopify POS smart grid](https://help.shopify.com/en/manual/sell-in-person/getting-started/smart-grid), [Shopify POS interface reference](https://shopify.dev/docs/apps/build/app-surfaces), [Toast POS ordering screen and handheld behavior](https://support.toasttab.com/en/article/New-POS-Experience-Ordering-Screens).

**Desktop and phone behavior change:** At 1024 px and wider, the Products/Basket step bar is hidden; the user adds items and edits the live basket in a two-panel register, then uses the existing payment action. A keyboard accessible draggable divider lets desktop users choose catalogue or basket width, with the preference saved on that device. A user screenshot exposed a conflicting legacy grid rule that stretched the divider across a whole column; that rule is removed and the handle now has a fixed narrow hit area. At 1023 px and narrower, the three-step navigation and focused stage layout remain, with a fixed compact basket action while browsing. Payment and sale calculations, saved basket behavior and permission checks are unchanged. Rendered viewport review remains open; a PWA build has passed.

**Payment screen direction:** Payment methods use three direct choices for the routine methods (cash, POS terminal, bank transfer) and a small More menu for Split and Customer wallet. The amount due anchors the payment task, only the chosen method's fields appear, optional extras start behind an action, and Complete sale stays reachable on phone. Keep the approved-payment check beside the reference field in short language; make receipt photo a secondary action.

**Mobile type review:** The user screenshot review found payment controls too small. Payment method names now use 14 px text, field labels use 14 px, helper text uses 13 px, and the payment heading remains prominent. Verify against a rendered phone viewport before closing this review.

**Reference comparison and correction:** I first treated the examples too loosely and replaced the method select with five equal buttons. That was mostly a control change. The comparison points to a stronger shared pattern: [Codex keeps review and diff actions with the task](https://openai.com/index/introducing-the-codex-app/); [Copilot provides context-specific smart actions and interactive buttons](https://docs.github.com/en/copilot/how-tos/chat-with-copilot/chat-in-ide?tool=vscode); [ChatGPT keeps attachment actions in a compact add menu](https://help.openai.com/en/articles/9295241-how-to-launch-the-chat-bar); [VS Code uses the Command Palette to find less frequent commands](https://code.visualstudio.com/docs/editing/getting-started/userinterface). Inference for this screen: lead with the amount, give the common payment choices direct taps, place uncommon choices behind More, and reveal only the fields needed for the chosen method. Overview provides the related in-product precedent: a dominant task card with one primary action and separate, quieter navigation actions. This is a structural and hierarchy change, not a claim that payment must copy a developer tool's visual style. PWA build passes; rendered desktop and phone review remains open.

### Consumer-app survey and design inference

These examples support progressive steps when a task has several choices or prerequisites. This is not a one-question-per-screen rule: several related inputs may belong together in one step, and a task may span several simple screens. Suggested answers and plain labels can make each next step feel obvious without asking users to interpret a long explanation. Show enough context to answer confidently, preserve a clear back/edit path, and explain consequences when a choice affects payment, privacy, security, or saved business data.

| Consumer product | Published flow evidence | What it suggests for this app |
| --- | --- | --- |
| WhatsApp | Registration starts with agreement, country/phone entry, then a verification code; profile setup follows. | Keep the registration task coherent across the dependent steps; explain verification when it becomes relevant. |
| Google Account | Account creation offers account type choices, suggested addresses, custom address/phone alternatives, then password and recovery steps. | Offer useful defaults and suggested answers with a custom option; related inputs can be grouped into a step. Keep optional details optional. |
| Uber | Signup collects name, phone and language, verifies phone, then asks for payment information. | Keep one signup task moving through clear stages; separate prerequisites and consequential payment input when useful. |
| Netflix | Signup varies by device and includes plan choice, account credentials and payment method. | A signup flow can contain multiple stages and decisions; communicate plan/payment commitment clearly before completion. |
| Spotify | Signup supports email, phone or Apple, while several profile fields are optional; users can start listening after signup. | Minimize required entry and let people reach the core product before requesting nonessential profile data. |
| Uber Eats | Orders and receipts are reached through Account/Orders, with contextual receipt and reorder actions. | Put secondary destinations in navigation and relevant actions on their records rather than explaining every route on the landing screen. |

This is a focused review of official product help, not a visual audit of every app or region/device variant. Help articles describe supported steps but cannot confirm exact screen composition, how many fields appear per step, whether suggested answers are visible in every market, or whether an empty screen fits without scrolling. Those points need a running app or trusted screen capture before making visual claims. Design inference: make the next useful choice obvious and easy to answer, and split a long task into steps without fragmenting it into one-field screens. Empty operational states still deserve a first useful action above the fold; populated records and longer workflows may scroll naturally.

Sources: [WhatsApp phone registration](https://faq.whatsapp.com/684051319521343/?cms_platform=iphone&locale=en_US), [Google Account creation](https://support.google.com/accounts/answer/27441?hl=en-to), [Uber account creation](https://help.uber.com/am/riders/article/how-do-i-create-an-uber-account--?nodeId=fdfc0273-f67e-4545-9885-f89d0ca0aacf), [Netflix signup](https://help.netflix.com/en/node/112419), [Spotify getting started](https://support.spotify.com/mt/article/getting-started/), [Uber Eats order history and receipts](https://help.uber.com/en/ubereats/stores/article/%E6%88%91%E5%85%AB%E4%BD%95%E6%9F%A5%E7%9C%8B%E6%94%B6%E6%8D%AE%E5%92%8C%E8%AE%A2%E5%8D%95%E8%AE%B0%E5%BD%95%EF%BC%9F?nodeId=047bb2c1-5c7d-4ca2-a45d-01478826958b).

## Reference journey represented in the supplied images

The supplied ShopKite screenshots are examples of screen variety, navigation, and task flow, not instructions to copy exact behavior or styling. The entry sequence separates introduction, registration/sign-in, branch choice and setup choices into understandable stages; its operational journey then gives distinct destinations for supply, expense, sales, debt and other tasks. Use that distinction: one task can have a guided sequence of simple steps, while separate tasks remain separate destinations. Do not collapse a long task into a dense screen, and do not split each individual field into its own screen without a reason. The images also show menu groups for sales, products, supplies, expenses and customers, payment method list/add, supply entry, sales records, product list, customer entry, customer balances and feature notices. Review each corresponding destination in this app on its own; add a row when a distinct task is missing.

## Checkpoint log

| Checkpoint | Date | Completed | Evidence / next step |
| --- | --- | --- | --- |
| Roadmap created | 2026-10-10 | Journey, boundaries and screen queue documented | Next: Phase 0, baseline the Overview on desktop and phone, including sales workspaces and fresh/active states. |
| Desktop direction added | 2026-10-10 | Added the attached DothPro desktop references and explicit desktop-first-class review criteria | No UI changes yet. Continue Phase 0 by capturing the Overview at desktop and phone sizes. |
| All screens clarified as equal scope | 2026-10-10 | Stated that phases are execution order, not screen priority; expanded the queue using the supplied ShopKite journey images | Continue baseline with Overview, then apply the same full review and quality bar to every destination. |
| Overview baseline started | 2026-10-10 | Recorded the existing 390 px phone fresh state, captured the 1440 px desktop fresh state in an isolated business, measured desktop navigation/content widths, and inspected empty/active behavior | Phase 0 remains open. Capture representative active states at both sizes and confirm workspace/role variants, then finish the Overview baseline. |
| Overview first-use layout implemented | 2026-10-10 | Added a tactile desktop panel layout and separate phone stacking; preserved task-per-screen navigation and added daily transaction/status tiles for populated states | `npm run build:pwa` passes. Desktop and phone first-use previews inspected. |
| Overview closed; next screen selected | 2026-10-10 | Owner accepted the current Overview. Added the empty-state/copy principles and clarified that scrolling is appropriate for real content, not a prerequisite to the first useful action on an empty screen. | Phase 2 and Overview row closed. Next: Phase 3, begin with Sales task navigation and Product sales entry. |
| Core work inspection started | 2026-10-10 | Compared Overview's morning refactor with Product sales; researched Square, Shopify and Toast POS patterns. Changed wide-screen Product sales to keep the item catalogue and editable basket together, with payment beside the basket; retained focused phone steps. Made the empty catalogue action role-aware. | `src/operational.css` and `src/PosCatalog.tsx` changed. Rendered desktop/phone review and build verification remain before marking Product sales complete. |

## Current stopping point

**Active phase:** Phase 4 — Stock work (Inventory)
**Last completed:** Inventory navigation now uses tactile navy task cards, with a desktop row and a two-column phone layout. The stock-costs and expiry view has a compact status summary, direct correction actions, a visible batch list, and secondary correction history.
**Next:** Review Inventory on desktop and phone with empty and populated catalogues, actual batch/expiry data, and owner/staff permissions. Confirm the cards fit at common desktop widths and the batch list remains readable on phone. Charts currently belong to Reports, not Inventory; keep them only where their measures support a clear decision, and review those charts with the Reports screen.

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
