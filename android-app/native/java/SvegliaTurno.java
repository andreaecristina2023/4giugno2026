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
 * avvia SvegliaSuono (notifica, suono scelto in loop, schermata SvegliaSchermo con Spegni / Posticipa 10 minuti).
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
        SvegliaSuono.ferma(c);
    }

    static void posticipa(Context c, String nome) {
        spegni(c);
        long t = System.currentTimeMillis() + 10 * 60 * 1000L;
        prefs(c).edit().putLong("svegliaPosticipo", t).putString("svegliaPosticipoNome", nome == null ? "Sveglia" : nome).apply();
        programma(c);
    }

    /** Fa suonare la sveglia (servizio in primo piano con notifica e suono scelto). */
    static void suona(Context c, String nome, long t) {
        SvegliaSuono.avvia(c, nome == null || nome.isEmpty() ? "Sveglia" : nome, t);
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
