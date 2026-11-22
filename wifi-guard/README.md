# WiFi Guard (Android)

Stops web browsing over mobile data:

- **Keeps Wi-Fi on** so the phone cannot be switched from Wi-Fi to mobile data.
- **Closes web browsers** whenever the phone's internet is going over mobile data.
- A **PIN** is needed to turn protection off (give it to someone you trust).

## Two modes

| | Basic (accessibility) | Full (device owner) |
|---|---|---|
| Setup | Turn on the accessibility service in the app | One `adb` command from a computer |
| Browsers on mobile data | Sent to the home screen as soon as they open | Switched off completely (greyed out) |
| Wi-Fi switched off | Not prevented, but browsers still won't open on data | Blocked on Android 13+; switched straight back on for 10-12 |
| Uninstall / force stop / safe mode | Possible | Blocked |

Full mode setup: remove all accounts from the phone, enable USB debugging, then run

```
adb shell dpm set-device-owner com.nakedneil.wifiguard/.AdminReceiver
```

and add the accounts back. To remove it later use **Remove device owner** in the app (needs the PIN).

On Android 13+ sideloaded apps can't turn on accessibility until you open
Settings > Apps > WiFi Guard > ⋮ > **Allow restricted settings**.

## Build

GitHub Actions (`.github/workflows/wifi-guard.yml`) builds `app-debug.apk` on every push
that touches `wifi-guard/`. Locally: `./gradlew assembleDebug` with the Android SDK installed.
