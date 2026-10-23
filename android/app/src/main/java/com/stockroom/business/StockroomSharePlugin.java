package com.stockroom.business;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "StockroomShare")
public class StockroomSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "Share Stockroom");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String content = text.isEmpty() ? url : (url.isEmpty() ? text : text + "\n" + url);
        if (content.trim().isEmpty()) {
            call.reject("There is no link to share.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TEXT, content);
        getActivity().startActivity(Intent.createChooser(intent, title));
        call.resolve();
    }
}
