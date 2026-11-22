package com.nakedneil.wifiguard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Guard.isEnabled(context)) return;
        Guard.ensureWifiOn(context);
        Guard.refresh(context);
        GuardService.start(context);
    }
}
