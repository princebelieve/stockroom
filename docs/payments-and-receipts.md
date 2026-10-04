# Payments & receipts

In **Business settings → Business type**, choose **Payment screens**:

- **Payments & receipts** for direct payment entry without stock.
- **Stock & checkout** for the existing product basket and inventory workflow.
- **Both** for two separate navigation buttons.

**Fast food only** selects the separate menu-ordering workspace. To combine it with these payment screens, use **Enable separate Fast food workspace**. See [Fast food workspace](fast-food-workspace.md).

Click **Save payment screens**. Use Sync now to share the choice with other devices. Changing this choice preserves existing products, receipts and drafts.

In Payments & receipts, enter **Payment for**, optional customer name/phone, **Unit price**, and the payment method. Existing customer names can prefill their phone number. New customer details are saved on the receipt; this does not automatically create a customer account.

Quantity defaults to one. Use **Add another item** when the customer pays for several things together. These are plain receipt descriptions; there is no SKU, stock lookup or inventory deduction.

Owners and administrators can open **Customize receipt** to save business contact details and their own footer. Each payment retains those details for later reprinting. Tax is disabled by default: entry, printed receipts and digital receipts omit it. Businesses that need it can explicitly enable it in receipt settings.

Receipts include the receipt number, date, time, transaction type, cashier, descriptions, quantities, unit prices, subtotal, grand total, payment method, amount received and change.

Cash received defaults to the grand total; enter a larger cash amount to calculate change. For transfer or terminal payments, record the provider/reference and confirm success on the bank/terminal before saving. These methods record an externally received payment; they do not initiate a connected terminal charge.

Click **Save payment**, then **Print receipt** or open **Digital receipt** to download, share/copy, or open email/SMS. Automated Gmail delivery uses the existing configured cloud service and requires the receipt to be synchronized. Printing or sharing does not record another payment.

Payment history supports description, customer name, phone, receipt ID and payment reference searches, plus reprinting and digital receipt actions. Service payments also remain in the existing sales/reporting records, identified by their service-payment details. Owner/admin history includes downloaded branch receipts; synchronize devices to obtain newer remote records.

The service form has its own local draft per business, staff member and branch. Switching between screens preserves it and the product basket independently; reopening the app restores the saved service draft. Saving a payment clears that draft for the next customer.

Service payments save as validated non-stock service receipt lines through the existing local database and sync infrastructure. They do not reduce products, create stock movements or allocate batches. Product checkout remains separate. Older app versions may display these as ordinary service receipts without the new screen/customer fields; update clients to use the new workflow consistently.

This screen records fully paid transactions. It does not introduce invoices, deposits, instalments, bookings or job tracking.
