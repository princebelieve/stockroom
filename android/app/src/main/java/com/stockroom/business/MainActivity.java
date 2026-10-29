package com.stockroom.business;

import com.getcapacitor.BridgeActivity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

public class MainActivity extends BridgeActivity {
    private static final int PLAY_UPDATE_REQUEST = 7319;
    private static final long UPDATE_PROMPT_INTERVAL_MS = 24L * 60 * 60 * 1000;
    private static final String UPDATE_PREFERENCES = "stockroom_play_updates";
    private AppUpdateManager appUpdateManager;
    private boolean updateFlowStarted;
    private boolean updateReadyDialogVisible;

    private final InstallStateUpdatedListener updateListener = state -> {
        if (state.installStatus() == InstallStatus.DOWNLOADED) {
            runOnUiThread(this::showUpdateReadyDialog);
        }
    };

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StockroomPrintingPlugin.class);
        registerPlugin(StockroomNotificationsPlugin.class);
        registerPlugin(StockroomBillingPlugin.class);
        registerPlugin(StockroomAppLinksPlugin.class);
        registerPlugin(StockroomSharePlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
        if (BuildConfig.PLAY_STORE_BUILD) {
            appUpdateManager = AppUpdateManagerFactory.create(this);
            appUpdateManager.registerListener(updateListener);
        }
    }

    @Override public void onResume() {
        super.onResume();
        if (!BuildConfig.PLAY_STORE_BUILD || appUpdateManager == null) return;
        appUpdateManager.getAppUpdateInfo().addOnSuccessListener(this::handleUpdateInfo);
    }

    private void handleUpdateInfo(AppUpdateInfo info) {
        if (info.installStatus() == InstallStatus.DOWNLOADED) {
            showUpdateReadyDialog();
            return;
        }
        int availability = info.updateAvailability();
        if (availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
            startFlexibleUpdate(info);
            return;
        }
        if (availability != UpdateAvailability.UPDATE_AVAILABLE
                || !info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
                || updatePromptWasRecent()) return;

        if (startFlexibleUpdate(info)) {
            getSharedPreferences(UPDATE_PREFERENCES, MODE_PRIVATE).edit()
                    .putLong("last_prompt_at", System.currentTimeMillis()).apply();
        }
    }

    private boolean updatePromptWasRecent() {
        long lastPrompt = getSharedPreferences(UPDATE_PREFERENCES, MODE_PRIVATE)
                .getLong("last_prompt_at", 0L);
        return System.currentTimeMillis() - lastPrompt < UPDATE_PROMPT_INTERVAL_MS;
    }

    private boolean startFlexibleUpdate(AppUpdateInfo info) {
        if (updateFlowStarted || isFinishing()) return false;
        updateFlowStarted = true;
        try {
            boolean started = appUpdateManager.startUpdateFlowForResult(
                    info,
                    this,
                    AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
                    PLAY_UPDATE_REQUEST);
            if (!started) updateFlowStarted = false;
            return started;
        } catch (Exception ignored) {
            updateFlowStarted = false;
            return false;
        }
    }

    private void showUpdateReadyDialog() {
        if (updateReadyDialogVisible || isFinishing() || isDestroyed()) return;
        updateReadyDialogVisible = true;
        new AlertDialog.Builder(this)
                .setTitle("Update ready to install")
                .setMessage("Stockroom has downloaded an update. Restart now to finish installing it?")
                .setPositiveButton("Restart and install", (dialog, which) -> appUpdateManager.completeUpdate())
                .setNegativeButton("Later", (dialog, which) -> { })
                .setOnDismissListener(dialog -> updateReadyDialogVisible = false)
                .show();
    }

    @Override public void onDestroy() {
        if (appUpdateManager != null) appUpdateManager.unregisterListener(updateListener);
        super.onDestroy();
    }

    @Override protected void onNewIntent(android.content.Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
