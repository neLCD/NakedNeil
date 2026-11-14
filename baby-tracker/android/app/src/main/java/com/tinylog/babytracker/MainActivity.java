package com.tinylog.babytracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.tinylog.babytracker.noise.WhiteNoisePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WhiteNoisePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
