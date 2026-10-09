# Product purpose, duplication and competitor review

Review date: 2026-10-06. This is the original audit snapshot; the implementation update at the end supersedes its documentation/timezone findings. Competitors: Square, Loyverse and Odoo (interpreting “Oddo” as Odoo).

## Conclusion

Stockroom Business is an offline-first sales and stock operations product for small businesses. Its strongest scope is retail/supermarket operations, service payment collection, takeaway preparation, and restaurant/table billing. It is not a complete ERP, accounting package, hotel system or payment processor.

The five selling workspaces represent different transaction lifecycles and should remain distinct. The useful improvements are clearer capability documentation, consistent reporting periods, easier recovery across devices, less repeated menu administration, and stronger release verification. Copying every competitor feature would add complexity without establishing product fit.

## Evidence and limits

Reviewed README, workspace guides, existing architecture/completion reviews, reporting documentation, and implementation in `server/pos-service.mjs`, `server/counter-service.mjs`, `server/restaurant-service.mjs`, `server/reports.mjs`, `server/pos-pricing.mjs`, `src/CounterService.tsx`, `src/ServiceJobs.tsx`, and browser/mobile adapters. Ran `npm.cmd test`: 174 passed, zero failed/skipped. Output: `product-review-tests.log`.

This is a repository and documented-capability review, not physical hardware testing, production deployment verification, an exhaustive security audit, or a full interactive UX study. Passing unit/integration tests does not establish production readiness. Proposed improvements below are not newly implemented features.

## Purpose and workflow boundaries

| Workspace | Business purpose | Why it is separate |
| --- | --- | --- |
| Product sales | Sell stocked products | Checkout consumes stock and captures goods cost. |
| Payments & receipts | Record immediate payment for staff-entered descriptions | No stock movement; quick entry remains useful without invoices. |
| Jobs & invoices extension | Track estimates, work and amounts owed | Deposits and later payments belong to a persistent job; invoices must not count as additional collected revenue. |
| Order counter | Menu orders, preparation and collection | Preparation and payment are independent; collection requires payment. |
| Tables & tabs | Repeated rounds against open bills | Serving can precede payment; seat/item/shared settlement and table occupancy require a bill lifecycle. |

Presets should choose appropriate workflows and labels. They should never imply sector capabilities just by changing field names. The current simple preset approach is worth preserving.

## Duplication: keep, consolidate or investigate

1. **Keep the five selling screens distinct.** Combining them would burden a supermarket cashier with preparation/table controls and a restaurant with stock-checkout assumptions. Square's modes and Loyverse's open-ticket approach also illustrate legitimate workflow variation.
2. **Keep one shared stock/payment foundation.** The repository already routes restaurant, counter and service jobs through shared POS modules; `CounterService` also serves restaurant menu configuration. Do not describe the five selling workspaces as independently implemented POS engines.
3. **Reuse food offerings explicitly.** Counter and restaurant menus remain separate. Owners/admins can now preview and copy selected offerings, extras and recipes into the destination draft, then save through the existing menu workflow. Same-name and previously copied source items are blocked; independent edits and submitted-order snapshots are preserved. Automatic linked updates are not implemented.
4. **Reduce platform adapter repetition incrementally.** Browser and Android have separate API, sync and persistence orchestration, despite sharing business modules. Extract common sync command/capability handling and define adapter contracts when changing these areas. Retain native storage, session and printing differences. Do not undertake a wholesale rewrite solely to reduce line count.
5. **Keep distinct printed documents.** A preparation ticket, unpaid bill, invoice and payment receipt have different meanings. Reuse rendering/layout primitives while preserving document identity and financial content rules.
6. **Consolidate contradictory maintenance documentation.** Workspace guides should be the operational authority; architecture reviews should link to them instead of maintaining another feature inventory that goes stale.

## Competitor comparison

Features depend on plan, country, edition, hardware and configuration. These comparisons concern documented workflow coverage, not identical deployment behavior or performance.

| Area | Stockroom today | Square | Loyverse | Odoo | Interpretation |
| --- | --- | --- | --- | --- | --- |
| Retail and purchasing | Stock, batches, supplier orders/receiving/returns, wastage and stocktakes | Retail POS, purchasing, inventory and online channels | POS and inventory; advanced inventory extends purchasing/production | POS alongside inventory and broader business applications | Stockroom has meaningful retail depth; it is not merely receipt entry. |
| Counter/table service | Extras, recipes, preparation, tables/tabs and partial settlement | Restaurant tables, seats, split checks and KDS | Modifiers, open tickets, kitchen displays/printers | Restaurant POS, preparation display and self-ordering | Core local workflows exist; kitchen automation is a competitive gap. |
| Offline use | Local databases and queued supported operations; enrollment needs connectivity | Offline capabilities depend on hardware/payment conditions | Offline sales and shifts; refunds unavailable offline | POS is documented as usable during temporary disconnection | “Offline” is not equivalent across products. Shared unsynchronized state remains a limit. |
| Payment processing | Cash/transfer/external terminal recording; configured Paystack integration | Integrated processing in supported markets | Supported processor integrations vary by country/device | Configurable payment methods/terminal integrations | Regional/provider choice is a product difference; manual confirmation creates operational risk. |
| Service billing | Immediate receipts plus jobs, estimates, invoices, deposits and refunds | Invoice/project workflows | Reviewed POS features emphasize tickets and receipts | Broader invoicing/accounting workflows | Deposits are already implemented for service jobs; counter orders still require full settlement. |
| Financial scope | Collected-payment reporting and estimated profit with captured costs | Retail sales and COGS reporting | Sales/tax/inventory reports | POS integrated with wider accounting workflows | ERP/accounting breadth is a scope difference, not automatically a Stockroom defect. |

Official references checked:

- [Square retail](https://squareup.com/us/en/point-of-sale/retail): purchasing, stock management, COGS reporting, integrated payments and online sales.
- [Square restaurants](https://squareup.com/us/en/point-of-sale/restaurants): tables/seats, split checks and kitchen display workflows.
- [Square invoices](https://squareup.com/help/us/en/article/8387-create-and-send-invoices): invoice workflow reference, also used by the existing completion plan.
- [Loyverse features](https://loyverse.com/features): POS, modifiers, tickets, kitchen hardware, multi-store operation and integrations.
- [Loyverse advanced inventory](https://loyverse.com/advanced-inventory): purchasing and production reference.
- [Loyverse offline limits](https://help.loyverse.com/help/offline-work-of-pos): sales and shifts work offline; refunds do not.
- [Odoo 19 POS documentation](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale.html): retail/restaurant POS, temporary offline operation, preparation and self-ordering capabilities.
- [Odoo 19 POS workflow](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/use.html): daily operations and accounting traceability.
- [Odoo 19 hardware](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/pos_hardware.html): terminals, printers, displays, scanners and scales.

Odoo comparison uses indexed official version 19 documentation; several direct page requests timed out. It is not a claim about all Odoo editions or the latest version's complete feature set. No pricing comparison was attempted.

## Confirmed lapses and proposed improvements

| Priority | Finding and evidence | Classification | Concrete next step / acceptance criterion |
| --- | --- | --- | --- |
| P1 | `docs/report-calculations.md` says one tax rate across a basket, while `server/pos-pricing.mjs` and `src/PosTools.tsx` support product-specific rates, including zero. | Confirmed documentation defect | Describe default/product overrides accurately; mixed-rate examples must match checkout and refund totals. |
| P1 | `docs/universal-business-audit.md` retains old navigation and says deposits/arbitrary round splitting are outside scope; current service and restaurant guides/code implement deposits and partial selections. | Confirmed documentation defect | Replace stale feature claims with links to current workspace guides; distinguish service deposits from unsupported counter deposits. |
| P1 | `server/reports.mjs` constructs day/week/month boundaries with device/server-local Date methods. Its guide explicitly acknowledges differing timezones. | Confirmed reporting consistency gap | Configure a business timezone and apply it consistently; the same synced data and reporting instant must produce identical periods on Windows, PWA and Android. |
| P1 | Counter recipe preparation, restaurant settlement and job management depend on the original till. | Documented safety restriction with operational cost | Owner-controlled recovery now retires the source enrollment and restores its original till identity on a synchronized, idle replacement. Password, reconciliation confirmation and durable retry are required. Physical shutdown and unsynchronized activity remain owner responsibilities. |
| P1 | Separate offline tills cannot exclusively own unseen shared tables/orders/rewards; recipe preparation has no queued-order reservation. | Documented distributed-state limit, not a newly proven corruption bug | Make sync age, owning till and conflicts visible at relevant actions. Test reconnecting two tills after competing table/reward/stock activity; every outcome must preserve money and physical stock history. Use online coordination or allocated stock where required. |
| P1 | Guides require compatible deployed sync capabilities and actual device/printer checks. | Release verification gap | Verify deployed `retail-v3`, `counter-v3`, `restaurant-v2` and `service-jobs-v1`, interruptions/restarts and actual receipt output before a shared-device rollout. |
| P2 | Prepared food without recipes or purchase costs can overstate margins; the generic zero-cost sale warning excludes `service:` lines. | Reporting visibility gap | Add targeted food-cost completeness warnings; allow intentional uncosted service receipts. Warn before relying on food margins, without blocking quick selling. |
| P2 | Windows now routes station tickets automatically to configured kitchen/bar queues; browser/Android remain manual. | Competitive gap for busy hospitality users | Pilot real printers and interrupted jobs. Durable retry visibility is implemented; driver submission does not guarantee paper output. Printing must never recreate a sale or consumption event. |
| P2 | Counter and table menus are separate records. | Avoidable administration for mixed businesses | Provide explicit offering reuse/copy with workspace overrides; prove edits never change submitted orders. |
| P2 | Manual external payments/refunds record staff confirmation rather than independently establishing provider settlement. | Deliberate payment model with risk | Show provider verification state distinctly from manual confirmation and retain reconciliation exceptions. Expand integrations only for the intended market. |
| P3 | Browser/mobile API orchestration remains repeated. | Maintenance improvement | Extract shared orchestration during relevant changes and use meaningful cross-platform contract checks for retries, migrations and scope isolation. |

Priority means recommended order within the relevant scope, not a claim that every P1 is an exploitable bug.

## Deliberate differences that do not need automatic fixes

General-ledger accounting, payroll, full manufacturing, hotel stays, ecommerce, delivery marketplace integration and a public integration marketplace are potential extensions. Single-output food batches, table reservations and QR food ordering with manual delivery progress are implemented; see the workspace guides for their limits. Their absence is not a defect in a focused offline operations product. Add them only when a target customer needs them and the business value justifies the support burden.

Stockroom's practical strengths are local operation across PWA/Windows/Android, supplier/batch stock handling, optional workflows, customer balances and migration tools. These are supported capabilities, not evidence that Stockroom outperforms competitors. Adoption still depends on daily speed, reliability, hardware behavior and understandable recovery.

## Recommended sequence

1. Reconcile the capability documentation and fix business-timezone reporting.
2. Validate real devices and deployed synchronization, including failures and recovery.
3. Pilot owner-controlled till recovery, including unsynchronized payment and stock reconciliation.
4. Reduce repeated menu setup and surface missing food costs.
5. Pilot Windows kitchen/bar ticket routing on actual printers and validate interruption/retry behavior.
6. Reassess additional features against observed customer needs before expanding product scope.

## Implementation update: 2026-10-06

The tax/deposit documentation inconsistencies above have been corrected. Reporting now reads the synchronized business reporting timezone on Windows, PWA and Android, defaulting to UTC for businesses without a saved choice. Owners can save the timezone under Business settings > Workspaces. Calendar boundaries and the Reports expired-stock summary use that timezone; date-only expenses retain their business date. Tests cover timezone independence and daylight-saving boundaries. These changes address the documentation and reporting findings; the other recommendations remain proposals.

Implementation follow-up: QR customer ordering now supports guest pickup names, optional wallet sign-in, staff acceptance on one till, tax preview and idempotent submission retries. Preparation can be filtered by Kitchen or Bar. Windows station printer routing and owner-controlled checkout identity recovery are implemented; physical printer acceptance and reconciliation of unsynchronized activity still require a real-business pilot; see [Fast food](fast-food-workspace.md) for current behavior.


## Shopkite comparison and workspace audit: 2026-10-07

This update compares Shopkite's published feature claims with executable Stockroom code, rather than using the guides as proof. Sources: [Shopkite Merchant listing and version history](https://apps.apple.com/ng/app/shopkite-merchant/id1443512137), [staff-permission instructions](https://shopkite.com.ng/faq/stores/how-to-set-access-permission-for-staff-accounts), and [online selling](https://agent.shopkite.com.ng/handbook). Advertising establishes claimed scope, not equivalent reliability, plan coverage or tested behaviour.

| Advertised capability | Stockroom implementation checked | Workspace coverage and remaining work |
| --- | --- | --- |
| Sales, receipts, split tender and returns | `src/main.tsx`, `src/ServicePayments.tsx`, `src/RestaurantPayments.tsx`, `src/ServiceJobs.tsx`, shared POS services | Split tender exists for stock checkout, immediate service receipts, food checkout/table settlement and invoice payments. Receipt history and reconciliation span these receipts. Returns/refunds follow each transaction lifecycle; do not add a second ledger. |
| Volume/wholesale pricing | `src/lib/usePosBasket.ts`, `src/OilPricing.tsx`, `server/oil-pricing.mjs`, desktop/browser/mobile POS adapters | Fixed in this update: existing per-product bulk/customer rules now apply to Product sales as well as Oil sales, and owners/admins can configure them wherever Inventory is enabled. Food menus and descriptive service charges have separate price inputs. |
| Staff section permissions | `src/main.tsx` Team and navigation checks; `server/index.mjs`; `src/lib/browserApi.ts`; `src/lib/mobileApi.ts`; cloud staff access | Implemented owner-selected section permissions on existing admin/cashier accounts, enforced in desktop, browser and Android API adapters and cloud sync. New staff start without operational grants. Staff retain individual login; offline devices receive updated grants on their next sync. |
| Suppliers and multiple stock locations | `src/Purchasing.tsx`, `src/SupermarketStock.tsx`, shared retail/stock services | Already available through Inventory for stock-enabled workspaces, including food workspaces. Supplier receiving, accounts, transfers and stock adjustments do not need separate implementations per preset. |
| Fast catalogue setup | `src/lib/productIntake.ts`, inventory import and intake controls | Barcode, CSV and photo/OCR exist. Universal Open Facts lookup now covers food, cosmetics, pet food and other listed products, with successful lookups cached locally for 30 days. Workspace-specific generic catalogue starters cover stock sectors, service descriptions and food menus without replacing saved entries. An offline reference catalogue also accepts up to 100,000 supplier/manufacturer CSV rows per import and supports barcode/name-prefix search without changing inventory. This is imported reference data plus searchable external coverage, not a bundled guarantee of 100,000 Nigerian manufacturer SKUs. |
| Online retail orders and delivery | cloud customer portal; CounterService/restaurant menu and QR order handlers | Retail ordering now publishes owner-selected stock products through the existing customer portal, with pickup/delivery, fixed or delivery-area prices, bank-transfer references and optional wallets. Delivery progress records agent assignment, dispatch and completion. Staff accept orders on one till, pick goods, record payment and hand over. It shares stock and receipt logic with checkout; requests do not reserve stock. |
| Customer birthday reminders | customer model and customer UI | Optional month/day birthdays now save locally and sync. Customer accounts show daily reminders; the existing notification centre, browser push and Android FCM notify staff with customer access, once per customer/date. Staff send greetings themselves. |
| Rapid staff switching | local/cloud authentication and staff UI | Named staff accounts and sign-in exist; a protected quick-switch flow was not found. Preserve staff attribution and register ownership if adding it. |

### Actual shared-workspace boundaries

- Inventory/purchasing, registers, collected-payment reporting, receipt history, reconciliation, backup and support are shared business tools, with role and enabled-workflow checks. Their availability should not depend on the business preset name.
- Immediate Payments & receipts supports an owner-enabled wallet. Jobs/invoices now also support owner-enabled wallet payments for their linked customer, using shared wallet debit, retry and refund rules.
- Batch preparation is already available for both counter and restaurant menus through the shared CounterService configuration. Menu copying already transfers offerings, extras and recipes between those two workspaces. Neither needs another standalone system.
- Selling pack conversions are shared with Product sales. Their base quantities combine with loose units for bulk/customer pricing, stock deduction and captured-price returns. Catalogue starters do not supply dedicated pack barcodes.
- A preset is configuration, not a separate engine. Shared tools should follow capabilities, while table reservations, preparation stations, service jobs and stock checkout retain their distinct lifecycles.

Shopkite's visible customer reviews include reports of login/session difficulty and phone heating. They are individual reports, some dated, not proof of current defects. Stockroom's reported real transactions and XPrinter, LaserJet and scanner use are meaningful customer evidence, but do not establish identical results on every device. Compare observed daily work, not only the length of either feature list.

### Validation of the pricing fix

The browser integration check exercises the actual pricing editor and shared basket against a temporary desktop API: retail and oil bulk thresholds, customer precedence, manual overrides, interrupted-save retry, stock deductions, and refunds retaining original prices after a rate change. Existing product-option storage and endpoints are reused; no database or Atlas migration is required. Changes are local until released.

Implementation follow-up: the owner guide includes a saved setup checklist linking to existing workspace, staff and hardware tools, plus installation, catalogue, training and support assistance through the existing support contacts. Offline-first trading remains unchanged. Online ordering and remote notification delivery require connectivity.
