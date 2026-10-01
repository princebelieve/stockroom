package com.stockroom.business;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

final class StockroomNotificationDeduplicator {
    private static final String STORE = "stockroom-delivered-notifications";
    private static final long RETAIN_MS = 7L * 24 * 60 * 60 * 1000;

    private StockroomNotificationDeduplicator() {}

    static synchronized boolean markIfNew(Context context, String notificationId) {
        SharedPreferences preferences = context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        String key = "id:" + notificationId;
        if (preferences.contains(key)) return false;
        long now = System.currentTimeMillis();
        SharedPreferences.Editor editor = preferences.edit().putLong(key, now);
        for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
            if (entry.getKey().startsWith("id:") && entry.getValue() instanceof Long && now - (Long) entry.getValue() > RETAIN_MS) {
                editor.remove(entry.getKey());
            }
        }
        editor.apply();
        return true;
    }
}
