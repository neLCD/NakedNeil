package com.tinylog.babytracker.noise;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import com.tinylog.babytracker.MainActivity;
import com.tinylog.babytracker.R;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.Collections;
import java.util.Date;

/**
 * Plays white noise as a foreground service, so it keeps going with the screen off.
 * Two modes: through this phone (AudioTrack), or "cast" mode, where the phone serves an
 * endless WAV stream on the home Wi-Fi for a Cast speaker to play.
 */
public class NoiseService extends Service {
    public static final String ACTION_START = "com.tinylog.babytracker.noise.START";
    public static final String ACTION_STOP = "com.tinylog.babytracker.noise.STOP";
    public static final String ACTION_VOLUME = "com.tinylog.babytracker.noise.VOLUME";
    private static final String CHANNEL = "sounds";
    private static final int NOTIFICATION_ID = 4201;
    private static final int SAMPLE_RATE = 44100;
    private static final long FADE_MS = 8000;

    public interface Listener {
        void onNoiseState();
        void onStreamReady();
    }

    public static volatile Listener listener;
    public static volatile boolean running;
    public static volatile boolean castMode;
    public static volatile String type = "white";
    public static volatile long endsAt; // 0 = until stopped
    public static volatile float volume = 0.5f;
    public static volatile int port;
    public static volatile String host;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable stopLater = this::stopEverything;
    private volatile int epoch; // bumping this tells running threads to finish
    private volatile boolean paused;
    private ServerSocket server;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private AudioFocusRequest focusRequest;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            start(intent);
        } else if (ACTION_VOLUME.equals(action)) {
            volume = clamp(intent.getFloatExtra("volume", volume));
        } else {
            stopEverything();
        }
        return START_NOT_STICKY;
    }

    private static float clamp(float v) {
        return Math.max(0f, Math.min(1f, v));
    }

    private void start(Intent intent) {
        final int mine = ++epoch; // stops any earlier playback or stream
        closeServer();
        type = intent.getStringExtra("type");
        if (type == null) type = "white";
        volume = clamp(intent.getFloatExtra("volume", volume));
        endsAt = intent.getLongExtra("endsAt", 0);
        castMode = intent.getBooleanExtra("cast", false);
        running = true;
        paused = false;

        Notification notification = buildNotification();
        int fgsType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, fgsType);

        acquireLocks();
        handler.removeCallbacks(stopLater);
        if (endsAt > 0) handler.postDelayed(stopLater, Math.max(0, endsAt - System.currentTimeMillis()));

        if (castMode) {
            abandonFocus();
            new Thread(() -> runServer(mine), "tinylog-noise-stream").start();
        } else {
            requestFocus();
            new Thread(() -> playLocally(mine), "tinylog-noise").start();
        }
        notifyState();
    }

    private void stopEverything() {
        epoch++;
        running = false;
        castMode = false;
        endsAt = 0;
        port = 0;
        handler.removeCallbacks(stopLater);
        closeServer();
        abandonFocus();
        releaseLocks();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
        notifyState();
    }

    @Override
    public void onDestroy() {
        epoch++;
        running = false;
        handler.removeCallbacks(stopLater);
        closeServer();
        abandonFocus();
        releaseLocks();
        super.onDestroy();
    }

    private void notifyState() {
        Listener l = listener;
        if (l != null) handler.post(l::onNoiseState);
    }

    // ---------- playing through this phone ----------
    private void playLocally(int mine) {
        AudioTrack track = null;
        try {
            int min = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build())
                .setAudioFormat(new AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build())
                .setBufferSizeInBytes(Math.max(min, SAMPLE_RATE))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build();
            track.play();
            NoiseGenerator generator = new NoiseGenerator(type);
            short[] buffer = new short[4096];
            float gain = 0f; // eases towards the target, so starts, stops and volume changes are gentle
            while (epoch == mine) {
                gain += (targetGain() - gain) * 0.08f;
                generator.fill(buffer, gain);
                if (track.write(buffer, 0, buffer.length) < 0) break;
            }
        } catch (Exception ignored) {
            // audio device unavailable: fall through and release
        } finally {
            if (track != null) {
                try { track.pause(); track.flush(); } catch (Exception ignored) { }
                track.release();
            }
        }
    }

    /** Volume now, fading out over the last few seconds of a timed session. */
    private float targetGain() {
        if (paused) return 0f;
        float target = volume;
        long end = endsAt;
        if (end > 0) {
            long left = end - System.currentTimeMillis();
            if (left < FADE_MS) target *= Math.max(0f, left / (float) FADE_MS);
        }
        return target;
    }

    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            paused = true; // a phone call or similar
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            paused = false;
        } else if (change == AudioManager.AUDIOFOCUS_LOSS) {
            handler.post(this::stopEverything); // another app started playing
        }
    };

    private void requestFocus() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setOnAudioFocusChangeListener(focusListener, handler)
                .build();
            am.requestAudioFocus(focusRequest);
        } else {
            am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void abandonFocus() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) am.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        } else {
            am.abandonAudioFocus(focusListener);
        }
    }

    // ---------- serving a stream for a Cast speaker ----------
    private void runServer(int mine) {
        try {
            ServerSocket socket = new ServerSocket(0);
            server = socket;
            host = localAddress();
            port = socket.getLocalPort();
            Listener l = listener;
            if (l != null) handler.post(l::onStreamReady);
            while (epoch == mine) {
                Socket client = socket.accept();
                new Thread(() -> serve(client, mine), "tinylog-noise-client").start();
            }
        } catch (Exception ignored) {
            // socket closed on stop, or no network
        }
    }

    private void serve(Socket client, int mine) {
        try (Socket socket = client) {
            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            String request = in.readLine();
            String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) { /* skip headers */ }
            OutputStream out = socket.getOutputStream();
            String head = "HTTP/1.1 200 OK\r\nContent-Type: audio/wav\r\nCache-Control: no-store\r\n"
                + "Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
            out.write(head.getBytes(StandardCharsets.US_ASCII));
            if (request != null && request.startsWith("HEAD")) return;

            ByteBuffer wav = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
            wav.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(0xFFFFFFFF)
                .put("WAVE".getBytes(StandardCharsets.US_ASCII))
                .put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16)
                .putShort((short) 1).putShort((short) 1).putInt(SAMPLE_RATE).putInt(SAMPLE_RATE * 2)
                .putShort((short) 2).putShort((short) 16)
                .put("data".getBytes(StandardCharsets.US_ASCII)).putInt(0xFFFFFFFF);
            out.write(wav.array());

            NoiseGenerator generator = new NoiseGenerator(type);
            short[] samples = new short[4096];
            ByteBuffer bytes = ByteBuffer.allocate(samples.length * 2).order(ByteOrder.LITTLE_ENDIAN);
            long started = System.currentTimeMillis(), sent = 0;
            float gain = 0f;
            while (epoch == mine) {
                gain += (targetGain() - gain) * 0.08f;
                generator.fill(samples, gain);
                bytes.clear();
                bytes.asShortBuffer().put(samples);
                out.write(bytes.array());
                sent += samples.length;
                // stay only a few seconds ahead of real time, so volume changes and the fade-out are heard
                double ahead = sent / (double) SAMPLE_RATE - (System.currentTimeMillis() - started) / 1000.0;
                if (ahead > 4) Thread.sleep(250);
            }
        } catch (Exception ignored) {
            // the speaker disconnected
        }
    }

    private void closeServer() {
        ServerSocket socket = server;
        server = null;
        if (socket != null) {
            new Thread(() -> { try { socket.close(); } catch (Exception ignored) { } }).start();
        }
    }

    /** This phone's address on the home network (IPv4, site-local). */
    private static String localAddress() {
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InetAddress address : Collections.list(nif.getInetAddresses())) {
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) return address.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    // ---------- staying alive with the screen off ----------
    private void acquireLocks() {
        releaseLocks();
        long limit = endsAt > 0 ? Math.max(60_000, endsAt - System.currentTimeMillis() + 60_000) : 12 * 60 * 60_000L;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "tinylog:noise");
            wakeLock.acquire(limit);
        }
        if (castMode) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "tinylog:noise");
                wifiLock.acquire();
            }
        }
    }

    private void releaseLocks() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) { }
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) { }
        wakeLock = null;
        wifiLock = null;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Soothing sounds", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while white noise is playing");
            nm.createNotificationChannel(channel);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, NoiseService.class).setAction(ACTION_STOP), flags);
        String name = type.substring(0, 1).toUpperCase() + type.substring(1) + " noise";
        String detail = endsAt > 0
            ? "Stops at " + DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(endsAt))
            : "Playing until you stop it";
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_sound)
            .setContentTitle(castMode ? name + " on your speaker" : name + " playing")
            .setContentText(detail)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setContentIntent(open)
            .addAction(0, "Stop", stop)
            .build();
    }
}
