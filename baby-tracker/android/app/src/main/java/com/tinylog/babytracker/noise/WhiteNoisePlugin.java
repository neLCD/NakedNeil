package com.tinylog.babytracker.noise;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.mediarouter.app.MediaRouteChooserDialog;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;

/**
 * Bridge between the app's Sounds screen and NoiseService, plus Google Cast.
 * Every Cast call has to happen on the main thread, so each method hops there first.
 */
@CapacitorPlugin(name = "WhiteNoise")
public class WhiteNoisePlugin extends Plugin implements NoiseService.Listener, SessionManagerListener<CastSession> {
    private CastContext castContext;
    private RemoteMediaClient watched; // the speaker connection whose status we are following
    private boolean heard;             // the speaker has actually started playing our stream
    private int reloads;               // automatic retries after a stream error

    @Override
    public void load() {
        NoiseService.listener = this;
    }

    /** The activity is going away: let go of everything that points back at this plugin. */
    @Override
    protected void handleOnDestroy() {
        if (NoiseService.listener == this) NoiseService.listener = null;
        try {
            unwatch();
            if (castContext != null) castContext.getSessionManager().removeSessionManagerListener(this, CastSession.class);
        } catch (Exception ignored) { }
        castContext = null;
        super.handleOnDestroy();
    }

    private void stopService() {
        try {
            getContext().startService(new Intent(getContext(), NoiseService.class).setAction(NoiseService.ACTION_STOP));
        } catch (Exception ignored) { } // the service is not running, or the app is in the background: nothing to stop
    }

    /** Main thread only. Returns null when Google Play services or Cast are unavailable. */
    private CastContext cast() {
        if (castContext == null) {
            try {
                castContext = CastContext.getSharedInstance(getContext().getApplicationContext());
                castContext.getSessionManager().addSessionManagerListener(this, CastSession.class);
            } catch (Exception e) {
                castContext = null;
            }
        }
        return castContext;
    }

    /** Main thread only. */
    private CastSession session() {
        try {
            CastSession s = castContext == null ? null : castContext.getSessionManager().getCurrentCastSession();
            return s != null && s.isConnected() ? s : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Main thread only. */
    private JSObject state() {
        JSObject o = new JSObject();
        o.put("playing", NoiseService.running);
        o.put("type", NoiseService.type);
        o.put("endsAt", NoiseService.endsAt);
        o.put("volume", NoiseService.volume);
        CastSession s = session();
        o.put("casting", s != null);
        String device = null;
        try { if (s != null && s.getCastDevice() != null) device = s.getCastDevice().getFriendlyName(); } catch (Exception ignored) { }
        o.put("device", device == null ? "" : device);
        return o;
    }

    private void startService(String type, long endsAt, float volume, boolean cast) {
        Intent intent = new Intent(getContext(), NoiseService.class)
            .setAction(NoiseService.ACTION_START)
            .putExtra("type", type)
            .putExtra("endsAt", endsAt)
            .putExtra("volume", volume)
            .putExtra("cast", cast);
        ContextCompat.startForegroundService(getContext(), intent);
    }

    @PluginMethod
    public void start(PluginCall call) {
        final String type = call.getString("type", "white");
        final int minutes = call.getInt("minutes", 0);
        final float volume = call.getFloat("volume", 0.5f);
        getActivity().runOnUiThread(() -> {
            try {
                // Android 13+: ask once so the "playing" notification with its Stop button can show.
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4201);
                }
                long endsAt = minutes > 0 ? System.currentTimeMillis() + minutes * 60_000L : 0;
                startService(type, endsAt, volume, session() != null);
                JSObject o = state();
                o.put("playing", true);
                o.put("type", type);
                o.put("endsAt", endsAt);
                o.put("volume", volume);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("Could not start the sound.");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopService();
            JSObject o = state();
            o.put("playing", false);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        float volume = call.getFloat("volume", 0.5f);
        NoiseService.volume = Math.max(0f, Math.min(1f, volume));
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cast(); // so an existing Cast session is picked up after the app reopens
            call.resolve(state());
        });
    }

    /** Opens Android's "cast to" device picker. */
    @PluginMethod
    public void cast(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CastContext context = cast();
            if (context == null) {
                call.reject("Casting is not available on this phone.");
                return;
            }
            try {
                MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(getActivity());
                dialog.setRouteSelector(context.getMergedSelector());
                dialog.show();
                call.resolve(state());
            } catch (Exception e) {
                call.reject("Could not open the speaker list.");
            }
        });
    }

    /** Disconnects from the speaker and stops the sound. */
    @PluginMethod
    public void stopCast(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (castContext != null) castContext.getSessionManager().endCurrentSession(true);
            } catch (Exception ignored) { }
            stopService();
            call.resolve();
        });
    }

    private void emit() {
        notifyListeners("state", state());
    }

    /** Main thread only: tell the speaker to play this phone's stream, once both are ready. */
    private void loadOnSpeaker() {
        CastSession s = session();
        if (s == null || !NoiseService.running || !NoiseService.castMode || NoiseService.port == 0) return;
        if (NoiseService.host == null) {
            JSObject o = new JSObject();
            o.put("message", "Connect this phone to the same Wi-Fi as the speaker.");
            notifyListeners("problem", o);
            return;
        }
        RemoteMediaClient client = s.getRemoteMediaClient();
        if (client == null) return;
        String url = "http://" + NoiseService.host + ":" + NoiseService.port + "/" + NoiseService.token + "/noise.wav";
        MediaMetadata metadata = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK);
        metadata.putString(MediaMetadata.KEY_TITLE, "White noise");
        metadata.putString(MediaMetadata.KEY_ARTIST, "TinyLog");
        MediaInfo info = new MediaInfo.Builder(url)
            .setStreamType(MediaInfo.STREAM_TYPE_LIVE)
            .setContentType("audio/wav")
            .setMetadata(metadata)
            .build();
        watch(client);
        heard = false;
        client.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build());
    }

    /** Follows the speaker's playback, so a stalled stream is retried and a stop at the speaker is noticed. */
    private final RemoteMediaClient.Callback speakerStatus = new RemoteMediaClient.Callback() {
        @Override
        public void onStatusUpdated() {
            RemoteMediaClient client = watched;
            if (client == null || !NoiseService.running || !NoiseService.castMode) return;
            int playerState = client.getPlayerState();
            if (playerState == MediaStatus.PLAYER_STATE_PLAYING || playerState == MediaStatus.PLAYER_STATE_BUFFERING) {
                heard = true;
                return;
            }
            if (playerState != MediaStatus.PLAYER_STATE_IDLE || !heard) return; // ignore states left over from before our load
            int reason = client.getIdleReason();
            if (reason == MediaStatus.IDLE_REASON_ERROR && reloads < 3) {
                reloads++;
                loadOnSpeaker(); // a Wi-Fi blip: ask the speaker to pick the stream up again
            } else if (reason == MediaStatus.IDLE_REASON_ERROR || reason == MediaStatus.IDLE_REASON_CANCELED || reason == MediaStatus.IDLE_REASON_FINISHED) {
                stopService(); // stopped at the speaker, or it will not recover: do not claim to be playing
            }
        }
    };

    private void watch(RemoteMediaClient client) {
        if (watched == client) return;
        unwatch();
        watched = client;
        client.registerCallback(speakerStatus);
    }

    private void unwatch() {
        try { if (watched != null) watched.unregisterCallback(speakerStatus); } catch (Exception ignored) { }
        watched = null;
    }

    // ---------- NoiseService.Listener (called on the main thread) ----------
    @Override
    public void onNoiseState() {
        CastSession s = session();
        if (!NoiseService.running && s != null) {
            try {
                if (NoiseService.stoppedByTimer) {
                    // The sleep timer ran out with nobody watching: release the speaker completely.
                    castContext.getSessionManager().endCurrentSession(true);
                } else {
                    // Stop pressed: silence the speaker but stay connected, so Play goes to it again.
                    RemoteMediaClient client = s.getRemoteMediaClient();
                    if (client != null) client.stop();
                }
            } catch (Exception ignored) { }
        }
        if (!NoiseService.running) reloads = 0;
        emit();
    }

    @Override
    public void onStreamReady() {
        loadOnSpeaker();
    }

    // ---------- Cast session events (main thread) ----------
    private void onConnected() {
        reloads = 0;
        if (NoiseService.running) {
            // Move what is playing from the phone to the speaker, keeping the timer.
            try {
                startService(NoiseService.type, NoiseService.endsAt, NoiseService.volume, true);
            } catch (Exception e) {
                // Android refuses to start a foreground service while the app is in the background.
                stopService();
            }
        }
        emit();
    }

    private void onDisconnected() {
        // Never fall back to the phone's own speaker by surprise: stop instead.
        unwatch();
        if (NoiseService.running && NoiseService.castMode) stopService();
        emit();
    }

    @Override public void onSessionStarted(CastSession session, String sessionId) { onConnected(); }
    @Override public void onSessionResumed(CastSession session, boolean wasSuspended) { onConnected(); }
    @Override public void onSessionEnded(CastSession session, int error) { onDisconnected(); }
    @Override public void onSessionStartFailed(CastSession session, int error) { emit(); }
    @Override public void onSessionResumeFailed(CastSession session, int error) { emit(); }
    @Override public void onSessionSuspended(CastSession session, int reason) { emit(); }
    @Override public void onSessionStarting(CastSession session) { }
    @Override public void onSessionEnding(CastSession session) { }
    @Override public void onSessionResuming(CastSession session, String sessionId) { }
}
