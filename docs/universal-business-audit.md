# Business app scope and architecture review

Updated: 2026-10-03, after adding Payments & receipts and the separate Fast food workspace.

## Purpose

This document records the app's current scope and the architectural limits that matter when extending it. It is a maintenance reference, not a required redesign plan or a claim that every business sector is supported.

The original audit identified a real issue: changing product labels and templates does not change how a business operates. However, it proposed orders, kitchen workflows and hotel management before the intended next step had been narrowed to simple payment entry and receipts. That broader proposal is not the current implementation plan.

## What the app supports now

Owners can choose **Stock & checkout**, **Payments & receipts**, or **Both** in **Business settings → Business type → Payment screens**.

Owners can also choose **Fast food only**, or enable Fast food alongside their existing screens. Its menu, orders, preparation queue and packaged-stock tools stay in a separate workspace. Supermarkets receive no Fast food screens unless the owner enables it.

| Workflow | Behavior |
| --- | --- |
| Stock & checkout | Select stocked products, take payment, save a receipt and deduct stock. |
| Payments & receipts | Enter what the customer is paying for, optional customer name/phone, amount and payment method; save and print/share a receipt without changing stock. |
| Both | Staff switch between two separate screens. The payment form and product basket keep their own drafts. |
| Fast food | Save menu orders, track Queued → Preparing → Ready → Collected, and record full payment against the same order. Prepared meals need no stock; linked packaged goods deduct stock on payment. |

Business templates still customize product fields and wording. The saved payment-screen choice now controls the availability of the two workflows and relevant stock navigation independently of the template.

The payment screen is useful across sectors when the task is simply recording an amount received and issuing a receipt. A printing press, church office or hotel can use it for that task. This does not imply that the app manages printing jobs, church administration or hotel reservations.

See [Payments & receipts](payments-and-receipts.md) for setup and daily use.

See [Fast food workspace](fast-food-workspace.md) for order operations, setup, device synchronization and current limits.

## Architecture worth preserving

- The React frontend uses local API adapters for desktop SQLite, browser SQL.js/IndexedDB and Android SQLite.
- Shared payment, stock, purchasing and reporting modules already provide common business rules.
- The payment screen saves validated non-stock lines through the existing receipt and synchronization infrastructure. It does not require an inventory product or create stock movements.
- Authentication, business and branch scoping, existing receipt history, stock records, printing and synchronization remain useful foundations.

Some core operations and schemas still have separate platform implementations. Changes to payment persistence, migrations or stock effects therefore need checks across those adapters. The payment implementation includes a migration for older browser/Android receipt tables that required every receipt line to reference an inventory product.

## Remaining limits

Stock checkout and direct payment entry record fully paid transactions. Fast food now has persistent unpaid orders and independent preparation progress, with full settlement required before handover. Deposits, open bar tabs, room availability and hotel stays remain outside the implemented scope. Held retail baskets remain checkout drafts.

Existing financial reports summarize receipts, recorded stock costs, expenses and returns. A payment without stock carries no inventory cost; its receipt alone does not capture the business's full service delivery cost.

The current screen choice is a workspace setting. It does not introduce new staff roles or replace backend authorization.

## Guidance for future changes

Keep payment entry simple. Add a sector workflow only when a concrete business task requires it, and define that task before adding screens or backend entities. Fast food is the first separate operational extension. Table-service restaurants and hotel reservations still need their own bounded designs; they are optional extensions, not prerequisites for issuing receipts.

For any extension, preserve existing records, validate amounts and permissions in the backend, and check persistence, retry and synchronization behavior on supported platforms. Templates should expose implemented behavior rather than imply capabilities through renamed fields.

This review is based on repository code and documentation. It is not an exhaustive security audit or evidence of physical-device or production acceptance testing.
