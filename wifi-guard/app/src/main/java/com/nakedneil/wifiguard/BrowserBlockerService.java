package com.nakedneil.wifiguard;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.Collections;
import java.util.Set;

/**
 * Works on any phone (no device-owner setup needed): whenever a browser comes to the front
 * while the phone is on mobile data, it is sent back to the home screen.
 */
public class BrowserBlockerService extends AccessibilityService {
    private static volatile BrowserBlockerService instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private Set<String> browsers = Collections.emptySet();
    private long browsersLoadedAt;
    private long lastToastAt;

    static boolean isRunning() {
        return instance != null;
    }

    /** Called when the network changes, to close a browser that is already open. */
    static void closeBrowserIfNeeded() {
        BrowserBlockerService s = instance;
        if (s != null) s.main.post(s::checkActiveWindow);
    }

    @Override
    protected void onServiceConnected() {
        instance = this;
        GuardService.start(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName();
        if (pkg != null) maybeBlock(pkg.toString());
    }

    private void checkActiveWindow() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        CharSequence pkg = root.getPackageName();
        if (pkg != null) maybeBlock(pkg.toString());
    }

    private void maybeBlock(String pkg) {
        if (pkg.equals(getPackageName())) return;
        if (!Guard.isEnabled(this) || !Guard.isOnMobileData(this)) return;
        if (!browsers().contains(pkg)) return;
        performGlobalAction(GLOBAL_ACTION_HOME);
        long now = System.currentTimeMillis();
        if (now - lastToastAt > 3000) {
            lastToastAt = now;
            Toast.makeText(this, "Browsers are blocked on mobile data. Connect to Wi-Fi.",
                    Toast.LENGTH_SHORT).show();
        }
    }

    private Set<String> browsers() {
        long now = System.currentTimeMillis();
        if (now - browsersLoadedAt > 60_000) {   // pick up newly installed browsers
            browsers = Guard.findBrowsers(this);
            browsersLoadedAt = now;
        }
        return browsers;
    }

    @Override
    public void onInterrupt() { }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }
}
