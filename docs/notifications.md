# Stockroom notifications

The app notification inbox is account-specific and is available in the main app and visitor promoter portal. Current server-generated alerts cover verified subscription payments, renewal/grace-period reminders, earned referral rewards, and payout request/status changes. Notifications are stored in MongoDB and remain visible in the in-app inbox even when browser push is not configured.

VAPID browser push is optional. It works in supported browsers and installed PWAs. The Windows installer and APK currently show the in-app inbox; they do not register native Windows or Firebase Cloud Messaging push. The public landing page does not show a personal notification bell because it has no signed-in account context.

## Configure VAPID on Render

Generate a key pair locally with `npm run vapid:keys`. Add the printed values as Render secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (an HTTPS support page or `mailto:` address)

Keep `VAPID_PRIVATE_KEY` private. The public key is returned to signed-in users by `/v1/notifications/me`. After the cloud service is deployed with these values, users can open the bell and select **Enable push alerts**. The PWA asks for browser permission from that button and sends its Push API subscription to the cloud service.

The cloud API sends RFC 8291 encrypted Web Push payloads directly to the browser push endpoint and signs requests with VAPID. Expired endpoints are removed when the push provider returns 404 or 410. Push delivery requires a network connection and browser permission. Offline work continues normally; pending inbox items load when the device reconnects.
