package com.stockroom.business;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StockroomPrintingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
