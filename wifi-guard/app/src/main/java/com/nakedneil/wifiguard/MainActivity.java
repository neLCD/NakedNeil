package com.nakedneil.wifiguard;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Set;

public class MainActivity extends Activity {
    private LinearLayout root;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ScrollView scroll = new ScrollView(this);
        scroll.setFitsSystemWindows(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);
        setContentView(scroll);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Guard.isEnabled(this)) {
            GuardService.start(this);
            Guard.refresh(this);
        }
        render();
    }

    private void render() {
        root.removeAllViews();
        boolean enabled = Guard.isEnabled(this);
        boolean owner = Guard.isDeviceOwner(this);
        boolean access = isAccessibilityOn();

        title("WiFi Guard");
        text("Keeps Wi-Fi on and closes web browsers whenever the phone is using mobile data.");

        heading("Status");
        line("Protection", enabled ? "ON" : "OFF");
        String mode = owner ? "Full (device owner)" : access ? "Basic (accessibility)" : "Not set up";
        line("Mode", mode);
        line("Network", Guard.describeNetwork(this));
        line("Wi-Fi", Guard.isWifiOn(this) ? "On" : "Off");
        line("Browsers right now", enabled && Guard.isOnMobileData(this) ? "Blocked" : "Allowed");

        if (enabled) {
            button("Turn protection off", v -> withPin(() -> {
                Guard.setEnabled(this, false);
                render();
            }));
        } else {
            button("Turn protection on", v -> {
                if (!owner && !access) {
                    toast("Set up Basic or Full mode below first.");
                    return;
                }
                if (!Guard.hasPin(this)) {
                    askNewPin(() -> {
                        Guard.setEnabled(this, true);
                        render();
                    });
                } else {
                    Guard.setEnabled(this, true);
                    render();
                }
            });
        }
        button(Guard.hasPin(this) ? "Change PIN" : "Set a PIN",
                v -> withPin(() -> askNewPin(this::render)));
        text("The PIN is needed to turn protection off. Give it to someone you trust if you want accountability.");

        heading("Basic mode (any phone)");
        text("Uses an accessibility service to send you to the home screen whenever a browser "
                + "opens while you are on mobile data. It cannot stop Wi-Fi being switched off, "
                + "but with Wi-Fi off and data on, browsers still will not open.\n\n"
                + "Android 13+: if the switch is greyed out, open Settings > Apps > WiFi Guard, "
                + "tap the ⋮ menu, choose \"Allow restricted settings\", then try again.");
        line("Accessibility service", access ? "On" : "Off");
        if (!access) {
            button("Open accessibility settings",
                    v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        }

        heading("Full mode (device owner)");
        if (owner) {
            text("Active. While protection is on: Wi-Fi cannot be switched off (Android 13+; on "
                    + "older versions it is switched straight back on), mobile network settings "
                    + "are locked, browsers are switched off entirely while on mobile data, and "
                    + "this app cannot be uninstalled, force-stopped or bypassed with safe mode.");
            button("Remove device owner (allows uninstall)", v -> withPin(() -> {
                Guard.removeDeviceOwner(this);
                toast("Device owner removed. You can now uninstall the app.");
                render();
            }));
        } else {
            String cmd = "adb shell dpm set-device-owner " + getPackageName() + "/.AdminReceiver";
            text("Strongest protection. One-time setup from a computer:\n\n"
                    + "1. Remove every account from the phone (Settings > Passwords & accounts). "
                    + "You can add them back afterwards.\n"
                    + "2. Turn on USB debugging (Settings > About phone, tap Build number 7 times, "
                    + "then Developer options > USB debugging).\n"
                    + "3. Connect to a computer with adb installed and run:");
            TextView c = text(cmd);
            c.setTypeface(Typeface.MONOSPACE);
            c.setTextIsSelectable(true);
            button("Copy command", v -> {
                getSystemService(ClipboardManager.class)
                        .setPrimaryClip(ClipData.newPlainText("adb", cmd));
                toast("Copied");
            });
            text("4. Add your accounts back, then come back here and turn protection on.");
        }

        heading("Browsers found");
        Set<String> browsers = Guard.findBrowsers(this);
        StringBuilder sb = new StringBuilder();
        for (String p : browsers) sb.append("• ").append(Guard.label(this, p)).append("  (").append(p).append(")\n");
        text(browsers.isEmpty() ? "None" : sb.toString().trim());
    }

    // ---------------------------------------------------------------- PIN dialogs

    private void withPin(Runnable then) {
        if (!Guard.hasPin(this)) {
            then.run();
            return;
        }
        EditText input = pinInput();
        new AlertDialog.Builder(this)
                .setTitle("Enter PIN")
                .setView(wrap(input))
                .setPositiveButton("OK", (d, w) -> {
                    if (Guard.checkPin(this, input.getText().toString())) then.run();
                    else toast("Wrong PIN");
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void askNewPin(Runnable then) {
        EditText a = pinInput();
        EditText b = pinInput();
        b.setHint("Repeat PIN");
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.addView(a);
        box.addView(b);
        new AlertDialog.Builder(this)
                .setTitle("Choose a PIN (at least 4 digits)")
                .setView(wrap(box))
                .setPositiveButton("Save", (d, w) -> {
                    String p = a.getText().toString();
                    if (p.length() < 4) toast("PIN too short");
                    else if (!p.equals(b.getText().toString())) toast("PINs do not match");
                    else {
                        Guard.setPin(this, p);
                        toast("PIN saved");
                        then.run();
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private EditText pinInput() {
        EditText e = new EditText(this);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        e.setHint("PIN");
        return e;
    }

    private View wrap(View v) {
        LinearLayout l = new LinearLayout(this);
        int p = dp(20);
        l.setPadding(p, dp(8), p, 0);
        l.addView(v, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        return l;
    }

    // ---------------------------------------------------------------- helpers

    private boolean isAccessibilityOn() {
        String enabled = Settings.Secure.getString(getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName me = new ComponentName(this, BrowserBlockerService.class);
        for (String s : enabled.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(s);
            if (me.equals(c)) return true;
        }
        return false;
    }

    private void title(String s) {
        TextView t = text(s);
        t.setTextSize(26);
        t.setTypeface(Typeface.DEFAULT_BOLD);
    }

    private void heading(String s) {
        TextView t = text(s);
        t.setTextSize(19);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(22), 0, dp(4));
    }

    private void line(String label, String value) {
        text(label + ":  " + value);
    }

    private TextView text(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(15);
        t.setPadding(0, dp(4), 0, dp(4));
        root.addView(t);
        return t;
    }

    private void button(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        root.addView(b);
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
