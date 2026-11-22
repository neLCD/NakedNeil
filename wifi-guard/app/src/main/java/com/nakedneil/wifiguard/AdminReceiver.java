package com.nakedneil.wifiguard;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

public class AdminReceiver extends DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) {
        if (Guard.isEnabled(context)) Guard.setEnabled(context, true);
    }
}
