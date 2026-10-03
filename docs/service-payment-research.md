# Service payment workflow research

Researched: 2026-10-03. This document records research and proposed design; it does not describe newly implemented features.

## Research scope

Reviewed official product/support documentation and published screen references for Square, SumUp, Zoho Invoice, PayPal Invoicing and Paystack. No paid accounts were created or live payments attempted. Published screenshots illustrate patterns rather than proving the exact current interface in every market. Some image asset fetches failed, so visual conclusions rely on accessible official screen references and documented actions. Product editions, regions and hardware differ; capabilities from different editions must not be combined into a fictional single app.

## Three distinct patterns

| Pattern | Merchant workflow | Best fit |
| --- | --- | --- |
| Quick payment | Enter description/amount, optionally attach customer, choose method, confirm payment, issue receipt | Immediate service payments, counter fees and one-off charges |
| Invoice/bill payment | Create a charge for a customer, record one or more payments, track remaining balance | Deposits, staged payments and payment due later |
| Payment link/page | Create a request, share it, customer completes hosted checkout, verify status | Remote collection |

The proposed Stockroom workflow is primarily quick payment. Invoice/bill support should be an explicit extension, not an accidental consequence of an ambiguous total field.

## What existing apps actually do

### Square

[Custom amounts](https://squareup.com/help/us/en/article/5429) use Checkout → Keypad → amount → review → Charge. Multiple custom amounts can be entered without selecting catalogue items.

[Notes documentation](https://squareup.com/help/us/en/article/5150-notes-on-payments-and-item-descriptions) distinguishes item descriptions from checkout notes. It states that library descriptions appear on digital receipts but not printed receipts; notes have configurable customer visibility and cannot be added after payment processing. This is a useful warning: a field's presence in an app does not guarantee its appearance on paper.

[Refunds](https://api.squareup.com/help/us/en/article/6116-process-refunds) begin in transaction history, support amount-based and itemized refunds, and require refund permissions. Transactions can be searched using customer/payment details.

Design inference: keep amount entry fast, make purpose explicitly customer-facing, and put corrections/refunds against the original transaction. Square's older Virtual Terminal guide has an account-creation-date limitation, so it is not used as the primary universal screen reference here.

### SumUp

[Cash checkout](https://help.sumup.com/en-IE/articles/1E2zC3CW5Khl6iMkKtpkIX-accepting-cash-payments?prc=29) separates Amount and Items, then Charge → Cash → cash received/change → confirmation → receipt. Email/SMS contact entry happens at the receipt step; this is not proof of a complete customer profile before checkout.

[Published Android screen examples](https://www.sumup.com/fr-be/business-guide/android-redesign/) emphasize amount entry, bottom navigation and a prominent transaction result. These are historical published references, not a claim about the latest app layout.

[Payment refunds](https://help.sumup.com/en-US/articles/3IXN9yTldqaeEMcM0nUTDp-refund-transactions) start from Sales → transaction detail → refund amount → confirmation; full/partial refunds are documented for that product. A [separate UK POS guide](https://help.sumup.com/en-GB/pos/articles/75000116740-issue-a-refund) documents different limitations, including externally processed card refunds. Edition-specific distinctions matter.

Design inference: separate payment success from receipt delivery, allow receipt retries from history, and distinguish recording an external refund from actually sending money back.

### Zoho Invoice

[Recording payments](https://www.zoho.com/in/invoice/help/invoice/payments-received.html) captures amount received, payment date, payment mode, reference and notes, with optional attachments. Payments can be manually recorded for cash/transfers or collected through configured gateways. Partial payments update invoice balance/status.

[Consultant product examples](https://www.zoho.com/us/invoice/invoicing-software-for-consultants/) show customer information, receivables, payment reminders and advance payment support, with an official Record Payment screen reference. [Receipt printing](https://www.zoho.com/ca/invoice/kb/payments/print-payment.html) is available from Payments Received.

Design inference: when a service is paid in stages, preserve a bill and separate payment entries. Customer contact details, receipt delivery addresses and outstanding balances are related but different data.

### PayPal Invoicing

[Invoice lifecycle documentation](https://developer.paypal.com/invoicing/object/) distinguishes draft, unpaid, partially paid and paid states. Partial payments can have a minimum amount. [Merchant guidance](https://www.paypal.com/au/brc/article/sending-a-quick-invoice) describes multiple payments against the same invoice and payment receipts.

Design inference: two payment methods at one checkout and several payments on different dates are different workflows. Do not represent instalments as repeated unrelated service receipts without a parent bill.

### Paystack

[Payment Pages](https://support.paystack.com/en/articles/2132546) distinguish one-time, subscription and product pages. A one-time page has a description, fixed/open amount, and optional mandatory phone collection. The [API](https://paystack.com/docs/api/page/) also exposes custom fields.

[Transaction history](https://support.paystack.com/en/articles/2130050) distinguishes status, amount, reference, payment channel, fees and payment time. [Server verification](https://paystack.com/docs/payments/verify-payments/) distinguishes API-call success from transaction success, and documents pending/failed/abandoned outcomes.

Design inference: remote payment requests must link back to the business record and be verified before issuing a paid receipt. Saving a request or receiving an HTTP success response is not proof of collected money.

## Proposed Stockroom screens

1. **New service payment:** payment purpose first, customer name/phone or existing-customer search, amount, optional service category, and optional customer-visible reference. Saved service choices may prefill purpose/amount without creating stock products.
2. **Payment:** choose cash, externally confirmed transfer/terminal, or an implemented connected payment method. Show only fields needed for that method. Use Record payment for externally received money and a collection action for integrated payments.
3. **Result and receipt:** clear status, amount, customer and purpose; then Print, Download, Share and New payment. Never rerun collection because printing failed.
4. **History:** search receipt/customer/phone/purpose/reference, filter date/method/status/staff, inspect original transaction, reprint and refund with permissions.
5. **Customers:** linked payment history and optional contact information. Preserve customer details used on each receipt even if the profile changes later.
6. **Reports:** distinguish product sales and service payments; separate charges, money received, refunds and outstanding balances if bills are enabled. Do not count a bill total and each payment as separate revenue. Display gross payment and fees separately where integration provides them.

Owner setup: Product sales, Service payments, or Both. Both exposes separate entry points and common customer/payment infrastructure. Service-only setup must work with an empty product catalogue.

## Required design decisions

- One-time full payments only, or bill-linked partial payments too? Default simple full payment; show balance fields only when partial-payment support is enabled and implemented.
- Are name and phone mandatory, optional, or owner-configurable? A walk-in option avoids forcing invented contact information, while identified clients can retain history. Receipt messaging requires the appropriate contact/delivery channel.
- Is each method manually recorded or integrated? Persist this distinction and do not label manual confirmation as provider verification.
- Which receipt fields are public? Purpose must appear on both printed and digital receipts; internal notes need their own field.
- Which actions can staff perform? Taking payments, refunds, backdated entries and corrections need explicit rules.
- What does a refund do to a partially paid bill? Define whether charges remain due, are cancelled or are reduced; do not guess from a money reversal.
- Which receipt sharing methods are available today? Opening a messaging app is different from automated delivery; distinguish saved, printed and delivered states.

## Backend boundaries and acceptance checks

Use explicit service charges/payments and stable identifiers, without fake stock products or product quantity requirements. Reuse existing customer, payment validation, printing, staff and sync infrastructure where appropriate. Add module/entity compatibility before exposing new synced record types.

Keep charges, collection attempts, confirmed payments and refunds distinct. Preserve receipt snapshots and append corrections/refunds with reasons. Keep the payment result separate from synchronization status and receipt-delivery status.

Verify at minimum:

- A service-only business with zero products can record an identified customer's payment and print its purpose/name/phone/amount correctly.
- Service payment and refund leave inventory, movements and batches unchanged.
- A restart preserves the payment and receipt; print/share failure never repeats payment collection.
- Repeated submissions, network retries and provider callbacks do not duplicate payments.
- Unconfirmed connected payments cannot produce a paid receipt; offline manual records remain distinguishable from verified collections.
- Product and service workflows coexist with separately filterable history and correct combined totals.
- If enabled, several payments settle one bill correctly and refunds have a defined effect on its remaining balance.
- Older clients do not acknowledge unsupported service events as successfully applied.

A non-stock payment module is a credible cross-sector capability. It does not by itself implement salon appointments, restaurant preparation, hotel reservations or service-job completion.
