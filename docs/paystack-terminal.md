# Paystack Terminal setup

The cashier adds items, chooses **Payment terminal**, enables **Use connected Paystack terminal**, and presses **Send amount to Paystack terminal**. The customer pays on the terminal. The app checks Paystack and enables **Complete sale** after the payment amount and currency match. No card details are entered into Stockroom.

## What the shop needs

1. A Paystack merchant account for the shop. Complete Paystack's activation process and obtain a Paystack Terminal linked to that account. An OPay, PalmPay, or Moniepoint terminal cannot be connected with Paystack credentials.
2. The shop's **secret API key**, available in the Paystack dashboard under **Settings → API Keys & Webhooks**. Use test credentials for development and live credentials only for the activated shop.
3. The **terminal ID** belonging to that account. Obtain it from the dashboard or the authenticated `GET https://api.paystack.co/terminal` endpoint. Ask Paystack support if terminal access has not been enabled for the account.
4. A **customer code** (`CUS_...`) for a walk-in customer record created in that account, using Paystack's Customers API or dashboard. This is an invoice prerequisite; the optional customer selected in Stockroom remains separate.

Keep the secret key on the cloud server. Do not paste it into the app, source code, browser settings, or chat.

## Server configuration

Set `POS_PAYSTACK_CONFIG_JSON` in the cloud service's environment, then restart the service. Replace every placeholder:

```json
{
  "YOUR_STOCKROOM_BUSINESS_ID": {
    "secretKey": "sk_test_REPLACE_ON_SERVER",
    "terminalId": "YOUR_PAYSTACK_TERMINAL_ID",
    "customerCode": "CUS_YOUR_WALK_IN_CUSTOMER"
  }
}
```

Each business has its own entry and Paystack account. This configuration currently selects one terminal per business. The existing `PAYSTACK_SECRET_KEY` handles Stockroom subscriptions; POS payments use the separate configuration above so money goes to the shop's account.

The cashier's device must already be enrolled with Stockroom's cloud service. Both the app's cloud connection and terminal must be available for integrated payments. Cash checkout remains available offline.

## Payment interruptions and refunds

The app stores the order's invoice before sending it to the terminal. Repeated requests for the same order reuse that invoice. A sent request or delivered event does not mean the customer paid. The app polls Paystack's verification endpoint and checks payment again when saving the sale.

If the connection fails, use **Check payment status** before asking the customer to pay again. Keep the basket unchanged while its payment is unresolved. If invoice creation is marked uncertain, reconcile it in the Paystack dashboard with the server operator before taking a replacement payment; automatic cancellation and uncertain-request recovery are not implemented.

This integration does not issue automatic Paystack refunds. For an external refund, complete it through the provider, then record the returned items and refund reference in **POS tools**. Ordinary basket quantity changes remain ordinary edits to an unpaid basket.

## Verification before use

Automated checks use simulated Paystack responses. Real end-to-end operation requires your account, credentials, and terminal. Test a payment, a declined payment, an interrupted connection, and receipt saving with Paystack's supported terminal testing setup before switching to live mode.

Official references: [Push payment requests](https://paystack.com/docs/terminal/push-payment-requests/), [Terminal API](https://paystack.com/docs/api/terminal/), [Payment Requests API](https://paystack.com/docs/api/payment-request/), [API keys and webhooks](https://support.paystack.com/en/articles/2123458).
