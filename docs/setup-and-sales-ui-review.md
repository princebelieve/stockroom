# Setup and sales UI review

Aligned with the current implementation on 2026-10-06. Configuration is separated from daily transactions. The original product catalogue, basket, payment-reference scanner and desktop customer display remain the Product sales workflow.

## Current locations

| Feature | Setup location | Where staff use it |
| --- | --- | --- |
| Payment rules and ordered POS providers | Business settings > Business | Enabled payment selectors; first selected POS provider is the default. |
| POS device profile, scanner, printers and customer display setup | Business settings > Devices | Product scanning, manual POS receipt/reference scanning, supported printing and desktop display pairing. |
| Connected Paystack credentials | Business-scoped cloud server configuration | Product sales > POS > Use connected Paystack POS; ordinary device profiles do not activate it. |
| Tax, rewards and offline till allocation | Business settings > Sales (owner only) | Checkout totals, customer rewards and stock-location validation. Food menu settings also expose the shared tax/reward configuration. |
| Reporting timezone | Business settings > Workspaces (owner only) | Shared Reports periods and their expired-stock summary; defaults to UTC. |
| Product variants and extras | Product management | Catalogue variant filtering and extras selection. |
| Receipt identity, footer and non-stock receipt tax | Business settings > Receipts | Payment receipts and saved restaurant bill-payment receipt profiles. Stock/food checkout tax uses its own shared sales settings. |
| Counter menu, packaged stock and recipes | Business settings > Food menu & recipes | Order counter order entry, preparation, payment and collection. |
| Restaurant menu, packaged stock, recipes and tables | Business settings > Restaurant menu & tables | Tables & tabs, repeated rounds, kitchen/bar progress and partial settlement. |
| Cash register | Daily work > Cash register | Opening cash, movements and closing counts; this is daily work. |
| Refunds and receipts | Sales history or the relevant workspace history | Receipt selection, reprints and authorized returns. |
| Service jobs and invoices | Payments & receipts > Jobs & invoices | Estimates, work progress, deposits, balance collection, refunds and cancellation. |

## Workspace visibility and permissions

Product sales appears when the stock or combined workflow is enabled. Order counter and Tables & tabs can be enabled independently, including alongside other workspaces. Customer display navigation depends on Product sales and supported desktop capabilities. A hidden screen does not mean its records were deleted.

Owners configure Business, Workspaces and Sales. Admins see configuration they already have permission to save. Cashiers have no settings navigation. Backend permissions remain authoritative; workspace selection does not create staff roles.

## Boundaries to preserve

Keep setup away from transaction entry, with customer selection, prices, payment confirmation and totals visible where staff transact. Menus and table configuration remain separate from ordering. Preparation tickets, bills, invoices and payment receipts retain different document meanings while reusing supported printer layouts. Manual ticket printing is not automatic kitchen-printer routing.

This document replaces the earlier proposed relocation table: those settings moves are implemented. It does not establish production deployment or hardware acceptance. See [workspaces](workspaces.md), [user guide](user-guide.md), [hardware](hardware-setup.md) and [completion checks](business-completion-plan.md).
