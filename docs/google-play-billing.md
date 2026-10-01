# Google Play subscriptions and external checkout

The Android Play Store AAB uses Google Play Billing. The sideload APK, PWA, and Windows installer keep the existing direct Paystack subscription flow. Both payment methods update the same Stockroom business entitlement. Do not publish the direct checkout APK through Google Play.

## Render configuration

Set these secrets/configuration values on the cloud API service:

- `GOOGLE_PLAY_PACKAGE_NAME`: `com.stockroom.business`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: service-account JSON with Google Play Developer API access to this app
- Set the monthly, yearly, and optional enterprise product IDs in Developer Control Centre → Plan settings. The optional `GOOGLE_PLAY_PRODUCT_IDS` Render variable can override those IDs as JSON.
- `GOOGLE_PLAY_RTDN_AUDIENCE`: exact HTTPS audience configured for authenticated Pub/Sub push
- `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`: email identity attached to that Pub/Sub push's OIDC token

The plan IDs configured in Developer Control Centre must correspond to Play Console subscription products and active base plans. Prices displayed inside the Play Store build come from Google Play's localized product details. If the developer-configured product export fee is nonzero, also create a consumable one-time Play product and set its ID in Developer Control Centre. Set its Play Console price to the export fee; the app displays Google's localized price.

The Play Console service account needs access to the app and permission to view and manage orders/subscriptions. Enable the Google Play Android Developer API for its Google Cloud project. Store the service-account JSON only as a Render secret; do not put it in source control or the Android app.

Configure a Pub/Sub topic for Play RTDN, then configure its push subscription to call `https://<cloud-api-host>/v1/play/rtdn` with an OIDC service account and the same audience configured above. The API checks that token with Google before accepting the notification, then queries Google Play for the current subscription state rather than trusting notification contents.

## API and purchase binding

- `GET /v1/play/subscriptions/config` (signed-in business owner) returns configured product IDs and the account-binding value the Android billing client must pass as its obfuscated account ID.
- `POST /v1/play/subscriptions/verify` accepts `{ "purchaseToken": "..." }` for a signed-in owner. The server verifies it through the Google Play Developer API, confirms the app, product, active state, and account binding, acknowledges an unacknowledged purchase, and saves the verified entitlement.
- `POST /v1/play/rtdn` receives authenticated Pub/Sub notifications. It fetches the current subscription state from Google and updates the stored Play entitlement, including expiry and cancellation/expiry status.

The purchase token is hashed for the database mapping; the raw token is sent to Google for verification but is not saved. An account-bound purchase cannot be claimed by another Stockroom business.

## Build outputs

- `npm run android:release` produces a direct-payment sideload APK and a Play Billing AAB as separate Android product flavors.
- `npm run android:bundle` builds only the Play Billing AAB.
- Both commands publish versioned files under `release/android` and refuse to overwrite a file with the same version and version code.
- The Play Billing client queries current products, launches Google's purchase UI with the business account binding, submits purchase tokens for server verification, restores owned purchases, and refreshes the entitlement. The server acknowledges verified purchases and processes authenticated RTDN messages.
- In the Play Store build, the one-time export charge uses Google Play Billing too. The server checks the purchase state and account binding, consumes the verified product so it can be purchased again for another business, then marks that business's export fee paid. Other distributions retain Paystack for this fee.

## Play Console work still required

Code cannot create the Play Console app/products or attest to declarations for the developer. Before production submission:

1. Create and activate each subscription product and base plan. Enter the product IDs in Developer Control Centre.
2. Grant the Render service account Play Console access, set the Render secrets above, and configure the authenticated Pub/Sub RTDN push endpoint.
3. Upload the Play Store AAB to an internal test track. Add license testers and test purchase, cancellation, renewal, restore, and a second Stockroom business account.
4. Complete the Play Console Data safety, privacy policy, account deletion URL, app access, target audience, content rating, and store listing declarations accurately for the shipped app.
5. Confirm that the next `versionCode` is greater than every version already uploaded to Play Console. Configure Play App Signing and retain the upload key securely.
6. If this is a personal developer account created after 13 November 2023, meet the current closed-testing requirement before applying for production access.

The privacy policy and in-app account deletion feature are already present in the repository. The Play Console declarations, account verification, testing track, product setup, and approval remain account-side steps. Play policy and testing requirements can change; check Play Console's current notices before submission.
