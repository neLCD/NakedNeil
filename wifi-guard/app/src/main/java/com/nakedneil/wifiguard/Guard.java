package com.nakedneil.wifiguard;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.UserManager;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Shared logic: network checks, browser discovery, device-owner policies and settings. */
final class Guard {
    private static final String TAG = "WifiGuard";
    private static final String PREFS = "guard";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_PIN_HASH = "pin_hash";
    private static final String KEY_PIN_SALT = "pin_salt";
    private static final String KEY_SUSPENDED = "suspended";

    /** Well-known browsers, in case one does not advertise itself as a web link handler. */
    private static final List<String> KNOWN_BROWSERS = Arrays.asList(
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary",
            "com.google.android.apps.chrome", "org.chromium.chrome",
            "org.mozilla.firefox", "org.mozilla.firefox_beta", "org.mozilla.fenix",
            "org.mozilla.focus", "org.mozilla.klar", "org.mozilla.rocket",
            "com.microsoft.emmx", "com.microsoft.bing",
            "com.opera.browser", "com.opera.mini.native", "com.opera.gx", "com.opera.browser.beta",
            "com.brave.browser", "com.duckduckgo.mobile.android",
            "com.sec.android.app.sbrowser", "com.sec.android.app.sbrowser.beta",
            "com.mi.globalbrowser", "com.android.browser", "com.huawei.browser",
            "com.heytap.browser", "com.vivo.browser", "com.UCMobile.intl", "com.uc.browser.en",
            "com.kiwibrowser.browser", "com.vivaldi.browser", "com.yandex.browser",
            "org.torproject.torbrowser", "com.ecosia.android", "mark.via.gp", "mark.via",
            "com.cloudmosa.puffinFree", "com.aloha.browser", "com.google.android.googlequicksearchbox");

    private Guard() {}

    // ---------------------------------------------------------------- settings

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) {
        return prefs(c).getBoolean(KEY_ENABLED, false);
    }

    static boolean hasPin(Context c) {
        return prefs(c).contains(KEY_PIN_HASH);
    }

    static void setPin(Context c, String pin) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String saltHex = hex(salt);
        prefs(c).edit().putString(KEY_PIN_SALT, saltHex).putString(KEY_PIN_HASH, hash(saltHex, pin)).apply();
    }

    static boolean checkPin(Context c, String pin) {
        SharedPreferences p = prefs(c);
        if (!p.contains(KEY_PIN_HASH)) return true;
        return MessageDigest.isEqual(
                p.getString(KEY_PIN_HASH, "").getBytes(StandardCharsets.UTF_8),
                hash(p.getString(KEY_PIN_SALT, ""), pin).getBytes(StandardCharsets.UTF_8));
    }

    private static String hash(String salt, String pin) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] out = md.digest((salt + ":" + pin).getBytes(StandardCharsets.UTF_8));
            for (int i = 0; i < 20000; i++) out = md.digest(out);
            return hex(out);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    // ---------------------------------------------------------------- network

    /** True when the phone's internet traffic is going over mobile data rather than Wi-Fi. */
    static boolean isOnMobileData(Context c) {
        ConnectivityManager cm = c.getSystemService(ConnectivityManager.class);
        if (cm == null) return false;
        Network n = cm.getActiveNetwork();
        if (n == null) return false;
        NetworkCapabilities nc = cm.getNetworkCapabilities(n);
        return isMobile(nc);
    }

    static boolean isMobile(NetworkCapabilities nc) {
        return nc != null
                && nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                && !nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
    }

    static String describeNetwork(Context c) {
        ConnectivityManager cm = c.getSystemService(ConnectivityManager.class);
        Network n = cm == null ? null : cm.getActiveNetwork();
        NetworkCapabilities nc = n == null ? null : cm.getNetworkCapabilities(n);
        if (nc == null) return "No connection";
        if (nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "Wi-Fi";
        if (nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "Mobile data";
        if (nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "Ethernet";
        return "Other";
    }

    static boolean isWifiOn(Context c) {
        WifiManager wm = c.getApplicationContext().getSystemService(WifiManager.class);
        return wm != null && wm.isWifiEnabled();
    }

    // ---------------------------------------------------------------- browsers

    /** Every installed app that can open ordinary web pages, plus known browsers. */
    static Set<String> findBrowsers(Context c) {
        PackageManager pm = c.getPackageManager();
        Set<String> out = new TreeSet<>();
        for (String scheme : new String[] {"http", "https"}) {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(scheme + "://example.com/"));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            List<ResolveInfo> list = pm.queryIntentActivities(i, PackageManager.MATCH_ALL);
            for (ResolveInfo ri : list) {
                if (ri.activityInfo != null) out.add(ri.activityInfo.packageName);
            }
        }
        for (String p : KNOWN_BROWSERS) {
            if (isInstalled(pm, p)) out.add(p);
        }
        out.remove(c.getPackageName());
        out.remove("android");
        return out;
    }

    private static boolean isInstalled(PackageManager pm, String pkg) {
        try {
            pm.getApplicationInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    static String label(Context c, String pkg) {
        PackageManager pm = c.getPackageManager();
        try {
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    // ---------------------------------------------------------------- device owner

    static ComponentName admin(Context c) {
        return new ComponentName(c, AdminReceiver.class);
    }

    static DevicePolicyManager dpm(Context c) {
        return c.getSystemService(DevicePolicyManager.class);
    }

    static boolean isDeviceOwner(Context c) {
        DevicePolicyManager d = dpm(c);
        return d != null && d.isDeviceOwnerApp(c.getPackageName());
    }

    private static List<String> restrictions() {
        List<String> r = new ArrayList<>();
        r.add(UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS);
        r.add(UserManager.DISALLOW_SAFE_BOOT);       // safe mode would switch this app off
        r.add(UserManager.DISALLOW_ADD_USER);        // a second user would not be protected
        if (Build.VERSION.SDK_INT >= 33) r.add(UserManager.DISALLOW_CHANGE_WIFI_STATE);
        return r;
    }

    /** Turns protection on or off, applying or lifting device-owner policies when available. */
    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean(KEY_ENABLED, on).apply();
        if (isDeviceOwner(c)) {
            DevicePolicyManager d = dpm(c);
            ComponentName a = admin(c);
            for (String r : restrictions()) {
                try {
                    if (on) d.addUserRestriction(a, r); else d.clearUserRestriction(a, r);
                } catch (Exception e) {
                    Log.w(TAG, "restriction " + r, e);
                }
            }
            try {
                d.setUninstallBlocked(a, c.getPackageName(), on);
            } catch (Exception e) {
                Log.w(TAG, "uninstall block", e);
            }
            if (Build.VERSION.SDK_INT >= 30) {
                try {   // stops "Force stop" and "Clear storage" for this app
                    d.setUserControlDisabledPackages(a, on
                            ? Collections.singletonList(c.getPackageName())
                            : Collections.<String>emptyList());
                } catch (Exception e) {
                    Log.w(TAG, "user control", e);
                }
            }
            if (on) ensureWifiOn(c);
        }
        if (on) {
            GuardService.start(c);
        } else {
            setBrowsersSuspended(c, false);
            c.stopService(new Intent(c, GuardService.class));
        }
        refresh(c);
    }

    /** Switches Wi-Fi back on (only possible for a device owner on Android 10+). */
    @SuppressWarnings("deprecation")
    static void ensureWifiOn(Context c) {
        if (!isEnabled(c)) return;
        WifiManager wm = c.getApplicationContext().getSystemService(WifiManager.class);
        if (wm == null || wm.isWifiEnabled()) return;
        if (Build.VERSION.SDK_INT < 29 || isDeviceOwner(c)) {
            try {
                wm.setWifiEnabled(true);
            } catch (Exception e) {
                Log.w(TAG, "wifi enable", e);
            }
        }
    }

    /** Re-evaluates the current network and suspends or restores browsers to match. */
    static void refresh(Context c) {
        if (!isDeviceOwner(c)) return;
        setBrowsersSuspended(c, isEnabled(c) && isOnMobileData(c));
    }

    private static synchronized void setBrowsersSuspended(Context c, boolean suspend) {
        if (!isDeviceOwner(c)) return;
        DevicePolicyManager d = dpm(c);
        ComponentName a = admin(c);
        SharedPreferences p = prefs(c);
        Set<String> previously = new HashSet<>(p.getStringSet(KEY_SUSPENDED, Collections.<String>emptySet()));
        Set<String> now = new HashSet<>();
        if (suspend) {
            Set<String> browsers = findBrowsers(c);
            try {
                String[] failed = d.setPackagesSuspended(a, browsers.toArray(new String[0]), true);
                now.addAll(browsers);
                if (failed != null) now.removeAll(Arrays.asList(failed));
            } catch (Exception e) {
                Log.w(TAG, "suspend", e);
            }
        }
        // Restore anything that was suspended before but should not be now.
        previously.removeAll(now);
        if (!previously.isEmpty()) {
            try {
                d.setPackagesSuspended(a, previously.toArray(new String[0]), false);
            } catch (Exception e) {
                Log.w(TAG, "unsuspend", e);
            }
        }
        p.edit().putStringSet(KEY_SUSPENDED, now).apply();
    }

    /** Lifts every policy and gives up device ownership so the app can be uninstalled. */
    static void removeDeviceOwner(Context c) {
        setEnabled(c, false);
        if (isDeviceOwner(c)) dpm(c).clearDeviceOwnerApp(c.getPackageName());
    }
}
