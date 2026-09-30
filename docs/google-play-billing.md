# Google Play subscription backend

The Render cloud API now has server-side endpoints for validating Play subscriptions and processing Google Play Real-time Developer Notifications (RTDN). Google Play support is disabled unless its Render environment variables are configured. Paystack remains the current subscription checkout until the Android Billing client is added and tested.

## Render configuration

Set these secrets/configuration values on the cloud API service:

- `GOOGLE_PLAY_PACKAGE_NAME`: `com.stockroom.business`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: service-account JSON with Google Play Developer API access to this app
- Set the monthly, yearly, and optional enterprise product IDs in Developer Control Centre → Plan settings. The optional `GOOGLE_PLAY_PRODUCT_IDS` Render variable can override those IDs as JSON.
- `GOOGLE_PLAY_RTDN_AUDIENCE`: exact HTTPS audience configured for authenticated Pub/Sub push
- `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`: email identity attached to that Pub/Sub push's OIDC token

The Play Console service account needs access to the app and permission to view and manage orders/subscriptions. Enable the Google Play Android Developer API for its Google Cloud project. Store the service-account JSON only as a Render secret; do not put it in source control or the Android app.

Configure a Pub/Sub topic for Play RTDN, then configure its push subscription to call `https://<cloud-api-host>/v1/play/rtdn` with an OIDC service account and the same audience configured above. The API checks that token with Google before accepting the notification, then queries Google Play for the current subscription state rather than trusting notification contents.

## API and purchase binding

- `GET /v1/play/subscriptions/config` (signed-in business owner) returns configured product IDs and the account-binding value the Android billing client must pass as its obfuscated account ID.
- `POST /v1/play/subscriptions/verify` accepts `{ "purchaseToken": "..." }` for a signed-in owner. The server verifies it through the Google Play Developer API, confirms the app, product, active state, and account binding, acknowledges an unacknowledged purchase, and saves the verified entitlement.
- `POST /v1/play/rtdn` receives authenticated Pub/Sub notifications. It fetches the current subscription state from Google and updates the stored Play entitlement, including expiry and cancellation/expiry status.

The purchase token is hashed for the database mapping; the raw token is sent to Google for verification but is not saved. An account-bound purchase cannot be claimed by another Stockroom business.

## Still needed before Android Play checkout is usable

The Android AAB does not yet launch Google Play Billing, pass the returned obfuscated account ID, submit purchase tokens, restore purchases, or show/manage Play products. The Android subscription screen also still uses the existing direct checkout. Add and test that client flow before publishing; then hide direct Paystack checkout in the Play-distributed build while retaining it on web and Windows. Configure the Data safety form and update the Privacy Policy and Terms before collecting Play purchase data.
