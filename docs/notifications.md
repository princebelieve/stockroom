# Stockroom notifications

The app notification inbox is account-specific and is available in the main app and visitor promoter portal. Current server-generated alerts cover verified subscription payments, renewal/grace-period reminders, earned referral rewards, payout request/status changes, low stock, out of stock, restocking above the reorder point, unusually large stock reductions, and significant stocktake shortages. Inventory alerts use each product's reorder point and branch. They are generated when changes reach cloud sync, so offline activity alerts appear after reconnection and sync. Notifications are stored in MongoDB and remain visible in the in-app inbox even when browser push is not configured.

VAPID browser push is optional. It works in supported browsers and installed PWAs. The APK and Windows installer can show operating-system notifications. Enable **Device notifications** from the bell menu on each device. Android asks for notification permission; tapping an Android notification opens Stockroom, with a separate **Open in browser** action for users who prefer that. Windows uses Electron's native notification service and checks the signed-in notification inbox while the installer is running. Windows notifications do not arrive after the installer is fully closed, and clicking one opens the relevant screen inside the installer. The APK uses Firebase Cloud Messaging (FCM) for remote Android alerts. The app uses Firebase only for Android message delivery, not Firebase Authentication, Analytics, or database storage. The public landing page does not show a personal notification bell because it has no signed-in account context.

## Configure VAPID on Render

Generate a key pair locally with `npm run vapid:keys`. Add the printed values as Render secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (an HTTPS support page or `mailto:` address)

Keep `VAPID_PRIVATE_KEY` private. The public key is returned to signed-in users by `/v1/notifications/me`. After the cloud service is deployed with these values, users can open the bell and select **Enable push alerts**. The PWA asks for browser permission from that button and sends its Push API subscription to the cloud service.

The cloud API sends RFC 8291 encrypted Web Push payloads directly to the browser push endpoint and signs requests with VAPID. Expired endpoints are removed when the push provider returns 404 or 410. Push delivery requires a network connection and browser permission. Offline work continues normally; pending inbox items load when the device reconnects.

## Configure Firebase Cloud Messaging for Android

In Firebase Console, create or select a project and register an Android app with package name `com.stockroom.business`. Download its `google-services.json` into `android/app/google-services.json`. Keep that local build configuration out of Git. The APK/AAB keeps FCM auto-initialization disabled until a user enables device notifications. In the linked Google Cloud project, enable the Firebase Cloud Messaging API and create a service account with the **Firebase Cloud Messaging API Admin** role. Add these Render environment secrets to the cloud service:

- `FCM_PROJECT_ID` (Firebase project ID)
- `FCM_CLIENT_EMAIL` (service account email)
- `FCM_PRIVATE_KEY` (service account private key; multiline or escaped `\\n` is accepted)

Do not commit the service-account JSON or private key. After deploying the cloud service, rebuild/install the APK or AAB with the existing Android release command. Sign in, grant notification permission, and enable **Device notifications**; the app then registers its FCM token with the signed-in account. Turning the setting off removes the server token and disables FCM auto-initialization on that install. Both the FCM service and local inbox fallback share a notification ID deduplication store, so the same alert is not displayed twice on one Android install. FCM can hold queued messages while the device is offline, then attempt delivery after it reconnects; the configured message lifetime is one hour, after which an undelivered push expires. New cloud-generated alerts require a connection. The current in-app inbox fetches notices from the cloud and does not keep a durable offline inbox cache, so it cannot show prior notices after a fresh offline launch. Google Play does not add offline notification behavior. Browser/PWA VAPID setup remains independent.
