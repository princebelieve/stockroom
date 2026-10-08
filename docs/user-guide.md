# Stockroom owner and cashier user guide

This guide follows the current app screens. Availability depends on your workspace, role and platform. Use the amounts, plan terms and warnings displayed in your installed app. Its chapters match `src/user-guide.json`, used by Help and Download full guide.

## Contents

1. Start here: install, register and sign in
2. Subscription: activate and renew access
3. Your first working setup
4. Navigation and roles
5. Overview
6. Business settings > Business
7. Business settings > Workspaces
8. Business settings > Sales
9. Business settings > Receipts
10. Business settings > Devices
11. Devices > POS and receipt scanning
12. Devices and Product sales > Weighed goods
13. Business settings > Food menu & recipes / Restaurant menu & tables
14. Menu settings > Recipes
15. Menu settings > Packaged stock
16. Product management: catalogue and opening stock
17. Product management: purchasing, receiving, batches and wastage
18. Product sales: basket to receipt
19. Product and oil sales: retail, bulk and customer prices
20. Payments & receipts: manually entered payment
21. Payments & receipts > Jobs & invoices
22. Payments & receipts > Church collections
23. Order counter > New order
24. Order counter > Orders and Preparation
25. Order counter > Order actions
26. Tables & tabs > Tables and tabs
27. Tables & tabs > Take payment and close a bill
28. Tables & tabs > Bill actions, History and refunds
29. Cash register
30. Sales history: receipts, voids and customer history
31. Stock count and Stock movements
32. Customer display
33. Customer accounts
34. Business performance and Reports
35. Staff & access and Staff activity
36. Sync now and Sync issues
37. Close your account, exports and referrals
38. End-of-day checklist and when help is needed

## Start here: install, register and sign in

1. Open Download / install Stockroom from the app or its welcome page. Choose the available Windows, Android or browser installation option for your device. A disabled download means that release is not available yet.
2. For a new business, use the registration request on the welcome/sign-in journey. Enter your business details and owner email. Check that email for the registration key and its expiry instructions.
3. Choose New business with a key. Use the issued key and matching owner email, create your owner password, and complete registration while connected to the internet. Choose your business type; its preset opens the matching selling workspace.
4. For a business already registered, choose Existing business and enter the existing owner email and password. Give the device a recognisable label. Do not create a second business just to add a device.
5. Sign in. The owner configures the business; cashiers use the sales screens. Keep your owner password private.

**Remember:** The developer installation tools are a separate legacy installation route, not the normal owner setup. Initial registration and device connection need the existing online service.

## Subscription: activate and renew access

1. Sign in as the owner and open Subscription, or use Subscribe in the sidebar.
2. Review the current trial/access status and the plans and prices actually displayed. Use Refresh if the screen needs an update.
3. If asked to sign in to the cloud owner account, use the same registered owner credentials. This is separate from signing out of the local app.
4. Choose the offered plan and renewal option. Complete the payment provider checkout. Play Store subscriptions use the Google Play flow supplied in that build.
5. Return to the app and refresh access. Confirm the displayed subscription status before attempting a paid-access transaction. Review automatic-renewal management separately if you enabled it.

**Remember:** A trial, price or grace period is determined by the displayed plan, not this guide. Subscription payment is different from a customer paying your business. Reconnect to refresh renewal status on an offline device.

## Your first working setup

1. Open Business settings > Business. Save the business name, currency and payment rules.
2. Open Business settings > Workspaces if you want to change the preset chosen during setup. Preview and apply it; existing products, menus and receipts are kept.
3. For Product sales, add products and opening stock in product management. For Order counter, configure a menu. For Tables & tabs, configure its own menu and tables.
4. Open Devices and configure only the scanner, POS, printer and customer display you actually use. Run a test where supported.
5. Create staff accounts in Staff & access, then practice one transaction in each enabled workspace. Confirm the receipt, stock effect and payment amount.

**Remember:** Use a clearly identified trial transaction and the appropriate authorised return/correction process. A completed transaction is a real saved record, not a preview.

## Navigation and roles

1. Use Daily work to open Overview, an enabled workspace or Cash register. On a small screen, open the navigation menu first.
2. Use the branch selector at the top before starting work. Stock and transactions follow that branch.
3. Use Records and management to review history, stock and reports. Some links appear only for the enabled workflow or your role.
4. Open Help beside a feature when you need an explanation. Optional sections expand without leaving the current transaction.
5. Owners see business configuration and subscriptions. Admins see the configuration their existing permissions allow. Cashiers do not see owner configuration.

**Remember:** Names may vary with a customised product form. Product management may be labelled Inventory, Menu and stock or another owner-defined catalogue name.

## Overview

1. Open Overview to see the enabled workspaces and examples of businesses they fit.
2. Review Received today and receipt counts. Order counter also shows active/unpaid orders; Tables & tabs shows open bills and amounts outstanding.
3. Choose Start a sale, Record a payment, Take a new order or Open tables and tabs to begin work.
4. For stock-enabled businesses, review the additional stock and business metrics below the workspace cards.

**Remember:** Business examples are guidance, not restrictions. Overview is a starting point; payment is completed in the chosen workspace.

## Business settings > Business

1. Open Business settings and select Business. Enter the business/app name and currency, then review wallet and extra-payment rules.
2. Select the banks or POS providers staff use. Add a provider if yours is missing. Save business settings after changing these options.
3. Upload a business logo if wanted. The app derives its main theme from a usable logo colour; workspace icons and status colours remain visual markers.
4. Under Shop branches, add a branch name and optional address. Use Edit details or Staff access for an existing branch. Change the active branch using the top selector.
5. Use the password form where available to change your password. In the browser build, use the sign-in password-recovery journey when directed.

**Remember:** Business identity, currency and branch configuration are owner-only. Read expandable Help before enabling credit or retained-extra-payment rules.

Owners can publish QR bank details and enable takeaway delivery with a fixed charge or delivery-area prices in Business settings. Save and synchronize. On Windows, Business backup and restore downloads encrypted backups or schedules daily backups to a chosen folder; restore requires the file password, owner password and RESTORE confirmation, and preserves current staff access.

## Business settings > Workspaces

1. Open Workspaces and choose the Payment screens selection.
2. Choose Product sales for stocked goods, Payments & receipts for manually described non-stock payments, or the combined option for both.
3. Choose Order counter only or Tables & tabs only when that is your main workflow. The separate enable checkboxes can add these workflows to another screen selection.
4. Select Save workspaces. Check Daily work for the resulting links. Choosing an only option hides workspaces outside that selection.
5. For stock/product forms, use Choose template, Customize fields, then Preview and save. Review categories, unit, labels and custom fields before saving.
6. Choose a city from the Reporting timezone dropdown, grouped by continent, such as Africa → Lagos. Check the UTC and local-time previews below the dropdown. Select Save reporting timezone, then Sync now. Existing saved timezones are retained until changed; businesses without a saved timezone default to UTC.

**Remember:** Catalogue templates supply labels, categories and units; they do not add specialist operations such as hotel bookings or prescription dispensing. Loading a template changes the draft. Hidden optional fields retain saved data. The preview is not a saved product. Use Sync now to share saved configuration with other connected devices.

## Business settings > Sales

1. Open Sales settings. Leave tax and customer rewards disabled if the business does not use them.
2. For tax, enable calculation, enter its label and rate, and choose whether prices include tax or tax is added. Set individual product rates where needed.
3. For rewards, enable earning/spending and set the reward percentage. Select the customer during a sale to use their balance.
4. For multiple offline tills, read the stock-allocation help and assign each till to an active stock location. Synchronize tills before enabling or changing assignments.
5. Select Save POS settings. Return to Product sales and check how the saved rules appear in totals and customer controls.

**Remember:** Sales settings are owner-only. Offline stock allocation is an optional advanced setup; single-till businesses can leave it disabled. These settings do not file tax returns.

## Business settings > Receipts

1. Open Receipts and select Customize receipt.
2. Enter the receipt business name, address, phone and email as needed.
3. Write your thank-you message and return/payment policy in Receipt footer.
4. Enable optional receipt tax only if needed, and review the rate and included/added treatment.
5. Save receipt settings. Make a new payment and preview its printed receipt.

**Remember:** The manually entered payment workspace uses these receipt details; consolidated table payments also capture the saved profile. Existing receipts keep their saved details. This does not replace the separate stock-checkout tax settings.

## Business settings > Devices

1. Open Devices and select the device: Receipt printer, A4 printer, Cash drawer, Paper cutter, POS, Barcode scanner or Customer display.
2. Enter the actual model and choose the supported connection. Continue to configuration.
3. Save the device-specific options. For a printer, choose the installed queue or supported print method and paper size. For a keyboard scanner, match its terminator. Choose each document action to use the same receipt printer for receipts, order reviews, preparation tickets, bills and job documents.
4. Run the offered test, observe the result and confirm it only when it is correct.
5. Finish the wizard. Reopen the device later to adjust or retest it.

**Remember:** Saved device details do not install a driver or prove hardware works. Windows printer drivers and scanner pairing are operating-system tasks. Unsupported connections remain unavailable; an ordinary manual POS receipt workflow does not require an automatic bank integration.

For shared kitchen/bar printing, the owner designates a Windows checkout as the branch printer. Configure its installed station printers, keep the app signed in, connected and on that branch, and synchronize sending devices. Review interrupted tickets before retrying because paper may already have printed.

## Devices > POS and receipt scanning

1. Select POS and save the provider/model/device reference in the supported manual profile.
2. At Product sales payment, choose POS. Keep Use connected Paystack POS off for manually confirmed payments.
3. Enter the provider and approved receipt reference, or select Scan payment reference to scan its barcode/QR.
4. Use the receipt-photo control when offered, review the suggested reference and confirm it against the actual approved receipt.
5. Check amount, currency and approval before completing the sale. Use the connected Paystack POS control only if that business integration is already configured.

**Remember:** A scan or photo extracts a reference; it does not verify that money arrived. Manually recording POS payment does not charge the customer again.

## Devices and Product sales > Weighed goods

1. Owners/admins open Business settings > Devices > Weighed goods hardware. Enable keyboard-output readings or weight labels on this checkout device. Products must use kg stock and a price per kg.
2. For a paired keyboard-output scale, set the bare reading unit. Select Weighed product in Product sales, focus Scale reading and send a stable reading such as 1.250 kg or 1250 g. Select Review measured weight.
3. For labels, configure the scale with a two-digit prefix from 20 to 29, five-digit product code, five-digit weight in grams and EAN check digit. Map product codes in Devices. Scan the label using the existing product scanner or camera.
4. Review the product and net kg, confirm that you checked the stable reading or printed label, then Add measured quantity. Cancel measured item changes neither basket nor stock. The app rejects invalid checksums, unmapped codes, zero/negative/unsupported precision and stock shortages.
5. Take payment through normal checkout. Receipt quantity and stock deduction use the measured kg. Multiple confirmed parcels accumulate; refunds use the saved receipt quantities and prices.
6. Test a real scale with reference weights, tare, stability, disconnects, barcode errors, a receipt and a return. This implementation supports keyboard output and the specified label format; serial protocols and live polling need model-specific adapters.

**Remember:** No scale model has been physically verified here. Device settings are local. The app does not control tare or stability. A price-encoded label cannot be treated as a weight label; configure the exact supported layout.

## Business settings > Food menu & recipes / Restaurant menu & tables

1. Open the enabled configuration tab for Order counter or Tables & tabs. Each has its own menu.
2. In Menu, add a named item, price, availability and prepared/stock-linked type. Configure extras/options and preparation station where offered.
3. For packaged goods, link the appropriate stock product. For prepared goods, configure its recipe when ingredient consumption is required.
4. Save the menu, then open the transaction workspace to confirm the items appear.
5. In Restaurant menu & tables, choose Set up tables and seats, add table names and capacities, then Save tables.

**Remember:** Menus and table configuration stay out of cashier transaction entry. Keeping an item unavailable hides it from new orders without changing already-saved orders.

## Menu settings > Recipes

1. Open Recipes and choose the prepared menu item.
2. Add or select each ingredient product. Enter the quantity consumed per portion in that product's selling unit.
3. Enter a usable unit cost and opening ingredient stock, or replenish existing ingredient stock through the offered stock controls.
4. Save the recipe and test a clearly identified preparation order.
5. When preparation starts, check the ingredient reduction and recorded cost. Review the recipe if quantities or units are wrong.

**Remember:** Ingredients are consumed when preparation starts, once per saved order. Payment must not consume them again. Cancelling/refunding prepared food does not automatically restore ingredients already used.

## Menu settings > Packaged stock

1. Open Packaged stock and enter product name, selling price, purchase cost and opening quantity.
2. Add the product. For an existing packaged product, use Add stock and Restock when receiving more.
3. Open Menu and link the item to that packaged product, then save.
4. Return to the order screen and verify its available quantity before selling.

**Remember:** Prepared recipes use ingredient stock. Packaged-stock controls are not the manual Payments & receipts workflow.

## Product management: catalogue and opening stock

1. Open the catalogue link, commonly Inventory. Search for the product before creating a duplicate.
2. Add or edit its name, SKU/barcode, category, selling unit, price, cost, current stock and reorder level as appropriate.
3. Use Preloaded catalogue starters for workspace-specific names, or import/completed-form tools for larger catalogues. Saved catalogue entries remain. Enter actual prices, costs and stock before saving; starters do not supply manufacturer barcodes or assumed prices.
4. Configure Product variants and extras here when required: choose the product, group/variant labels and extra names/prices, then save product options.
5. Return to Product sales and confirm scanning, item selection and price.

**Remember:** A barcode is not the same as a payment reference. Custom form labels do not change stock-calculation rules.

## Product management: purchasing, receiving, batches and wastage

1. Open Purchasing and receiving in product management. Add the supplier and product-specific pack conversion if required.
2. Record a purchase order when you need one. Receive the actual delivered quantities and costs; review paid/unpaid supplier amounts.
3. Use supplier balances/payments to settle what is owed. Record a supplier return or wastage through its specific action, with a reason.
4. Use Stock costs and expiry for optional batch labels/expiry dates and supported price, cost or barcode corrections.
5. Review the resulting stock and supplier history.

**Remember:** Do not count the same ingredient/product purchase again as a running expense. Pack conversions belong to a specific product and selling unit.

## Product sales: basket to receipt

1. Open Product sales. Scan a product barcode or tap a product tile to add it to the basket.
2. Use basket quantity controls to correct the quantity. Review each line and Total due.
3. Expand Customer, discount and note (optional) only when needed. Select the customer for rewards; permitted staff can apply a discount. Applied amounts remain in the totals.
4. Select Take payment. Choose the owner-enabled method. For cash, enter cash received and check change. For POS/transfer, enter the required approved provider/reference.
5. For split payment, enter the portions so they match the total. Review any overpayment handling required by the owner policy.
6. Select Complete sale once payment is confirmed. Print the receipt or use Print last receipt.

**Remember:** Use Back to products to change the unpaid basket. Hold sale saves a basket for later; Resume sale restores it. Clear basket clears an unpaid draft. A connected POS request must be resolved before altering its locked basket.

## Product and oil sales: retail, bulk and customer prices

1. Use Product sales for ordinary stocked goods, or the wholesale/retail oil setup for measured oils. Add each product in a consistent base unit with its retail selling price and purchase cost.
2. Open Purchasing and receiving > Pack / receiving conversions, add a named pack and its base-unit factor, enable its checkout offering and enter its selling price. Selling packs work in Product sales and containers work in Oil sales. Loose-unit tiers do not require packs.
3. Owners/admins open Inventory > Product price tiers (Oil price tiers for oil businesses), choose a product, and add bulk minimum quantities and prices per base stock unit. The highest qualifying threshold applies to the combined quantity of that product in Product sales or Oil sales; configured selling packs and oil containers contribute their base-unit quantity.
4. Add customer rates by selecting existing customer accounts. Select that customer in the checkout basket to apply its rate. Customer rate takes priority over bulk; otherwise retail/product or retail/container prices apply. Explicit manual prices and custom extra lines retain their separate prices.
5. Review rate labels, quantities and total before taking payment. Quantity or customer changes can change the applicable price. Saved receipts retain the selected price and label; refunds use those saved amounts.
6. Example: retail 10 per litre, bulk 8 from 20 litres and 7 from 100 litres, customer rate 6. One 25-litre can costs 200 under bulk pricing; one can plus 75 loose litres costs 700, or 600 with that customer selected. Stock consumption is 100 litres.
7. Save tiers with the existing sync workflow and update participating apps. Refresh before shared checkout to load changed rates. A stale settings save requires review; drafts preserve command IDs for retrying interrupted saves. Old app versions do not calculate these rates.

**Remember:** Rates are per base stock unit, not per container. Bulk rates apply to the entire qualifying quantity, not only units above the threshold. Different products do not combine. The same saved product rules apply in Product sales and Oil sales. Service descriptions and prepared-food menus retain their own prices; these rules do not reprice those workflows.

## Payments & receipts: manually entered payment

1. Open Payments & receipts > New payment. Enter Payment for, quantity and unit price.
2. Select Add another item for each additional description. Review each line total and the grand total.
3. Expand Customer and receipt details (optional) to add customer name/phone or transaction type.
4. Choose Cash, Bank Transfer, POS Terminal or Split payment. Split parts must equal the total; enter provider and reference for external parts. Owner-enabled Customer wallet requires a customer account; only the owner can approve enabled credit.
5. Save the payment and print or share its receipt. Open Payment history to find a previous payment.
6. For work that needs a deposit or later payment, open Jobs & invoices; New payment stays the simple full-payment form.
7. Owners/admins use Payment history > Refund payment when money must be returned. The original receipt remains saved.
8. Save reusable service names and prices in Business settings > Receipts > Saved services and prices. Add saved service copies the current price into the draft.

**Remember:** These descriptions are non-stock receipt lines: no product deduction or ingredient consumption. Confirm externally received payment before saving a manual POS/transfer entry.

## Payments & receipts > Jobs & invoices

1. Select New job / estimate. Enter the work description, customer, item descriptions, quantities and prices. Add an optional due date or instructions.
2. Save as a job, or start as an estimate. Select Accept estimate / issue invoice before collecting money for an estimate.
3. Choose Take payment and enter a deposit or full balance. Select Cash, POS Terminal, Bank Transfer or Split payment; confirm external payments and their references before saving. Owner-enabled Customer wallet is available for jobs linked to a customer account with sufficient wallet funds.
4. Print the saved payment receipt. It shows the amount received and remaining invoice balance. For a 100 invoice paid 30 then 70, there are two receipts and a zero balance.
5. Use Job details and actions to mark In progress and Ready. Collect the balance before marking Completed.
6. Choose Print estimate, Print job ticket or Print invoice for the document needed. These use the existing receipt printer. An invoice shows what is owed; a job ticket shows work instructions.
7. Owners/admins can open the job payment history and refund a payment by money amount. Refund retained payments before cancelling; history is kept.
8. Reopen the same job for later payments or receipt reprints. Jobs and payment drafts survive offline reload. Use its original till; Sync now shares saved work with other devices.
9. Search jobs and filter unpaid invoices or overdue unfinished work using the business reporting timezone. Choose an existing customer account on a new job for reliable invoice linking.
10. Owners/admins can print invoice customer statements for this branch. Currencies remain separate; net paid includes refunds. Statements exclude estimates, cancelled jobs, separate walk-in receipts and wallet balances.
11. Owners/admins use Job materials and costs on the original till to record paper, ink or other stock actually used. Review stock changes, then Cancel or use the red Confirm stock changes button. Saved costs and quantities remain after refunds or cancellation.
12. Use Purchasing and wastage inside the material screen for supply deliveries, batch costs and spoilage, even without Product sales. Material use reduces profit when recorded; do not expense the same purchases again. Labour and overheads belong in Expenses.

**Remember:** Saved job details and prices are snapshots. Correct an issued job by refunding retained payments, cancelling and creating its replacement. Reports count payments and refunds; creating an estimate or invoice does not record revenue.

## Payments & receipts > Church collections

1. Owners/admins use Add fund and Add donor to create branch records. Donor identities remain separate even when names match. Archive records with confirmation to prevent new commitments without deleting history.
2. Choose New pledge / donation, select the fund and donor, enter the purpose and amount, then Save commitment. Pledges require a registered donor and can have a due date. One-off donations may be anonymous. Saving a commitment does not record received money.
3. Open the commitment, choose Receive contribution and save a partial or full amount using cash, externally confirmed transfer/terminal payment or split payments. One payment creates one receipt, with no stock deduction or sales tax.
4. Owners/admins use Refund contribution for a monetary refund. Refunds reduce fund and donor totals and reopen the pledge balance. Refund retained payments before cancelling a commitment; history remains.
5. Owners/admins filter Fund contribution totals and donor statements by donor, fund and business-timezone date range. Print the statement or export received contributions/refunds as CSV. Current outstanding pledges are shown separately; currencies remain separate.
6. Keep payment management on the original till. Reload preserves draft/payment identifiers. Retry an interrupted payment using the same entry; review current balances before starting a new payment. Sync now shares records with compatible updated devices.

**Remember:** Fund totals show net contributions, not bank balances or fund spending. Statements cover structured church records in this branch, exclude legacy unassigned receipts, and are not tax certificates. Sharing requires church-collections-v1 and service-jobs-v1 support in the existing sync backend.

## Order counter > New order

1. Choose a menu item, quantity and any extras, then select Add to order. Repeat for the complete order.
2. Review the order lines and total. Remove an incorrect line before submitting.
3. Expand Customer and order details (optional) to add a customer/account or preparation note. Use Discount only when permitted. Choose Takeaway, Dine in or Delivery when needed; Takeaway is the default.
4. Select Send and take payment to save the order and open payment immediately. Choose method, record tender/reference and Save order payment. Split payment accepts cash/POS Terminal/Bank Transfer parts that add up to the order total.
5. Alternatively select Send for preparation and collect payment later through Orders > Take payment.

**Remember:** Submitted orders retain their saved prices. Pay on the till that created the order. Payment entry temporarily hides the order queue; Close payment returns to it.

## Order counter > Orders and Preparation

1. Open Preparation to see accepted queued work. Filter by All stations, Kitchen or Bar. Select Start preparing, then Mark ready when the order is ready.
2. Print the preparation ticket when needed. Read the preparation note and selected extras. Preparation tickets omit payment prices and totals.
3. Open Orders to collect any unpaid amount. Save the payment and print its receipt.
4. Use Hand over once the order is ready and paid. Collected orders move into their separate history section.
5. For QR/customer orders, review the order in Orders and select Accept on this till while connected. Synchronize before preparing or taking payment. Customers can enter their pickup name as guests; wallet sign-in is optional. Use Sync orders to share updates.
6. Owners/admins open Batch production to record ingredients actually used, expected yield, actual usable finished stock and optional expiry. Review stock changes, then Cancel or confirm. Use for new batch copies an earlier batch into a new draft.
7. Link produced stock in Menu as Stocked goods - deduct stock, or use it as a recipe ingredient. Input cost becomes finished-stock cost; do not also consume its raw recipe for the same portion. Use Purchasing and wastage for spoilage or a completely failed batch. Sharing these records requires updated app/server support for stock-work-v1.

**Remember:** Preparation consumes configured recipes once. Pay and start recipe preparation on the original till, or the accepting till for online orders. Verify transfer funds before saving payment. Windows supports automatic kitchen/bar ticket routing with visible retry failures. The owner can recover the original checkout identity on a synchronized replacement under Device settings after stopping the source and reconciling unsynchronized activity.

## Order counter > Order actions

1. Open Orders and expand Order actions on the relevant order.
2. Use Correct order only for an eligible unpaid queued order; enter the reason, adjust the draft and Save correction.
3. For cancellation, enter a reason and confirm. Review the saved status afterwards.
4. For an eligible paid order, use Refund order, select quantities and the refund method/reference, confirm the actual refund and save.
5. Reprint a receipt from the completed-order area when needed.

**Remember:** Availability depends on order stage, original till and permissions. A paid unserved order must be fully refunded before cancellation. Prepared ingredients are not automatically restored.

## Tables & tabs > Tables and tabs

1. Choose a free table or Open bar tab for a named running tab.
2. Enter the bill/tab name and guest count, then Open bill.
3. Choose a seat or shared items, add menu items and send the order. Add more rounds to the same bill as required.
4. Review the itemized bill and outstanding total. Use Print itemized bill for a customer review before payment.
5. Open Orders/Preparation to progress service. Kitchen/bar tickets contain the relevant station lines. Mark served when delivered.
6. Owners/admins can open Orders / Preparation > Batch production for food made in advance. Record actual ingredients and usable yield, then confirm. Link finished stock in Menu or recipes; preparation consumes it at its captured batch cost.
7. Open Reservations > New reservation for advance bookings. Enter guest details, party size, table and arrival/departure in the business reporting timezone. Unassigned requests hold no table; assigned bookings check capacity and overlap.
8. Mark arrived, then Open reservation bill from 30 minutes before arrival until departure. Mark seated links that bill. Mark visit completed does not settle or close it; use the normal bill payment and closing controls.
9. Cancel reservation or Mark no-show requires confirmation and a reason. Owners/admins can Archive finished reservations without deleting history, or Export reservation history as CSV summaries. Reservations do not collect deposits or record sales.

**Remember:** A printed unpaid bill is not a payment receipt. Synchronize devices before sharing table occupancy; use one till to manage each open bill.

Shared reservations require updated apps and a sync backend supporting `restaurant-reservations-v1`. Synchronize before confirming a table; review offline calendar conflicts in Sync issues.

## Tables & tabs > Take payment and close a bill

1. Open the bill and select Take payment. New-order entry is hidden while payment is open.
2. Use the default whole remaining bill, or choose the offered seat, item/quantity or equal-share selection.
3. Choose cash, POS, transfer or mixed payment. Enter tender, provider/reference and payment parts as required.
4. Save bill payment. Print the saved receipt. Remaining unpaid quantities stay on the bill for later settlement.
5. Once the bill is fully paid and every order is served or cancelled, select Close bill and free table.

**Remember:** If the bill changed during payment entry, review it and use Refresh payment entry. Retrying the same saved payment must not create another charge. Close payment entry returns to adding orders.

## Tables & tabs > Bill actions, History and refunds

1. Expand Bill actions on an open bill to move it to another free table or merge an eligible unpaid bill into another.
2. Choose the destination and confirm. Verify table occupancy and the combined bill afterwards.
3. Open History to find Restaurant payment receipts and Closed bills.
4. Reprint the payment receipt or closed bill. For an authorised refund, choose returned quantities and the actual refund method/reference.
5. Review the remaining bill/return history after saving.

**Remember:** Move/merge operations retain original orders and prices. Merge is restricted to compatible unpaid bills on the original till/currency. Refunds do not automatically restock prepared items.

## Cash register

1. Open Cash register at the start of the shift. Enter Starting cash and Open register.
2. Record only separate cash-in/cash-out movements, entering amount and reason.
3. Cash sales, cash refunds and supported supplier cash transactions recorded during the session are counted automatically.
4. At shift end, count physical cash, enter Cash counted at closing and explain a difference when required.
5. Select Close register and review expected cash, counted cash and the difference.
6. If an entry is interrupted, retry with its original values. After reloading, use Refresh and recover register entries to check whether it was saved.
7. For staff handover, close and count the outgoing shift on its original till before the next staff member opens a shift. Owners/admins can use Review staff shift on this till to close an outgoing staff shift.

**Remember:** Do not record a cash sale again as a manual cash movement. The cash register is daily work, not configuration.

## Sales history: receipts, voids and customer history

1. Open Sales history and use its section links to find Receipt history or Voided items.
2. Choose the saved receipt and reprint it. Use digital receipt controls where offered.
3. Use Return items from a completed receipt for authorised returns: choose quantities, stock restoration only for resellable goods, method and reason.
4. Review customer history and balances for the selected customer.
5. Use Payment evidence and Match payments to review provider/reference records or reconcile an imported provider report.

**Remember:** A payment reference, OCR suggestion or imported report needs review; it is not a new payment. Preserve original receipts and use the return process instead of rewriting history.

## Stock count and Stock movements

1. Open Stock count, start/select a count and enter the quantities physically found.
2. Review the difference from recorded stock. Submit/review approval using the available authorised controls.
3. Open Stock movements to trace recorded stock changes and reasons.
4. For an incorrect quantity, use the appropriate stock adjustment, count, receipt or transfer action rather than altering a historical sale.

**Remember:** Permissions determine who may approve corrections. Approved losses affect stock/cost reporting; do not duplicate them as unrelated expenses.

## Customer display

1. On a supported desktop, open Customer display or its device setup.
2. For a second monitor, extend the desktop and use Open customer display on second monitor.
3. For a browser customer device, connect it to the same private shop Wi-Fi and create a customer share link.
4. Open the link on the intended customer device while the pairing link is valid.
5. Add products in Product sales and confirm the live basket, total and completed-sale confirmation on the customer screen.

**Remember:** The display is read-only. Current native/mobile-browser builds do not offer the same desktop display integration. Pairing/session expiry instructions are shown in the app.

## Customer accounts

1. Open Customer accounts and select or add the customer with their name and contact details.
2. Review their balance and recorded account activity.
3. Use the available account controls to record funds or repayments with the correct amount and reference.
4. When wallet payments are enabled, choose the customer wallet during checkout and review the available balance.
5. Only the owner may approve a purchase that creates debt when credit is enabled.
6. Open Birthday reminder, enter MM-DD and enable the reminder. Save locally, then sync for remote notifications. Daily reminders use the business timezone; staff send greetings themselves.

**Remember:** Customer balances are separate from owner referral rewards. Account entries record business transactions; they are not a bank transfer initiated by the app.

## Business performance and Reports

1. Open Business performance where available to review owner/admin business metrics.
2. Open Reports to review sales, stock valuation, estimated profit and low-stock items.
3. Record actual running expenses with category, description, amount and date.
4. Use the offered report export/print action for the current data.
5. Review missing costs before relying on the profit estimate.

**Remember:** Reports use saved records. Prepared items without recipes have untracked ingredient costs. The performance view is platform-dependent; do not enter purchased stock again as a running expense. Reports use the saved business reporting timezone shown on the report; date-only expenses keep their entered business date. Synchronize settings and records before comparing devices.

If Profit estimate has incomplete costs appears, review the named prepared items, saved recipes and purchase costs before trusting profit. Delivery charges are excluded from recipe warnings. Enter running expenses separately.

## Staff & access and Staff activity

1. As owner, open Staff & access > Team members, select Choose staff access and tick the selling workspaces and operations the staff member needs. Save staff access using your owner password. New staff cannot operate until access is granted. Existing access remains until you save a selection; offline devices receive changes on their next sync.
2. Choose Add staff, enter the requested details and temporary password, then confirm the username and owner credentials when prompted.
3. Give the staff member their username and temporary password securely. Grant only the access their job needs.
4. Use Staff passwords for recovery/reset. To revoke access, choose Remove staff beside an admin or cashier, read the warning, and enter your owner password. Cancel makes no change; the red Confirm staff removal button submits the request. Synchronize other devices afterward.
5. Open Staff activity to select branch/person/date range and review recorded sales, expenses and voids.

**Remember:** Staff creation/recovery requires the appropriate online owner verification. Cashiers use their staff username; the owner uses the registered email. Only owners can remove staff. Removal preserves sales and activity history, blocks cloud access immediately, and reaches offline devices when they reconnect and sync. Removed usernames remain reserved for historical identity. Admin access does not automatically grant every owner setting.

## Sync now and Sync issues

1. Connect to the internet and check the displayed sync readiness for this device.
2. Press Sync now to share queued changes and receive accepted updates.
3. If changes need review, open Sync issues, select the affected record and inspect both saved versions. Check current records and use Stock count, Sales history or the relevant workspace to correct the discrepancy.
4. Use the available authorised resolution/retry control, then synchronize again.
5. Check the relevant workspace/history after synchronization before continuing shared-device work.

**Remember:** Local saving is separate from synchronization. A disabled sync control or incompatible-server message cannot be solved by repeatedly creating transactions. Do not switch stock allocations while tills remain offline.

## Close your account, exports and referrals

1. Open Subscription for owner referral links, rewards and payout controls where available. Customer accounts are a different balance system.
2. Before leaving, use the offered export controls and check that you can open the downloaded files.
3. Only owners can open Close business account. Choose Delete business account to read the warning screen. Choose Cancel to leave without submitting, or type DELETE and use the red Confirm account deletion button when ready. Staff cannot close their accounts.
4. Manage recurring billing through its supplied subscription/provider controls as directed; do not assume deleting local app files cancels billing.

**Remember:** Closure deactivates cloud access immediately and schedules deletion after the displayed waiting period (14 days by default). Cancel before the deadline to restore access. Export necessary records and manage recurring subscriptions separately. Offline device copies are not remotely erased.

## End-of-day checklist and when help is needed

1. Finish or identify outstanding payments. Review open orders and open table bills. Check Jobs & invoices for outstanding service balances.
2. Print/reprint any required receipts. Confirm returns and separate cash movements are recorded once.
3. Count and close the cash register. Review differences and the day's sales.
4. Synchronize when connected and review unresolved sync issues. Log out when handing the device to another user.
5. Contact the app provider for unavailable release downloads, failed registration delivery, unavailable provider integration or persistent service problems. Contact the device supplier for printer-driver or hardware issues.

6. For the first supervised pilot, use a separate practice business first. Record opening stock, purchase costs, recipes and an opening cash float. Agree who will check the cash, bank evidence and physical stock.
7. Run cash, bank transfer, split payment, a correction and a refund. For food businesses, submit a QR pickup and a delivery order, verify the bank details and fee, and check kitchen/bar tickets from a second device.
8. Disconnect the internet, record an ordinary local sale, reconnect and synchronize. Confirm one receipt, one stock deduction and no duplicate ticket. QR submissions and shared printing require connectivity.
9. Close and count the register. Compare cash expected, counted cash, transfers, refunds, stock usage and estimated profit with an independent paper tally. Investigate every unexplained difference.
10. Download an encrypted backup and check the scheduled backup folder. In the practice business, test restore and an enrolled replacement till recovery. Do not replace live records for a rehearsal. Begin the real-business pilot only after these checks pass, with someone available to help staff.

**Remember:** Ordinary sales, menus, tables, receipt settings and renewals have in-app controls. Hosting, release publishing, mail delivery and payment-provider provisioning remain service-operator tasks, not instructions for a shop owner to edit code.


## Support, reconciliation and recovery updates

Find support email, information email and WhatsApp links in **How to use the app**. Report your device and the error shown; keep passwords and payment-card details private.

In **Sync issues**, inspect submitted and accepted records, synchronize and verify the current outcome. Use the normal stock/payment/configuration tools for corrections. Choose an outcome, explain what you checked or corrected, confirm the check and select **Record review outcome**. Recorded outcomes remain visible in local history. This does not overwrite financial records or automatically correct a stock/customer balance. Review notes are local to the device, not synchronized to other devices.

In sales reconciliation, select External POS or Bank transfer, map the statement columns and choose its currency and covered UTC sale dates. Split-payment portions are compared individually. Missing references, duplicate references, amount/currency mismatches, unsuccessful statement entries and recorded payments absent from the file need review. Exports retain the comparison; imported matches do not independently verify a bank transaction or change a receipt. Compare gross amounts, not amounts net of fees/refunds; synchronize and load all relevant receipts first.

New Windows backups support compatible additive database updates. Older archives without schema metadata can be upgraded automatically for recognised field additions when their original structure can be verified. See [hardware and recovery](hardware-setup.md#backup-compatibility-after-updates).

## Copy takeaway and restaurant menus

1. Owners/admins open the destination menu in Business settings. Enable both workspaces and synchronize before loading the source.
2. Open Copy menu items from restaurant/takeaway, preview the source and select items. Review prices, ingredient quantities and extras.
3. Choose Add selected items to menu draft, review stock links, availability and stations, then Save menu. Cancel preview changes no menu; Discard menu changes removes unsaved additions.

**Remember:** Existing items stay unchanged. Same-name and previously copied source items are blocked. Copies have fresh identities and independent future edits; submitted orders retain their snapshots.

## Online retail ordering and delivery

1. As owner, open Business settings > Business. Enable online retail ordering and choose the products to publish. Save business settings and synchronize. Only selected products with positive selling prices are published; costs and stock counts stay private.
2. Share the retail customer link under Business sign-in links, or its QR code. Mixed food/retail businesses use the retail link for stock products and the existing food link for menus.
3. Configure published bank details and optional fixed delivery charge or delivery-area prices. Customers can order as guests, request delivery and submit transfer references without Paystack verification. A transfer reference is a claim; staff must verify receipt of money.
4. Open Online retail orders on the fulfilment branch (currently Main branch). Sign in as staff granted Product sales access, or Oil sales for an oil order. Accept the order while connected and sync it to this till.
5. Use the Picking queue to start picking and mark ready. Take payment on the accepted till. For delivery, assign an agent, mark ready, Dispatch delivery, then Complete delivery on arrival. Pickup orders use Hand over. Payment uses existing cash, transfer, terminal, split and owner-enabled wallet controls; stock is deducted once when payment is recorded.
6. After acceptance and sync, picking and payment save locally through an outage. Sync when connected to update customer tracking. Online requests do not reserve stock; check actual availability before confirming payment.

**Remember:** Retail online prices are the published product retail prices in base units. Walk-in pack, bulk and customer pricing remain in the selling workspaces. Online ordering and remote notifications need an internet connection; ordinary checkout remains offline first.

Owners can use How to use the app > Set up your business for a saved checklist that links to the existing workspace, staff and device tools. Setup, catalogue entry, training and troubleshooting assistance is available to request through the existing support contacts; support confirms availability and any charge.

## Contact support through Gmail

Open How to use the app > Contact Stockroom support > Send a support request. Enter your name, contact email, subject and what happened. Drafts stay on this device while offline; press Send support request when connected. Keep the displayed reference. If sending is interrupted, use Retry saved request to retain that reference. Support replies to your contact email. The form requires an enrolled device and does not read your Gmail inbox. Email and WhatsApp links remain available. Do not include passwords or payment-card details.
