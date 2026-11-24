package it.andreaecristina.casa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;

/**
 * Suona la sveglia del turnario: servizio in primo piano con la notifica (Spegni / Posticipa / Spotify) e il suono
 * scelto, in loop, sul canale della sveglia (passa anche con Non disturbare). Suoni:
 * - "sistema": suoneria della sveglia del telefono;
 * - "file": brano scelto dal telefono (permesso di lettura persistente);
 * - "spotify": la suoneria resta finché la musica non parte davvero (Spotify si apre dalla schermata della sveglia).
 * Smette da sola dopo 10 minuti.
 */
public class SvegliaSuono extends Service {

    static final String AVVIA = "it.andreaecristina.casa.SUONO_AVVIA";
    static final String FERMA = "it.andreaecristina.casa.SUONO_FERMA";
    static final String CANALE = "casa-sveglie-suono";
    static final int ID_NOTIFICA = 4242;

    private MediaPlayer player;
    private Vibrator vib;
    private final Handler h = new Handler(Looper.getMainLooper());

    @Override public IBinder onBind(Intent i) { return null; }

    static JSONObject suono(Context c) {
        try { JSONObject s = new JSONObject(ComandiTelefono.prefs(c).getString("sveglieTurno", "{}")).optJSONObject("suono"); return s == null ? new JSONObject() : s; }
        catch (Exception e) { return new JSONObject(); }
    }

    static void avvia(Context c, String nome, long t) {
        Intent i = new Intent(c, SvegliaSuono.class).setAction(AVVIA).putExtra("nome", nome).putExtra("t", t);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void ferma(Context c) {
        try { c.startService(new Intent(c, SvegliaSuono.class).setAction(FERMA)); } catch (Exception e) { /* servizio già fermo */ }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_NOTIFICA);
    }

    /** Intent che apre Spotify sul brano o playlist (spotify:playlist:ID…), o null. */
    static Intent intentSpotify(Context c) {
        String uri = suono(c).optString("spotify", "");
        if (uri.isEmpty() || !"spotify".equals(suono(c).optString("tipo"))) return null;
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage("com.spotify.music");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    private void canale() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANALE) != null) return;
        NotificationChannel ch = new NotificationChannel(CANALE, "Sveglie dei turni", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Sveglie che seguono il turnario VVF (il suono lo fa A&C)");
        ch.setSound(null, null); // il suono lo suona il servizio
        ch.enableVibration(false);
        ch.setBypassDnd(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private PendingIntent azione(String a, String nome, int codice) {
        Intent i = new Intent(this, SvegliaTurno.class).setAction(a).putExtra("nome", nome);
        return PendingIntent.getBroadcast(this, codice, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification notifica(String nome, long t) {
        canale();
        Intent schermo = new Intent(this, SvegliaSchermo.class).putExtra("nome", nome).putExtra("t", t)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent ps = PendingIntent.getActivity(this, 4300, schermo, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String ora = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).format(new java.util.Date(t));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANALE) : new Notification.Builder(this);
        b.setSmallIcon(getResources().getIdentifier("ic_stat_casa", "drawable", getPackageName()))
            .setContentTitle("⏰ " + ora + " · " + nome)
            .setContentText("Sveglia del turnario")
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(ps)
            .setFullScreenIntent(ps, true)
            .addAction(new Notification.Action.Builder(null, "Spegni", azione(SvegliaTurno.SPEGNI, nome, 4301)).build())
            .addAction(new Notification.Action.Builder(null, "Posticipa 10 min", azione(SvegliaTurno.POSTICIPA, nome, 4302)).build());
        Intent sp = intentSpotify(this);
        if (sp != null) b.addAction(new Notification.Action.Builder(null, "▶ Spotify",
            PendingIntent.getActivity(this, 4303, sp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
        return b.build();
    }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        String a = i == null ? null : i.getAction();
        if (FERMA.equals(a)) { fine(); return START_NOT_STICKY; }
        String nome = i == null || i.getStringExtra("nome") == null ? "Sveglia" : i.getStringExtra("nome");
        long t = i == null ? System.currentTimeMillis() : i.getLongExtra("t", System.currentTimeMillis());
        Notification n = notifica(nome, t);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID_NOTIFICA, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID_NOTIFICA, n);
        suona();
        h.removeCallbacksAndMessages(null);
        h.postDelayed(this::fine, 10 * 60 * 1000L); // dopo 10 minuti smette
        return START_NOT_STICKY;
    }

    private void suona() {
        fermaPlayer();
        JSONObject s = suono(this);
        Uri uri = null;
        if ("file".equals(s.optString("tipo")) && !s.optString("uri").isEmpty()) uri = Uri.parse(s.optString("uri"));
        if (!avviaPlayer(uri)) avviaPlayer(null); // file non leggibile: suoneria della sveglia
        vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vib != null) {
            long[] schema = { 0, 800, 600 };
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(schema, 0), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            else vib.vibrate(schema, 0);
        }
        // Spotify: quando la musica parte davvero tolgo la suoneria
        if ("spotify".equals(s.optString("tipo"))) controllaMusica(0);
    }

    private void controllaMusica(final int giro) {
        h.postDelayed(new Runnable() { @Override public void run() {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (player == null) return;
            // la nostra suoneria è sul canale sveglia: isMusicActive vede solo la musica (Spotify)
            if (am != null && am.isMusicActive()) { fermaPlayer(); if (vib != null) vib.cancel(); return; }
            if (giro < 60) controllaMusica(giro + 1);
        } }, 1000);
    }

    private boolean avviaPlayer(Uri uri) {
        try {
            Uri u = uri != null ? uri : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            MediaPlayer p = new MediaPlayer();
            p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(uri != null ? AudioAttributes.CONTENT_TYPE_MUSIC : AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            p.setDataSource(this, u);
            p.setLooping(true);
            p.prepare();
            p.start();
            player = p;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void fermaPlayer() {
        if (player != null) { try { player.stop(); } catch (Exception e) { /* niente */ } player.release(); player = null; }
    }

    private void fine() {
        h.removeCallbacksAndMessages(null);
        fermaPlayer();
        if (vib != null) vib.cancel();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        fermaPlayer();
        if (vib != null) vib.cancel();
        super.onDestroy();
    }
}
