package com.stockroom.business;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.os.Handler;
import android.os.Looper;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "StockroomPrinting")
public class StockroomPrintingPlugin extends Plugin {
    private WebView printView;
    private PluginCall pendingPrint;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable loadTimeout;
    private final ExecutorService commands = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();

    @PluginMethod public void print(PluginCall call) {
        String html = call.getString("html", "");
        String kind = call.getString("kind", "");
        int width = call.getInt("width", 80);
        if (html.isEmpty() || html.length() > 2000000 || !(kind.equals("receipt") || kind.equals("report")) || (width != 58 && width != 80)) {
            call.reject("Invalid print document."); return;
        }
        getActivity().runOnUiThread(() -> {
            if (printView != null) { call.reject("A print dialog is already open."); return; }
            pendingPrint = call;
            printView = new WebView(getContext());
            printView.getSettings().setJavaScriptEnabled(false);
            printView.getSettings().setBlockNetworkLoads(true);
            printView.getSettings().setAllowFileAccess(false);
            printView.getSettings().setAllowContentAccess(false);
            printView.setWebViewClient(new WebViewClient() {
                private boolean started;
                @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame() && view == printView) {
                        call.reject("Could not render the print document: " + error.getDescription());
                        releasePrintView();
                    }
                }
                @Override public void onPageFinished(WebView view, String url) {
                    if (started || view != printView) return;
                    started = true;
                    if (loadTimeout != null) mainHandler.removeCallbacks(loadTimeout);
                    try {
                        PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        if (manager == null) throw new IllegalStateException("Android print service is unavailable.");
                        PrintDocumentAdapter delegate = view.createPrintDocumentAdapter("Stockroom " + kind);
                        PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                            @Override public void onStart() { delegate.onStart(); }
                            @Override public void onLayout(PrintAttributes oldAttrs, PrintAttributes newAttrs, CancellationSignal signal, LayoutResultCallback callback, Bundle extras) {
                                delegate.onLayout(oldAttrs, newAttrs, signal, callback, extras);
                            }
                            @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal signal, WriteResultCallback callback) {
                                delegate.onWrite(pages, destination, signal, callback);
                            }
                            @Override public void onFinish() {
                                delegate.onFinish();
                                // Finishing means the system dialog is done, not that paper was printed.
                                if (pendingPrint != null) pendingPrint.resolve();
                                releasePrintView();
                            }
                        };
                        PrintAttributes.MediaSize size = kind.equals("report") ? PrintAttributes.MediaSize.ISO_A4 :
                            new PrintAttributes.MediaSize("receipt", width + " mm receipt", Math.round(width / 25.4f * 1000), 11000);
                        manager.print("Stockroom " + kind, adapter, new PrintAttributes.Builder().setMediaSize(size).setMinMargins(PrintAttributes.Margins.NO_MARGINS).build());
                    } catch (Exception error) { call.reject("Could not open printing: " + error.getMessage()); releasePrintView(); }
                }
            });
            loadTimeout = () -> {
                if (pendingPrint == call) {
                    call.reject("Print document rendering timed out. Please try again.");
                    releasePrintView();
                }
            };
            mainHandler.postDelayed(loadTimeout, 15000);
            printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    @PluginMethod public void control(PluginCall call) {
        String host = call.getString("host", "");
        int port = call.getInt("port", 0);
        String action = call.getString("action", "");
        int pin = call.getInt("pin", -1);
        String cut = call.getString("cut", "");
        final byte[] bytes;
        if (!host.matches("[a-zA-Z0-9.-]{1,253}") || port < 1 || port > 65535) { call.reject("Invalid printer hostname/IP or port."); return; }
        if (action.equals("drawer") && (pin == 0 || pin == 1)) bytes = new byte[]{27, 112, (byte) pin, 25, (byte) 250};
        else if (action.equals("cut") && (cut.equals("full") || cut.equals("partial"))) bytes = new byte[]{10, 29, 86, (byte)(cut.equals("full") ? 65 : 66), 0};
        else { call.reject("Invalid hardware command."); return; }
        commands.execute(() -> {
            try (Socket socket = new Socket()) {
                var timeout = deadlines.schedule(() -> { try { socket.close(); } catch (Exception ignored) {} }, 5, TimeUnit.SECONDS);
                try {
                    socket.connect(new InetSocketAddress(host, port), 5000);
                    socket.getOutputStream().write(bytes);
                    socket.getOutputStream().flush();
                    call.resolve();
                } finally { timeout.cancel(false); }
            } catch (Exception error) { call.reject("Printer command failed. Check the device before retrying: " + error.getMessage()); }
        });
    }

    private void releasePrintView() {
        if (loadTimeout != null) { mainHandler.removeCallbacks(loadTimeout); loadTimeout = null; }
        pendingPrint = null;
        if (printView != null) { printView.destroy(); printView = null; }
    }
    @Override protected void handleOnDestroy() {
        if (pendingPrint != null) pendingPrint.reject("Printing interrupted because the app closed.");
        releasePrintView();
        commands.shutdownNow();
        deadlines.shutdownNow();
    }
}
