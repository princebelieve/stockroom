package com.stockroom.business;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class StockroomFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "stockroom-business-alerts";
    private static final String WEB_ORIGIN = "https://stockroom.globalcreest.com";

    @Override public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String title = safeText(data.get("title"), "Stockroom alert", 100);
        String body = safeText(data.get("body"), "There is a new business update.", 300);
        String id = safeText(data.get("id"), String.valueOf(System.currentTimeMillis()), 120);
        String path = data.get("url");
        Uri destination = safeDestination(path);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (!StockroomNotificationDeduplicator.markIfNew(this, id)) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Stockroom business alerts", NotificationManager.IMPORTANCE_DEFAULT));

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent openApp = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent appPending = PendingIntent.getActivity(this, id.hashCode(), openApp, pendingFlags);
        Intent openBrowser = new Intent(Intent.ACTION_VIEW, destination).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent browserPending = PendingIntent.getActivity(this, id.hashCode() ^ 0x51A7, openBrowser, pendingFlags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(appPending).addAction(android.R.drawable.ic_menu_view, "Open in browser", browserPending);
        manager.notify(id, id.hashCode(), builder.build());
    }

    private static String safeText(String input, String fallback, int max) {
        if (input == null || input.trim().isEmpty()) return fallback;
        return input.length() > max ? input.substring(0, max) : input;
    }

    private static Uri safeDestination(String path) {
        try {
            Uri uri = Uri.parse(path != null && path.startsWith("/") ? WEB_ORIGIN + path : path);
            if ("https".equalsIgnoreCase(uri.getScheme()) && "stockroom.globalcreest.com".equalsIgnoreCase(uri.getHost())) return uri;
        } catch (Exception ignored) {}
        return Uri.parse(WEB_ORIGIN + "/");
    }
}
