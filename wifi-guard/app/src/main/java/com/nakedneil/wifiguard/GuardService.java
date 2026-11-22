package com.nakedneil.wifiguard;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Keeps running in the background while protection is on. Watches the network, switches
 * browsers off while on mobile data (device-owner mode), and turns Wi-Fi back on if it is
 * switched off.
 */
public class GuardService extends Service {
    private static final String CHANNEL = "guard";
    private static final int NOTIFICATION_ID = 1;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback callback;
    private BroadcastReceiver receiver;

    static void start(Context c) {
        if (!Guard.isEnabled(c)) return;
        Intent i = new Intent(c, GuardService.class);
        try {
            c.startForegroundService(i);
        } catch (Exception ignored) {
            // Background start not allowed right now; the boot receiver / app will retry.
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Protection status",
                NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        goForeground();

        cm = getSystemService(ConnectivityManager.class);
        callback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { update(); }
            @Override public void onLost(Network network) { update(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities nc) { update(); }
        };
        cm.registerDefaultNetworkCallback(callback);

        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (WifiManager.WIFI_STATE_CHANGED_ACTION.equals(action)) {
                    int state = intent.getIntExtra(WifiManager.EXTRA_WIFI_STATE, -1);
                    if (state == WifiManager.WIFI_STATE_DISABLED) {
                        main.postDelayed(() -> Guard.ensureWifiOn(GuardService.this), 500);
                    }
                }
                update();
            }
        };
        IntentFilter f = new IntentFilter(WifiManager.WIFI_STATE_CHANGED_ACTION);
        register(receiver, f);

        // A newly installed browser must be caught too.
        IntentFilter pf = new IntentFilter();
        pf.addAction(Intent.ACTION_PACKAGE_ADDED);
        pf.addAction(Intent.ACTION_PACKAGE_REPLACED);
        pf.addDataScheme("package");
        register(packageReceiver, pf);
    }

    private void register(BroadcastReceiver r, IntentFilter f) {
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(r, f);
    }

    private final BroadcastReceiver packageReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { update(); }
    };

    private void update() {
        main.removeCallbacks(updateRunnable);
        main.postDelayed(updateRunnable, 200);
    }

    private final Runnable updateRunnable = () -> {
        if (!Guard.isEnabled(this)) {
            stopSelf();
            return;
        }
        Guard.refresh(this);
        BrowserBlockerService.closeBrowserIfNeeded();
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, buildNotification());
    };

    private void goForeground() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private Notification buildNotification() {
        boolean mobile = Guard.isOnMobileData(this);
        String text;
        if (mobile) text = "On mobile data: browsers are blocked";
        else if (!Guard.isWifiOn(this)) text = "Wi-Fi is off: turn it back on";
        else text = "On " + Guard.describeNetwork(this) + ": browsers allowed";
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("WiFi Guard is on")
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Guard.isEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        update();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        try { cm.unregisterNetworkCallback(callback); } catch (Exception ignored) { }
        try { unregisterReceiver(receiver); } catch (Exception ignored) { }
        try { unregisterReceiver(packageReceiver); } catch (Exception ignored) { }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
