package it.andreaecristina.casa;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONObject;

/**
 * Luce con la sveglia del turnario. Impostazioni in "sveglieTurno" → luce:
 * { modo: "no" | "insieme" | "alba", id: "" (vuoto = la luce del widget), minuti: 10, luminosita: 70, temperatura: 25 }
 * - "insieme": quando suona la sveglia la luce si accende in bianco (temperatura e luminosità scelte);
 * - "alba": "minuti" prima della sveglia si accende arancio al minimo e sale piano fino al bianco pieno all'ora della sveglia.
 * L'alba gira in un servizio in primo piano (notifica silenziosa con "Ferma"), un passo ogni 20 secondi.
 */
public class AlbaLuce extends Service {

    static final String AVVIA = "it.andreaecristina.casa.ALBA_AVVIA";
    static final String FERMA = "it.andreaecristina.casa.ALBA_FERMA";
    static final String CANALE = "casa-alba";
    static final int ID_NOTIFICA = 4250;
    static volatile boolean attiva = false;

    private volatile boolean ferma = false;
    private PowerManager.WakeLock wl;

    @Override public IBinder onBind(Intent i) { return null; }

    static JSONObject conf(Context c) {
        try { JSONObject l = new JSONObject(ComandiTelefono.prefs(c).getString("sveglieTurno", "{}")).optJSONObject("luce"); return l == null ? new JSONObject() : l; }
        catch (Exception e) { return new JSONObject(); }
    }
    static String modo(Context c) { return conf(c).optString("modo", "no"); }
    static String idLuce(Context c, JSONObject l) {
        String id = l.optString("id", "");
        if (id.isEmpty()) { JSONObject p = LuciWidget.prima(c); id = p != null ? p.optString("id") : ""; }
        return id;
    }

    static void avvia(Context c, long t) {
        Intent i = new Intent(c, AlbaLuce.class).setAction(AVVIA).putExtra("t", t);
        try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); } catch (Exception e) { /* non consentito: niente alba */ }
    }

    /** Alla sveglia: accende la luce (modo "insieme"), o la porta al bianco pieno se l'alba non sta già girando. */
    static void allaSveglia(Context c) {
        final JSONObject l = conf(c);
        String m = l.optString("modo", "no");
        if ("no".equals(m) || attiva) return;
        final Context app = c.getApplicationContext();
        new Thread(() -> finale(app, l)).start();
    }

    static void finale(Context c, JSONObject l) {
        String id = idLuce(c, l);
        if (id.isEmpty()) return;
        try {
            LuciWidget.comanda(c, id, new JSONObject().put("acceso", true).put("temperatura", l.optInt("temperatura", 25)).put("luminosita", l.optInt("luminosita", 70)));
        } catch (Exception e) {
            // ritento una volta (la luce a volte rifiuta un secondo collegamento ravvicinato)
            try { Thread.sleep(3000); LuciWidget.comanda(c, id, new JSONObject().put("acceso", true).put("luminosita", l.optInt("luminosita", 70))); } catch (Exception ignored) { }
        }
        LuciWidget.aggiornaDopo(c);
    }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        if (i != null && FERMA.equals(i.getAction())) { ferma = true; stopSelf(); return START_NOT_STICKY; }
        final long t = i == null ? System.currentTimeMillis() : i.getLongExtra("t", System.currentTimeMillis());
        Notification n = notifica(t);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID_NOTIFICA, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID_NOTIFICA, n);
        if (attiva) return START_NOT_STICKY;
        attiva = true; ferma = false;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) { wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aec:alba"); wl.acquire(Math.max(60000, t - System.currentTimeMillis() + 60000)); }
        final Context app = getApplicationContext();
        new Thread(() -> {
            try { alba(app, t); } finally { attiva = false; stopSelf(); }
        }).start();
        return START_NOT_STICKY;
    }

    /** Arancio al minimo → arancio più chiaro (prima metà) → bianco caldo che sale fino a luminosità e tono scelti. */
    void alba(Context c, long t) {
        JSONObject l = conf(c);
        String id = idLuce(c, l);
        if (id.isEmpty()) return;
        int lumFin = l.optInt("luminosita", 70), tempFin = l.optInt("temperatura", 25);
        long inizio = System.currentTimeMillis(), durata = Math.max(20000, t - inizio);
        int errori = 0;
        while (!ferma) {
            long ora = System.currentTimeMillis();
            double p = Math.min(1, (ora - inizio) / (double) durata);
            JSONObject cmd = new JSONObject();
            try {
                if (p >= 1) cmd.put("acceso", true).put("temperatura", tempFin).put("luminosita", lumFin);
                else if (p < 0.5) {
                    double q = p / 0.5;
                    cmd.put("acceso", true).put("colore", new JSONObject().put("h", (int) Math.round(18 + 17 * q)).put("s", 100)).put("luminosita", Math.max(1, (int) Math.round(1 + 34 * q)));
                } else {
                    double q = (p - 0.5) / 0.5;
                    cmd.put("acceso", true).put("temperatura", (int) Math.round(tempFin * q)).put("luminosita", (int) Math.round(20 + (lumFin - 20) * q));
                }
                LuciWidget.comanda(c, id, cmd);
                errori = 0;
            } catch (Exception e) {
                if (++errori >= 4) break; // fuori casa o luce spenta dall'interruttore: lascio stare
            }
            if (p >= 1) break;
            long resta = t - System.currentTimeMillis();
            try { Thread.sleep(Math.max(1000, Math.min(20000, resta))); } catch (InterruptedException e) { break; }
        }
        LuciWidget.aggiornaDopo(c);
    }

    private Notification notifica(long t) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CANALE) == null) {
            NotificationChannel ch = new NotificationChannel(CANALE, "Luce della sveglia", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("La luce che si accende piano prima della sveglia del turnario");
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }
        String ora = new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).format(new java.util.Date(t));
        PendingIntent stop = PendingIntent.getService(this, 4251, new Intent(this, AlbaLuce.class).setAction(FERMA), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANALE) : new Notification.Builder(this);
        return b.setSmallIcon(getResources().getIdentifier("ic_stat_casa", "drawable", getPackageName()))
            .setContentTitle("🌅 Alba per la sveglia delle " + ora)
            .setContentText("La luce si accende piano")
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "Ferma la luce", stop).build())
            .build();
    }

    @Override
    public void onDestroy() {
        ferma = true;
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception ignored) { }
        super.onDestroy();
    }
}
