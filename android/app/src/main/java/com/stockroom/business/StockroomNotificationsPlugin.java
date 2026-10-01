package com.stockroom.business;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.net.Uri;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "StockroomNotifications", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class StockroomNotificationsPlugin extends Plugin {
    private static final String CHANNEL_ID = "stockroom-business-alerts";

    @PluginMethod public void getPushToken(PluginCall call) {
        try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(true);
            messaging.getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) { messaging.setAutoInitEnabled(false); call.reject("Could not register this device for push notifications.", task.getException()); return; }
                call.resolve(new com.getcapacitor.JSObject().put("token", task.getResult()));
            });
        } catch (Exception error) { call.reject("Firebase Cloud Messaging is not configured for this Android build.", error); }
    }

    @PluginMethod public void disablePush(PluginCall call) {
        try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(false);
            messaging.deleteToken().addOnCompleteListener(task -> {
                if (task.isSuccessful()) call.resolve(new com.getcapacitor.JSObject().put("disabled", true));
                else call.reject("Android push was turned off here, but its Firebase token could not be cleared yet.", task.getException());
            });
        } catch (Exception error) { call.reject("Could not disable Android push registration.", error); }
    }

    @PluginMethod public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            call.resolve(new com.getcapacitor.JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionResult");
    }

    @PermissionCallback private void permissionResult(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        call.resolve(new com.getcapacitor.JSObject().put("granted", granted));
    }

    @PluginMethod public void show(PluginCall call) {
        String title = call.getString("title", "Stockroom alert");
        String body = call.getString("body", "There is a new business update.");
        String id = call.getString("id", String.valueOf(System.currentTimeMillis()));
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.resolve(new com.getcapacitor.JSObject().put("shown", false));
            return;
        }
        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) { call.resolve(new com.getcapacitor.JSObject().put("shown", false)); return; }
        if (!StockroomNotificationDeduplicator.markIfNew(context, id)) { call.resolve(new com.getcapacitor.JSObject().put("shown", false)); return; }
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Stockroom business alerts", NotificationManager.IMPORTANCE_DEFAULT));
        String url = call.getString("url", "https://stockroom.globalcreest.com/");
        Uri destination = safeDestination(url);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent openApp = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent appPending = PendingIntent.getActivity(context, id.hashCode(), openApp, pendingFlags);
        Intent openBrowser = new Intent(Intent.ACTION_VIEW, destination).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent browserPending = PendingIntent.getActivity(context, id.hashCode() ^ 0x51A7, openBrowser, pendingFlags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(appPending).addAction(android.R.drawable.ic_menu_view, "Open in browser", browserPending);
        manager.notify(id, id.hashCode(), builder.build());
        call.resolve(new com.getcapacitor.JSObject().put("shown", true));
    }

    private static Uri safeDestination(String path) {
        try {
            Uri uri = Uri.parse(path != null && path.startsWith("/") ? "https://stockroom.globalcreest.com" + path : path);
            if ("https".equalsIgnoreCase(uri.getScheme()) && "stockroom.globalcreest.com".equalsIgnoreCase(uri.getHost())) return uri;
        } catch (Exception ignored) {}
        return Uri.parse("https://stockroom.globalcreest.com/");
    }
}
