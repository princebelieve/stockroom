package com.stockroom.business;

import android.app.Activity;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.Purchase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "StockroomBilling")
public class StockroomBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private final Map<String, ProductDetails> products = new HashMap<>();
    private final Map<String, ProductDetails> exportProducts = new HashMap<>();

    private void connect(PluginCall call, Runnable action) {
        if (billingClient == null) {
            billingClient = BillingClient.newBuilder(getContext()).setListener(this).enablePendingPurchases(
                com.android.billingclient.api.PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            ).build();
        }
        if (billingClient.isReady()) { action.run(); return; }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run();
                else call.reject("Google Play Billing is unavailable: " + result.getDebugMessage());
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    @PluginMethod
    public void isPlayStoreBuild(PluginCall call) {
        JSObject result = new JSObject();
        result.put("playStore", BuildConfig.PLAY_STORE_BUILD);
        call.resolve(result);
    }

    @PluginMethod
    public void queryProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds");
        if (ids == null || ids.length() == 0) { call.reject("No Google Play subscription products are configured."); return; }
        connect(call, () -> {
            List<QueryProductDetailsParams.Product> requested = new ArrayList<>();
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, "");
                if (!id.isEmpty()) requested.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build());
            }
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(requested).build();
            billingClient.queryProductDetailsAsync(params, (result, query) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Google Play could not load subscription prices: " + result.getDebugMessage()); return; }
                JSArray rows = new JSArray();
                for (ProductDetails detail : query.getProductDetailsList()) {
                    products.put(detail.getProductId(), detail);
                    JSObject row = new JSObject(); row.put("productId", detail.getProductId()); row.put("title", detail.getTitle()); row.put("description", detail.getDescription());
                    JSArray offers = new JSArray();
                    if (detail.getSubscriptionOfferDetails() != null) for (ProductDetails.SubscriptionOfferDetails offer : detail.getSubscriptionOfferDetails()) {
                        JSObject item = new JSObject(); item.put("offerToken", offer.getOfferToken());
                        if (!offer.getPricingPhases().getPricingPhaseList().isEmpty()) {
                            ProductDetails.PricingPhase phase = offer.getPricingPhases().getPricingPhaseList().get(offer.getPricingPhases().getPricingPhaseList().size() - 1);
                            item.put("formattedPrice", phase.getFormattedPrice()); item.put("currencyCode", phase.getPriceCurrencyCode());
                        }
                        offers.put(item);
                    }
                    row.put("offers", offers); rows.put(row);
                }
                JSObject output = new JSObject(); output.put("products", rows); call.resolve(output);
            });
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId", ""), offerToken = call.getString("offerToken", ""), accountId = call.getString("obfuscatedAccountId", "");
        ProductDetails detail = products.get(productId);
        if (detail == null || offerToken.isEmpty() || accountId.isEmpty()) { call.reject("Load the Play subscription price before starting a purchase."); return; }
        Activity activity = getActivity();
        BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail).setOfferToken(offerToken).build();
        BillingFlowParams params = BillingFlowParams.newBuilder().setProductDetailsParamsList(java.util.Collections.singletonList(item)).setObfuscatedAccountId(accountId).build();
        BillingResult result = billingClient.launchBillingFlow(activity, params);
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) { JSObject out = new JSObject(); out.put("launched", true); call.resolve(out); }
        else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) { call.reject("Purchase cancelled.", "PURCHASE_CANCELLED"); }
        else call.reject("Google Play could not start checkout: " + result.getDebugMessage());
    }

    @PluginMethod
    public void queryExportProduct(PluginCall call) {
        String id = call.getString("productId", "");
        if (id.isEmpty()) { call.reject("Google Play export product is not configured."); return; }
        connect(call, () -> {
            QueryProductDetailsParams.Product requested = QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build();
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(java.util.Collections.singletonList(requested)).build();
            billingClient.queryProductDetailsAsync(params, (result, query) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || query.getProductDetailsList().isEmpty()) { call.reject("Google Play could not load the export price."); return; }
                ProductDetails detail = query.getProductDetailsList().get(0); exportProducts.put(id, detail);
                JSArray offers = new JSArray();
                if (detail.getOneTimePurchaseOfferDetailsList() != null) for (ProductDetails.OneTimePurchaseOfferDetails offer : detail.getOneTimePurchaseOfferDetailsList()) {
                    JSObject item = new JSObject(); item.put("offerToken", offer.getOfferToken()); item.put("formattedPrice", offer.getFormattedPrice()); item.put("currencyCode", offer.getPriceCurrencyCode()); offers.put(item);
                }
                JSObject output = new JSObject(); output.put("productId", id); output.put("title", detail.getTitle()); output.put("offers", offers); call.resolve(output);
            });
        });
    }

    @PluginMethod
    public void purchaseExportProduct(PluginCall call) {
        String productId = call.getString("productId", ""), offerToken = call.getString("offerToken", ""), accountId = call.getString("obfuscatedAccountId", "");
        ProductDetails detail = exportProducts.get(productId);
        if (detail == null || offerToken.isEmpty() || accountId.isEmpty()) { call.reject("Load the Google Play export price before purchase."); return; }
        BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail).setOfferToken(offerToken).build();
        BillingFlowParams params = BillingFlowParams.newBuilder().setProductDetailsParamsList(java.util.Collections.singletonList(item)).setObfuscatedAccountId(accountId).build();
        BillingResult result = billingClient.launchBillingFlow(getActivity(), params);
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) { JSObject out = new JSObject(); out.put("launched", true); call.resolve(out); }
        else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) call.reject("Purchase cancelled.", "PURCHASE_CANCELLED");
        else call.reject("Google Play could not start export checkout: " + result.getDebugMessage());
    }

    @PluginMethod
    public void restoreExportPurchases(PluginCall call) {
        connect(call, () -> billingClient.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (result, found) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Google Play could not check prior export payments."); return; }
            JSArray rows = new JSArray(); for (Purchase purchase : found) if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) rows.put(purchaseToJson(purchase));
            JSObject out = new JSObject(); out.put("purchases", rows); call.resolve(out);
        }));
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        connect(call, () -> billingClient.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (result, found) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Google Play could not check existing subscriptions."); return; }
            JSArray rows = new JSArray();
            for (Purchase purchase : found) if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) rows.put(purchaseToJson(purchase));
            JSObject out = new JSObject(); out.put("purchases", rows); call.resolve(out);
        }));
    }

    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> found) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && found != null) {
            for (Purchase purchase : found) if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) notifyListeners("purchaseUpdated", purchaseToJson(purchase));
        } else if (result.getResponseCode() != BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject error = new JSObject(); error.put("message", result.getDebugMessage()); notifyListeners("purchaseError", error);
        }
    }

    private JSObject purchaseToJson(Purchase purchase) {
        JSObject out = new JSObject(); out.put("purchaseToken", purchase.getPurchaseToken()); out.put("products", new JSArray(purchase.getProducts())); out.put("purchaseState", purchase.getPurchaseState()); return out;
    }
}
