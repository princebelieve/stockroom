# Documentation alignment

Reviewed: 2026-10-06 against the current repository implementation. This review covers the root README/PWA guide, cloud README, every project guide in `docs`, the in-app guide source, and factual feature descriptions on the public terms/privacy/account-deletion pages. Generated builds, dependencies and release artifacts are not documentation authorities.

## Current authority

Use [README](../README.md) for product scope, [workspaces](workspaces.md) for workflow choice, [user guide](user-guide.md) for staff instructions, and [report calculations](report-calculations.md) for financial treatment. Historical research and audit documents are explicitly marked; their proposals and original findings do not override current operational guides.

The Markdown user-guide chapters match `src/user-guide.json`, which supplies Help and its downloadable text guide. When changing a user instruction, update both representations.

## Corrections made

- README now includes service jobs/invoices/deposits, Tables & tabs, recipe consumption, current cashier scope, reporting timezone and local development requirements.
- Prepared food with recipes consumes ingredients at preparation; counter packaged goods consume stock at payment; restaurant packaged goods consume stock at preparation. Refunds do not recreate cooked ingredients.
- Setup paths point to Business settings > Workspaces, Sales, Receipts and Devices. Product options and daily Cash register remain operationally separate.
- Reports use a synchronized business timezone, defaulting to UTC. Their expired-stock summary uses that calendar; inventory batch alerts and stock allocation still use UTC dates. The profit formula includes consumed recipe ingredients.
- Account-deletion default is 14 days, consistent with `cloud/index.mjs`, `cloud/account-deletion.mjs` and configurable plan settings. Previously README/PWA/public deletion text said 90 days.
- Direct subscriptions can use explicitly authorized recurring monthly/yearly Paystack renewal; public terms no longer describe every direct subscription as manual renewal. Play Store billing remains separate.
- Cloud legacy owner registration requires an enrolled device token; ordinary onboarding uses registration keys. All devices in one business share its business ID and have unique device IDs.
- Release examples use versioned Android artifact names. Landing documentation includes supported Paystack referral transfers and no longer asserts a particular hosting allowance or installer size.
- Unsupported claims about shops already using this version were removed. Historical setup recommendations are identified as implemented or still proposed.

## Coverage

| Document | Areas checked |
| --- | --- |
| `README.md` | Product purpose, five selling workspaces, platforms, roles, registration, reports and build commands. |
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
| `docs/product-purpose-and-competitor-review.md` | Original audit distinguished from subsequently completed documentation/timezone work. |
| `docs/report-calculations.md` | Report periods, taxes, receipt/refund costs, ingredients, losses and expenses. |
| `docs/restaurant-and-bar-workspace.md` | Bill sessions, rounds, station progress, partial settlement, moves/merges and stock effects. |
| `docs/service-payment-research.md` | Historical research/proposals clearly separated from implemented service jobs. |
| `docs/setup-and-sales-ui-review.md` | Current configuration locations and permissions; obsolete relocation proposals replaced. |
| `docs/subscriptions.md` | Renewal, configurable access/grace, referrals and payout handling. |
| `docs/supermarket-receiving.md` | Receiving, pack conversion, supplier accounts, batches and migration persistence. |
| `docs/supermarket-workspace.md` | Stock allocation, FEFO, restock-dependent refunds, reports and deployment limits. |
| `docs/universal-business-audit.md` | Present workspace scope, invoices/deposits, restaurant splitting and current navigation. |
| `docs/user-guide.md` / `src/user-guide.json` | Matching staff instructions, settings, reporting timezone and recipe terminology. |
| `docs/workspaces.md` | Presets, workflow boundaries, service jobs, provider defaults and data updates. |
| `public/privacy.html` | Described storage/providers, optional OCR/notifications and account-deletion default. |
| `public/terms.html` / `account-deletion.html` | Factual subscription renewal and account-closure behavior. |

## What this confirms

Documentation is aligned with implemented repository behavior for the areas above. It does not certify that the current code is deployed, that provider credentials are configured, that released installers contain these changes, or that physical hardware works. External policies and competitor references are dated references; their current account-side requirements must be checked when deploying or publishing. No new application workflow or external deployment is introduced by this documentation pass.

## Verification results

All 29 project Markdown documents were included in the inventory (including this review). Relative Markdown links resolve to existing files. All 35 in-app guide chapters match the Markdown instructions. Standard and PWA builds pass after the guide/public-page changes. Diff whitespace checks pass with the existing CRLF convention respected. This pass changes documentation and guide content only; it does not rerun physical-device or provider acceptance.

## Account closure and removal controls

Only owners can open business account deletion; staff cannot see or call that workflow. Promoters close their own promoter account. Both flows show a warning screen with Cancel and a red confirmation button; owner confirmation additionally requires typing DELETE. Deactivation is immediate, deletion is scheduled after the configured waiting period (14 days by default), and cancellation is available before the deadline. Offline copies and recurring subscriptions require separate handling.

Removal controls in order baskets, intake rows, purchase lines, split payments, recipe ingredients, menus, service lines, table layouts and stock-pool assignments modify drafts or configuration. Clear filters resets filters; Remove one records a stock reduction; branch deactivation retains branch records; removing a custom field hides it. Completed sales use the existing return/void workflows. These handlers were traced, rather than all being tested on physical devices. The inert topbar Filter icon was removed.

Staff & access provides creation, roles, operational access, password recovery and owner-only Remove staff. Removal requires owner password confirmation, disables the retained profile, revokes cloud sessions, and sends a removal record through sync. Local sign-in/session recovery cannot reactivate a removed identity. Historical sales/activity remain; usernames remain reserved. Devices receive this change when they reconnect and sync.

Navigation, request parsing, status retry, pending-business access checks and scheduled cloud cleanup were corrected. Changes require client release and cloud deployment. Review documents describe repository state at the dated review, rather than guaranteeing deployed behavior.
