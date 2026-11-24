package it.andreaecristina.casa;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sveglie che seguono il turnario VVF (l'Orologio di Android non accetta sveglie in una data precisa).
 * L'app salva in CapacitorStorage, chiave "sveglieTurno": { attive, eventi: [ { t: ms, nome: "Diurno" } ] }.
 * Una sola sveglia di sistema alla volta (setAlarmClock: esatta, anche in risparmio energetico); quando suona
 * mostra una notifica con suono da sveglia che si ripete (canale "Sveglie", passa anche con Non disturbare)
 * e la schermata SvegliaSchermo con Spegni / Posticipa 10 minuti.
 */
public class SvegliaTurno extends BroadcastReceiver {

    static final String SUONA = "it.andreaecristina.casa.SVEGLIA_SUONA";
    static final String SPEGNI = "it.andreaecristina.casa.SVEGLIA_SPEGNI";
    static final String POSTICIPA = "it.andreaecristina.casa.SVEGLIA_POSTICIPA";
    static final String CANALE = "casa-sveglie";
    static final int ID_NOTIFICA = 4242;

    static SharedPreferences prefs(Context c) { return ComandiTelefono.prefs(c); }

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction() == null ? "" : i.getAction();
        if (SUONA.equals(a)) {
            suona(c, i.getStringExtra("nome"), i.getLongExtra("t", System.currentTimeMillis()));
            prefs(c).edit().putLong("svegliaUltima", i.getLongExtra("t", 0)).remove("svegliaPosticipo").apply();
            programma(c);
        } else if (SPEGNI.equals(a)) {
            spegni(c);
        } else if (POSTICIPA.equals(a)) {
            posticipa(c, i.getStringExtra("nome"));
        } else {
            programma(c); // riavvio del telefono o aggiornamento dell'app
        }
    }

    static void spegni(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ID_NOTIFICA);
    }

    static void posticipa(Context c, String nome) {
        spegni(c);
        long t = System.currentTimeMillis() + 10 * 60 * 1000L;
        prefs(c).edit().putLong("svegliaPosticipo", t).putString("svegliaPosticipoNome", nome == null ? "Sveglia" : nome).apply();
        programma(c);
    }

    private static void canale(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CANALE) != null) return;
        NotificationChannel ch = new NotificationChannel(CANALE, "Sveglie dei turni", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Sveglie che seguono il turnario VVF");
        Uri suono = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (suono == null) suono = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        ch.setSound(suono, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] { 0, 800, 400, 800, 400, 800 });
        ch.setBypassDnd(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent azione(Context c, String a, String nome, int codice) {
        Intent i = new Intent(c, SvegliaTurno.class).setAction(a).putExtra("nome", nome);
        return PendingIntent.getBroadcast(c, codice, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void suona(Context c, String nome, long t) {
        canale(c);
        if (nome == null || nome.isEmpty()) nome = "Sveglia";
        Intent schermo = new Intent(c, SvegliaSchermo.class).putExtra("nome", nome).putExtra("t", t)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent ps = PendingIntent.getActivity(c, 4300, schermo, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String ora = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).format(new java.util.Date(t));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CANALE) : new Notification.Builder(c);
        b.setSmallIcon(c.getResources().getIdentifier("ic_stat_casa", "drawable", c.getPackageName()))
            .setContentTitle("⏰ " + ora + " · " + nome)
            .setContentText("Sveglia del turnario")
            .setCategory(Notification.CATEGORY_ALARM)
            .setPriority(Notification.PRIORITY_MAX)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(ps)
            .setFullScreenIntent(ps, true)
            .addAction(new Notification.Action.Builder(null, "Spegni", azione(c, SPEGNI, nome, 4301)).build())
            .addAction(new Notification.Action.Builder(null, "Posticipa 10 min", azione(c, POSTICIPA, nome, 4302)).build());
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(10 * 60 * 1000L); // dopo 10 minuti smette
        if (Build.VERSION.SDK_INT < 26) {
            b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM);
            b.setVibrate(new long[] { 0, 800, 400, 800 });
        }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT; // il suono si ripete finché non la spegni
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ID_NOTIFICA, n);
    }

    /** Programma la prossima sveglia (eventi del turnario o posticipo). */
    static void programma(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(c, SvegliaTurno.class).setAction(SUONA);
        PendingIntent vecchia = PendingIntent.getBroadcast(c, 4200, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(vecchia);

        long ora = System.currentTimeMillis(), quando = -1, ultima = prefs(c).getLong("svegliaUltima", 0);
        String nome = "";
        long posticipo = prefs(c).getLong("svegliaPosticipo", 0);
        if (posticipo > ora) { quando = posticipo; nome = prefs(c).getString("svegliaPosticipoNome", "Sveglia"); }
        try {
            JSONObject conf = new JSONObject(prefs(c).getString("sveglieTurno", "{}"));
            JSONArray ev = conf.optBoolean("attive", false) ? conf.optJSONArray("eventi") : null;
            for (int k = 0; ev != null && k < ev.length(); k++) {
                JSONObject e = ev.optJSONObject(k);
                if (e == null) continue;
                long t = e.optLong("t");
                if (t > ora + 1000 && t != ultima && (quando < 0 || t < quando)) { quando = t; nome = e.optString("nome", "Turno"); }
            }
        } catch (Exception e) { /* niente */ }
        if (quando < 0) return;

        i.putExtra("nome", nome).putExtra("t", quando);
        PendingIntent pi = PendingIntent.getBroadcast(c, 4200, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent apri = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent mostra = PendingIntent.getActivity(c, 4201, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setAlarmClock(new AlarmManager.AlarmClockInfo(quando, mostra), pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
        }
        prefs(c).edit().putLong("svegliaProssima", quando).putString("svegliaProssimaNome", nome).apply();
    }
}
