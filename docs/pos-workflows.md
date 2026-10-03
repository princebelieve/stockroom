# POS workflows

For payments without inventory, use the separate **Payments & receipts** screen. Enter what the customer is paying for, optional customer details, the amount and payment method, then save and print or share the receipt. This screen never deducts stock. Owners can enable **Stock & checkout**, **Payments & receipts**, or both in **Business settings → Business type → Payment screens**. See [Payments and receipts](payments-and-receipts.md) for details.

Unpaid baskets are saved on the current device per staff member and branch. **Hold sale** saves a named basket for later; hold or clear the current basket before resuming another. The existing explicit void action keeps its reason requirement. Ordinary quantity changes do not ask for a reason.

Owners and admins can add a fixed or percentage basket discount and override a selling price. Weighted quantities support three decimal places. Product variants use separate existing SKUs; **Product variants and extras** groups those products and adds optional priced extras. Extras do not deduct separate ingredient inventory.

**Cash register** records starting cash, reasoned cash-in and cash-out movements, and a counted closing balance. Cash sales and cash refunds linked to the session determine expected cash. A difference needs an explanation.

Owners and admins can return selected quantities from a saved receipt, choose whether to restock each line, and record a refund method. Refund calculations preserve the original discount and tax, including rounding across partial returns. Customer account refunds appear in the wallet ledger. Provider refunds must be performed separately and recorded with a reference.

Customers can be attached to any payment method for purchase history. Optional loyalty settings let customers earn and spend branch rewards. Select a customer and enter Spend rewards before taking payment. Rewards reduce the basket before tax, are checked against the locally recorded balance within the sale transaction, and are separate from prepaid wallet funds. Returns restore spent rewards and reverse earned rewards using cumulative cent rounding. A reversal can leave a negative reward balance if those rewards were already spent; further redemption is blocked until the balance recovers. Independently offline tills can spend the same previously synchronized rewards; synchronization retains both receipts and reports the difference for owner review.

Tax is **off by default**. The owner can enable a named percentage and choose whether prices include tax or tax is added at checkout. The receipt preserves its pricing settings. This is a configurable receipt calculation, not tax filing or a determination of what tax the shop owes. Set a default rate and optional Product tax rates in POS settings. A product rate of 0 marks an exempt item; clearing its rate restores the default. Saved receipts retain the rates used for their calculations and refunds.

Receipts can be printed, downloaded, copied, shared, or sent by the existing server Gmail API connection. Gmail sending needs the sale synchronized first and the server's existing `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` configuration. The email/SMS links open the device's messaging app; SMS delivery does not use an automated SMS service.

Integrated terminal checkout uses [Paystack Terminal](paystack-terminal.md). Manually confirmed terminals, bank transfers, and split payments retain their existing reference requirements. Connected Paystack currently handles the full sale amount; split terminal payments remain manually confirmed.

Held baskets, register sessions, and returns synchronize as POS records. Offline work on different devices is not a globally locked checkout: synchronize before resuming shared baskets or processing returns, and keep a register session on one device. Cloud coordination detects exceeded return quantities and stock balances, while revision checks reject stale shared basket/register edits. Independently offline tills cannot reserve stock or prevent simultaneous returns; retained receipts and reported conflicts need owner review.

## Supermarket checkout and reports

Ordinary product entry requires no expiry date or batch label. Checkout automatically allocates the earliest unexpired recorded stock, then stock with no recorded expiry. Recorded expired stock cannot be sold. Transfers and restocked refunds preserve batch information. A physical cashier must still pick the appropriate dated stock: the app cannot observe which packet was taken from a shelf.

Returns preserve the selected batches' costs and cumulative tax rounding. Goods not restocked retain their sold cost. Reports subtract refunds when recorded and include running expenses and recorded wastage; see [report calculations](report-calculations.md).


## Separate stock for offline tills

POS tools ? Optional tax and loyalty settings ? Offline stock for multiple tills shows this installation's till ID. In Business settings, create a separate stock location for each till; stock locations use the existing branch inventory and transfer workflows. Divide goods with stock transfers, assign each till ID to its location, and enable Use separate stock for each offline till. The server rejects sales from unassigned tills or the wrong location, including ordinary sales without POS details. Local stock checks continue to apply, so a till can sell only its own remaining allocation while offline.

This option is off by default. Synchronize all tills before activation and before changing assignments or transferring remaining allocated stock. Keep one installation per assigned location; do not clone its browser storage onto another independent till. For small stores using a single till, ordinary offline checkout requires no stock-pool setup. This option separates branch reports and reward balances by stock location; it does not implement a business-wide reward wallet.

Completed offline sales from shared inventory are imported even when another till has exhausted their recorded batch. Original quantities and captured batch costs remain on the receipt; available batch balances are clamped at zero and branch inventory records the shortage. New local sales still reject insufficient stock. Synchronization reports discrepancies for review rather than rejecting a completed receipt.
