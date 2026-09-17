# Payment terminal configuration

Owners set the shared default provider in Business settings. Owners and admins can
save a terminal profile for the current business on each checkout device:
provider override, model, terminal ID/serial number, planned transport, and optional
network host/port. These local assignments do not sync to other computers.

No payment adapters are implemented yet. Saving a profile never connects a device.
The connection-test button remains disabled. Checkout requires manual confirmation;
if a planned integration is selected and manual fallback is disabled, external-POS
checkout is blocked. Cash and other existing payment methods are unaffected.

## OPay onboarding

For physical POS, follow OPay's business/POS documentation:

1. Establish an OPay Business account and complete the required KYC.
2. Ask the OPay sales/integration team to enable the appropriate POS endpoints and
   confirm testing access, supported terminals, and required integration values.
3. A Superadmin uses the Business Dashboard's Integration / Developer Tools page
   to configure API keys, webhooks and IP allowlisting.
4. The documented POS API uses a clientAuthKey and RSA keys. Confirm the key
   exchange procedure with OPay. OPay's public key and your merchant private key
   have different roles; share only the merchant public key for registration.
5. Obtain the business ID, branch ID, terminal serial number and OPay-assigned
   subSceneEnum, and complete joint testing before live operation.

Sources (checked September 17, 2026):
- https://documentation.opayweb.com/doc/offline/overview.html
- https://documentation.opayweb.com/doc/offline/api-basics.html
- https://documentation.opayweb.com/doc/offline/authentication.html
- https://documentation.opayweb.com/doc/offline/pos-api.html

OPay Checkout has a separate API-key flow under API Keys & Webhooks. Do not assume
its public/secret keys work with the business POS API:
https://documentation.opaycheckout.com/payment-authentication

## Credential storage design

Credential provisioning is not implemented in this update. Do not paste secrets
into terminal profile fields; they are ordinary device settings, not a vault.

For a future OPay adapter, store the merchant private key and clientAuthKey in a
server-side secret manager, scoped to the business. For a single-business backend,
protected deployment secrets/environment variables are another option. An app
serving multiple businesses needs separate secrets for each business, selected
using the authenticated business identity. Never use one shop's credentials for
another shop.

Do not put credentials in React source, VITE_* variables, .env.pwa, localStorage,
ordinary synced settings, Git, or the installer. A local .env file being ignored
by Git does not itself load it or encrypt it. The current app has no OPay secret
loader, payment endpoints, or webhook receiver; adding environment variables alone
will not enable payments.

The future backend must sign requests, verify responses and webhook signatures,
and reconcile payment status before recording automatic approval. Its public
HTTPS webhook URL must be configured in OPay's POS & Others section.
