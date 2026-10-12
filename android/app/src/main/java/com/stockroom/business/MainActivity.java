package com.stockroom.business;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StockroomPrintingPlugin.class);
        registerPlugin(StockroomNotificationsPlugin.class);
        registerPlugin(StockroomBillingPlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }
}
