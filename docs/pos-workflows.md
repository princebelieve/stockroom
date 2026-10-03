# POS workflows

For service businesses, open **POS → Charge for a service**. Enter a description (for example, A4 DI printing from a customer-supplied design), quantity and price per unit, then **Add service to basket**. Use **Take payment** and **Complete sale** to save the receipt, then print or share it using the existing receipt actions. A service needs no inventory product and does not deduct stock. Goods and services can share a basket. Service descriptions survive held baskets, saved drafts, receipts and synchronization. Service refunds never restock inventory. These are immediate charges; booking, job tracking and deposits are not included.

Unpaid baskets are saved on the current device per staff member and branch. **Hold sale** saves a named basket for later; hold or clear the current basket before resuming another. The existing explicit void action keeps its reason requirement. Ordinary quantity changes do not ask for a reason.

Owners and admins can add a fixed or percentage basket discount and override a selling price. Weighted quantities support three decimal places. Product variants use separate existing SKUs; **Product variants and extras** groups those products and adds optional priced extras. Extras do not deduct separate ingredient inventory.

**Cash register** records starting cash, reasoned cash-in and cash-out movements, and a counted closing balance. Cash sales and cash refunds linked to the session determine expected cash. A difference needs an explanation.

Owners and admins can return selected quantities from a saved receipt, choose whether to restock each line, and record a refund method. Refund calculations preserve the original discount and tax, including rounding across partial returns. Customer account refunds appear in the wallet ledger. Provider refunds must be performed separately and recorded with a reference.

Customers can be attached to any payment method for purchase history. Optional loyalty settings record reward credit earned on receipts; redemption is not implemented in this version. Review return records when assessing earned rewards.

Tax is **off by default**. The owner can enable a named percentage and choose whether prices include tax or tax is added at checkout. The receipt preserves its pricing settings. This is a configurable receipt calculation, not tax filing or a determination of what tax the shop owes. The current calculation applies one rate to the whole basket.

Receipts can be printed, downloaded, copied, shared, or sent by the existing server Gmail API connection. Gmail sending needs the sale synchronized first and the server's existing `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` configuration. The email/SMS links open the device's messaging app; SMS delivery does not use an automated SMS service.

Integrated terminal checkout uses [Paystack Terminal](paystack-terminal.md). Manually confirmed terminals, bank transfers, and split payments retain their existing reference requirements. Connected Paystack currently handles the full sale amount; split terminal payments remain manually confirmed.

Held baskets, register sessions, and returns synchronize as POS records. Offline work on different devices is not a globally locked checkout: synchronize before resuming shared baskets or processing returns, and keep a register session on one device. Cloud coordination detects exceeded return quantities and stock balances, while revision checks reject stale shared basket/register edits. Independently offline tills cannot reserve stock or prevent simultaneous returns; retained receipts and reported conflicts need owner review.

## Supermarket checkout and reports

Ordinary product entry requires no expiry date or batch label. Checkout automatically allocates the earliest unexpired recorded stock, then stock with no recorded expiry. Recorded expired stock cannot be sold. Transfers and restocked refunds preserve batch information. A physical cashier must still pick the appropriate dated stock: the app cannot observe which packet was taken from a shelf.

Returns preserve the selected batches' costs and cumulative tax rounding. Goods not restocked retain their sold cost. Reports subtract refunds when recorded and include running expenses and recorded wastage; see [report calculations](report-calculations.md).
