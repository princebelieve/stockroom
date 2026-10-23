package com.stockroom.business;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StockroomAppLinks")
public class StockroomAppLinksPlugin extends Plugin {
    @PluginMethod
    public void getLaunchUrl(PluginCall call) {
        Intent intent = getActivity().getIntent();
        Uri data = intent == null ? null : intent.getData();
        JSObject result = new JSObject();
        if (data != null) result.put("url", data.toString());
        call.resolve(result);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        Uri data = intent == null ? null : intent.getData();
        if (data == null) return;
        JSObject event = new JSObject();
        event.put("url", data.toString());
        notifyListeners("appUrlOpen", event);
    }
}
