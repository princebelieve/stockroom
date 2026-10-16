# Business app scope and architecture review

Updated: 2026-10-06. Current operational details are maintained in the linked workspace guides.

**Historical notice, 2026-10-16:** This audit predates the Hospitality destination. Its statements below that room availability, hotel stays, hospitality billing, or nightlife booking are not implemented are obsolete. Do not use this document as the current feature list; follow [workspace scope](workspaces.md) and [hotel/nightlife operations](hospitality-workspace.md).

## Purpose

This document records the app's scope and architectural limits as assessed on 2026-10-06. It is a historical maintenance reference, not a current capability inventory or a claim that every business sector is supported.

The original audit identified a real issue: changing product labels and templates does not change how a business operates. It also records the then-current decision to focus on payment entry before broader workflows. Later code added Orders, kitchen workflows, and Hospitality; use current operational guides for those implementations.

## What the app supports now

Owners choose **Product sales**, **Oil sales**, **Payments & receipts**, **Order counter**, and **Tables & tabs** separately in **Business settings > Available workspaces**. Business type affects catalogue suggestions; it does not silently enable workspaces. Payments & receipts is the only subscription-free workspace. See [Subscriptions](subscriptions.md) for expiry and entitlement behavior.

Owners can also choose **Order counter only**, or enable Fast food alongside their existing screens. Its menu, orders, preparation queue and packaged-stock tools stay in a separate workspace. Supermarkets receive no Fast food screens unless the owner enables it. **Tables & tabs only**, or its separate enable checkbox, adds its own menu, tables, seats, named tabs and open bills.

| Workflow | Behavior |
| --- | --- |
| Product sales | Select stocked products, take payment, save a receipt and deduct stock. |
| Oil sales | Sell configured oil products by measured quantity or container using saved customer and bulk pricing; no pump/meter integration is provided. |
| Payments & receipts | Enter what the customer is paying for, optional customer name/phone, amount and payment method; save and print/share a receipt without changing stock. |
| Tables & tabs | Open table or named bar bills, add rounds with seats and quantities, print kitchen/bar tickets, serve before payment, settle remaining rounds or individual orders, and close fully resolved bills. Restaurant ingredients and linked drinks leave stock at preparation; later payment does not deduct them again. |
| Both | Staff switch between two separate screens. The payment form and product basket keep their own drafts. |
| Order counter | Save menu orders, track Queued → Preparing → Ready → Collected, and record full payment against the same order, with saved tax/discounts/rewards, unpaid corrections, cancellation, refunds and preparation tickets. Prepared recipes consume ingredient stock and capture costs when preparation starts; linked packaged goods deduct stock on payment. |

Business templates still customize product fields and wording. The saved payment-screen choice now controls the availability of the two workflows and relevant stock navigation independently of the template.

The payment screen is useful across sectors when the task is simply recording an amount received and issuing a receipt. A printing press, church office or hotel can use it for that task. Optional Jobs & invoices manages printing/service jobs and recorded materials, and Church collections tracks funds, donors, pledges and statements. These extensions do not provide full church accounts or hotel reservations.

See [Payments & receipts](payments-and-receipts.md) for setup and daily use.

See [Restaurant & bar workspace](restaurant-and-bar-workspace.md) for table service, settlement and synchronization.

See [Fast food workspace](fast-food-workspace.md) for order operations, setup, device synchronization and current limits.

## Architecture worth preserving

- The React frontend uses local API adapters for desktop SQLite, browser SQL.js/IndexedDB and Android SQLite.
- Shared payment, stock, purchasing and reporting modules already provide common business rules.
- The payment screen saves validated non-stock lines through the existing receipt and synchronization infrastructure. It does not require an inventory product or create stock movements.
- Authentication, business and branch scoping, existing receipt history, stock records, printing and synchronization remain useful foundations.

Some core operations and schemas still have separate platform implementations. Changes to payment persistence, migrations or stock effects therefore need checks across those adapters. The payment implementation includes a migration for older browser/Android receipt tables that required every receipt line to reference an inventory product.

## Remaining limits

Stock checkout and direct payment entry record fully paid transactions. Fast food now has persistent unpaid orders and independent preparation progress, with full settlement required before handover. Restaurant & bar supports open tabs and serving before payment. The optional Jobs & invoices extension supports estimates, service jobs, deposits, balance payments and refunds; see [Payments & receipts](payments-and-receipts.md). Tables & tabs supports partial item quantities, seats and equal-share settlement, with mixed payment methods; see its workspace guide. Counter orders still settle in full before collection. Table reservations are implemented in Tables & tabs. Hotel stays and nightlife events have dedicated operations, customer booking and payment workflows; see [Hotel and nightlife operations](hospitality-workspace.md) for their supported functions and limits. Held retail baskets remain checkout drafts.

Existing financial reports summarize receipts, recorded stock costs, expenses and returns. A payment without stock carries no inventory cost; its receipt alone does not capture the business's full service delivery cost.

The current screen choice is a workspace setting. It does not introduce new staff roles or replace backend authorization.

## Guidance for future changes

Keep payment entry simple. Add a sector workflow only when a concrete business task requires it, and define that task before adding screens or backend entities. Fast food is the first separate operational extension. Restaurant & bar now adds table service; hotel reservations still need their own bounded design; they are optional extensions, not prerequisites for issuing receipts.

For any extension, preserve existing records, validate amounts and permissions in the backend, and check persistence, retry and synchronization behavior on supported platforms. Templates should expose implemented behavior rather than imply capabilities through renamed fields.

This review is based on repository code and documentation. It is not an exhaustive security audit or evidence of physical-device or production acceptance testing.
