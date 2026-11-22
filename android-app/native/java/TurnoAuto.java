package it.andreaecristina.casa;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Modo automatico durante i turni VVF (solo telefono di Andrea).
 * L'app salva in CapacitorStorage, chiave "turnoAuto":
 * { attivo, inTurno: "lavoro", dopo: "" (= il modo che c'era prima) | id, modi: [ ... ], intervalli: [ [inizioMs, fineMs], ... ] }
 * A inizio turno applica il modo "inTurno" (ricordando quello di prima); a fine turno rimette il modo di prima
 * solo se l'aveva cambiato lui. Una sola sveglia di sistema alla volta: al prossimo inizio o fine turno.
 */
public class TurnoAuto extends BroadcastReceiver {

    private static final String TAG = "TurnoAuto";
    static final String AZIONE = "it.andreaecristina.casa.TURNO_AUTO";

    @Override
    public void onReceive(Context c, Intent intent) {
        // sveglia di inizio/fine turno, riavvio del telefono o aggiornamento dell'app
        final PendingResult pr = goAsync();
        try { programma(c); } finally { pr.finish(); }
    }

    private static JSONObject trovaModo(JSONObject conf, String id) {
        JSONArray modi = conf.optJSONArray("modi");
        for (int i = 0; modi != null && i < modi.length(); i++) {
            JSONObject m = modi.optJSONObject(i);
            if (m != null && id != null && id.equals(m.optString("id"))) return m;
        }
        return null;
    }

    private static boolean applica(Context c, JSONObject conf, String id) {
        JSONObject m = trovaModo(conf, id);
        if (m == null) return false;
        try {
            ComandiTelefono.applica(c, m);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Modo " + id + " non applicato: " + e.getMessage());
            return false;
        }
    }

    /** Applica il modo giusto per adesso (se serve) e programma la prossima sveglia. */
    static void programma(Context c) {
        android.content.SharedPreferences p = ComandiTelefono.prefs(c);
        JSONObject conf;
        try { conf = new JSONObject(p.getString("turnoAuto", "{}")); } catch (Exception e) { conf = new JSONObject(); }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(c, TurnoAuto.class).setAction(AZIONE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 77, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (!conf.optBoolean("attivo", false)) return;

        long ora = System.currentTimeMillis();
        JSONArray iv = conf.optJSONArray("intervalli");
        long dentroInizio = -1, ultimaFine = -1, prossimo = -1;
        for (int k = 0; iv != null && k < iv.length(); k++) {
            JSONArray x = iv.optJSONArray(k);
            if (x == null) continue;
            long a = x.optLong(0), b = x.optLong(1);
            if (a <= ora && ora < b) { dentroInizio = a; if (prossimo < 0 || b < prossimo) prossimo = b; }
            else if (b <= ora) { if (b > ultimaFine) ultimaFine = b; }
            else if (a > ora && (prossimo < 0 || a < prossimo)) prossimo = a;
        }

        String fatto = p.getString("turnoAutoFatto", "");
        String inTurno = conf.optString("inTurno", "lavoro");
        if (dentroInizio >= 0) {
            String chiave = "i:" + dentroInizio;
            if (!chiave.equals(fatto)) {
                String prima = ComandiTelefono.modoAttivo(c);
                if (applica(c, conf, inTurno)) {
                    p.edit().putString("turnoAutoFatto", chiave).putString("turnoAutoPrima", inTurno.equals(prima) ? "" : prima).apply();
                }
            }
        } else if (fatto.startsWith("i:")) {
            // il turno è finito: rimetto il modo di prima, solo se il modo attivo è ancora quello del turno
            String dopo = conf.optString("dopo", "");
            if (dopo.isEmpty()) dopo = p.getString("turnoAutoPrima", "");
            if (dopo.isEmpty()) dopo = "normale";
            if (inTurno.equals(ComandiTelefono.modoAttivo(c))) applica(c, conf, dopo);
            p.edit().putString("turnoAutoFatto", "f:" + ultimaFine).apply();
        }
        ComandiWidget.aggiornaTutti(c);

        if (prossimo > 0) {
            long quando = prossimo + 2000;
            boolean esatta = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
            if (esatta) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
        }
    }
}
