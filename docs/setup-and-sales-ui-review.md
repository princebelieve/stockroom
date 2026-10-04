# Setup and sales UI review

This is an inspection of the current code, not a proposal to replace supermarket checkout. The original product catalogue, basket, payment-reference scanner and customer display remain the supermarket sales workflow.

## Where configured features are used

| Feature | Current setup location | Where staff use it | Recommendation |
| --- | --- | --- | --- |
| Allowed payment methods and POS providers | Business settings | Supermarket basket payment selector | Keep configuration in Business settings. |
| POS device profile | Printers & devices | Supermarket payment controls: manual POS reference entry, scanner and receipt photo; connected Paystack POS has its own payment control | Keep device configuration separate from sales. Receipt scanning currently appears when POS is selected and connected Paystack mode is off. |
| Scanner | Printers & devices | Product search/scanning and POS receipt-reference scanning | Keep setup under devices; keep both scan actions on the sales screen. |
| Customer display | Printers & devices and Customer display pairing screen | Live supermarket basket and completed-sale confirmation on paired display | Keep pairing available as a device action. Workspace selection currently hides its navigation when stock checkout is disabled. |
| Tax and customer rewards | Register and receipt tools on checkout and Sales history | Basket totals, customer selection and Spend rewards | Move configuration to a Sales settings section. Keep customer selection and totals at checkout. |
| Stock allocation for offline tills | Register and receipt tools on checkout and Sales history | Checkout validates the selected stock location | Move configuration to Sales settings; retain the checkout validation. |
| Product variants and extras | Register and receipt tools on checkout and Sales history | Catalogue variant filter and product extras selection when adding to basket | Put configuration with product management; retain selection when selling. |
| Receipt identity, footer and optional receipt tax | Payments & receipts > Receipt settings | New payment receipt and printing | Put configuration in a clearly named receipt settings destination. Keep payment entry separate. |
| Fast food menu, packaged goods and recipes | Order counter > Setup | New order menu, selected extras, preparation and ingredient consumption | Preserve explicit Setup, separate from taking orders. |
| Restaurant tables, seats and menu | Tables & tabs > Setup | Tables and tabs, repeated orders, preparation and bill settlement | Preserve explicit Setup, separate from serving and taking payment. |
| Cash register | Register and receipt tools | Opening cash, cash movements and closing count | This is daily work, not configuration. Give it a clear operational destination. |
| Refunds and receipt history | Sales history and workspace history | Receipt selection, reprint and authorised returns | Keep with records, away from new-sale entry. |

## Confirmed navigation problem

The former Sell (POS) navigation was renamed Product sales. It is shown only for stock or both workflow selections. Payments-only, Fast-food-only and Restaurant-only selections hide it and redirect away from it. Customer display navigation also depends on stock checkout. That explains how the original sales experience can become inaccessible without its code being deleted; it does not establish the setting on a particular running device.

## Safe next change

Create a clearly identified sales-settings destination and move tax, rewards and offline till allocation there, retaining their existing save APIs and permissions. Move product-option configuration to product management. Keep the supermarket catalogue, basket, payment selection, POS receipt scanner and customer display intact. Confirm each moved setting still affects the existing sales controls before making further navigation changes.

Only payment-machine wording was changed to POS during this review. Internal identifiers, payment methods, storage keys and device integration were retained. No settings were moved as part of this review.

## Implemented organisation

Business settings now has Business, Workspaces, Sales, Receipts and Devices tabs, plus enabled food-menu/recipe and restaurant-menu/table tabs. Existing owner-only APIs remain owner-only. Admins see configuration they already have permission to save; cashiers have no settings navigation. Tax, rewards and stock-allocation configuration no longer render in checkout or history. Product options now render in product management. Payment receipt configuration is in Receipts, and food/table setup no longer renders in transaction workspaces. Cash register has its own daily-work screen. Returns and customer history remain under Sales history. The earlier recommendations above describe the inspected starting point.
