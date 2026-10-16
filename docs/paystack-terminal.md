# Connect a business Paystack account

Each business connects its own Paystack account inside Stockroom. Business owners no longer need to send their secret key to the Stockroom operator for manual entry in Render.

## One-time cloud setup

Set `PAYSTACK_CREDENTIALS_ENCRYPTION_KEY` in the Stockroom cloud service to a privately stored, base64-encoded 32-byte random key. Generate it with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

This is one Stockroom encryption key for all tenant records. It is not a Paystack key. Back it up securely: encrypted credentials cannot be recovered if it is lost. Do not rotate it without first decrypting and re-encrypting saved merchant keys.

## Business owner setup

1. Sign in to Stockroom as the business owner.
2. Open **Business settings → Paystack and guest email**.
3. In the business’s Paystack dashboard, copy its secret key and paste it into **Paystack secret key**. Use a test key while testing and a live key for real payments.
4. For hosted hotel or nightlife invoice payments, leave the terminal fields blank. For a physical Paystack POS terminal, also enter its **Terminal ID** and the account’s walk-in **Customer code**.
5. Enter the owner password and choose **Connect Paystack**.

Stockroom validates the key with Paystack, then encrypts it on the server before storing it under that business ID. The key is never returned to the browser after saving. Re-enter a replacement key to rotate it. Disconnecting removes the stored key and disables that business’s Paystack connection.

The cloud service needs outbound HTTPS access to Paystack. Hosted checkout and the physical terminal continue to use the business’s own Paystack integration, so settlements go to that merchant account. The existing `PAYSTACK_SECRET_KEY` is for Stockroom subscriptions and platform functions; it is separate.

## Existing Render configuration

`POS_PAYSTACK_CONFIG_JSON` is retained as a temporary migration fallback for businesses configured before owner-managed connections existed. Owners should reconnect from Stockroom. After every affected business has reconnected and confirmed hosted payments and any terminal, remove `POS_PAYSTACK_CONFIG_JSON` from Render. New businesses must connect themselves in Stockroom and should not be added to the legacy JSON setting.

## Payment confirmation

Hosted invoice checkout is initialized on the server, and Stockroom verifies the Paystack transaction before adding a payment to the invoice. Configure this webhook URL in each participating business’s Paystack dashboard, replacing the hostname with the deployed cloud API host:

```text
https://YOUR-API-HOST/v1/customer-portal/hospitality/paystack-webhook
```

The webhook signature and transaction are verified using that business’s connected key. For terminal sales, Stockroom checks terminal presence and verifies the invoice amount and currency before enabling **Complete sale**. Cash checkout remains available independently.
