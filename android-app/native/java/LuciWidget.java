package it.andreaecristina.casa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Widget "A&C Luci": fino a 6 luci Tuya (un tocco = accendi/spegni, colorata se accesa) e una scena.
 * Se le luci sono state lette in modalità locale le comanda sul Wi-Fi di casa (LuciLocali), altrimenti chiama lo script del foglio di casa (cloud Tuya).
 * Dati dall'app in SharedPreferences "CapacitorStorage", chiave "luci":
 * { url, chiave, chi, luci: [ { id, nome, acceso, online } ], scena: { casa, scena, nome } | null }
 */
public class LuciWidget extends AppWidgetProvider {

    static final String AZIONE = "it.andreaecristina.casa.LUCE";
    private static final int[] TASTI = { R.id.l_1, R.id.l_2, R.id.l_3, R.id.l_4, R.id.l_5, R.id.l_6 };
    private static final int[] ICONE = { R.id.l_1_i, R.id.l_2_i, R.id.l_3_i, R.id.l_4_i, R.id.l_5_i, R.id.l_6_i };
    private static final int[] NOMI = { R.id.l_1_t, R.id.l_2_t, R.id.l_3_t, R.id.l_4_t, R.id.l_5_t, R.id.l_6_t };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    static JSONObject dati(Context c) {
        try { return new JSONObject(prefs(c).getString("luci", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static void salva(Context c, JSONObject d) { prefs(c).edit().putString("luci", d.toString()).apply(); }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) disegna(context, manager, id);
        // ogni mezz'ora (e quando lo aggiungi) riallineo lo stato delle luci
        final PendingResult pr = goAsync();
        new Thread(() -> { try { riallinea(context); } finally { pr.finish(); } }).start();
    }

    public static void aggiornaTutti(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, LuciWidget.class))) disegna(c, m, id);
    }

    private static PendingIntent comando(Context c, int codice, String cmd, String id) {
        Intent i = new Intent(c, LuciWidget.class).setAction(AZIONE).putExtra("cmd", cmd);
        if (id != null) i.putExtra("id", id);
        return PendingIntent.getBroadcast(c, 200 + codice, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void disegna(Context c, AppWidgetManager manager, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_luci);
        JSONObject d = dati(c);
        JSONArray luci = d.optJSONArray("luci");
        int n = 0;
        for (int i = 0; luci != null && i < luci.length() && n < TASTI.length; i++) {
            JSONObject l = luci.optJSONObject(i);
            if (l == null) continue;
            boolean acceso = l.optBoolean("acceso"), online = l.optBoolean("online", true);
            v.setViewVisibility(TASTI[n], View.VISIBLE);
            v.setTextViewText(ICONE[n], online ? (acceso ? "💡" : "🔅") : "⚠️");
            v.setTextViewText(NOMI[n], l.optString("nome", "Luce"));
            v.setInt(TASTI[n], "setBackgroundResource", acceso ? R.drawable.widget_tasto_luce : R.drawable.widget_tasto);
            v.setOnClickPendingIntent(TASTI[n], comando(c, n, "luce", l.optString("id")));
            n++;
        }
        for (int k = n; k < TASTI.length; k++) v.setViewVisibility(TASTI[k], k < 3 && n == 0 ? View.INVISIBLE : View.GONE);
        v.setViewVisibility(R.id.l_riga2, n > 3 ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.l_vuoto, n == 0 ? View.VISIBLE : View.GONE);

        JSONObject sc = d.optJSONObject("scena");
        v.setViewVisibility(R.id.l_scena, sc != null ? View.VISIBLE : View.GONE);
        if (sc != null) {
            v.setTextViewText(R.id.l_scena_t, "▶ " + sc.optString("nome", "Scena"));
            v.setOnClickPendingIntent(R.id.l_scena, comando(c, 10, "scena", null));
        }
        Intent apri = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.l_apri, PendingIntent.getActivity(c, 211, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(widgetId, v);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (!AZIONE.equals(intent.getAction())) return;
        final String cmd = intent.getStringExtra("cmd"), id = intent.getStringExtra("id");
        final Context app = c.getApplicationContext();
        final PendingResult pr = goAsync();
        if ("luce".equals(cmd) && id != null) {
            // subito il nuovo stato nel widget, poi il comando allo script
            final boolean nuovo = !statoDi(app, id);
            impostaStato(app, id, nuovo, true);
            aggiornaTutti(app);
            new Thread(() -> {
                try {
                    JSONObject l;
                    if (LuciLocali.trova(app, id) != null) l = LuciLocali.comando(app, id, new JSONObject().put("acceso", nuovo)); // sul Wi-Fi di casa
                    else l = chiama(app, new JSONObject().put("azione", "luce_comando").put("id", id).put("acceso", nuovo)).optJSONObject("luce");
                    if (l != null) impostaStato(app, id, l.optBoolean("acceso", nuovo), l.optBoolean("online", true));
                } catch (Exception e) {
                    impostaStato(app, id, !nuovo, true);
                    avviso(app, e.getMessage());
                } finally {
                    new Handler(Looper.getMainLooper()).post(() -> aggiornaTutti(app));
                    pr.finish();
                }
            }).start();
        } else if ("scena".equals(cmd)) {
            new Thread(() -> {
                try {
                    JSONObject sc = dati(app).optJSONObject("scena");
                    if (sc == null) throw new Exception("Scegli una scena nell'app (💡 Luci → ☆)");
                    chiama(app, new JSONObject().put("azione", "scena_avvia").put("casa", sc.optString("casa")).put("scena", sc.optString("scena")));
                    avviso(app, "▶ " + sc.optString("nome", "Scena") + " avviata");
                    Thread.sleep(1500);
                    riallinea(app);
                } catch (Exception e) {
                    avviso(app, e.getMessage());
                } finally {
                    pr.finish();
                }
            }).start();
        } else {
            pr.finish();
        }
    }

    private static boolean statoDi(Context c, String id) {
        JSONArray l = dati(c).optJSONArray("luci");
        for (int i = 0; l != null && i < l.length(); i++) { JSONObject x = l.optJSONObject(i); if (x != null && id.equals(x.optString("id"))) return x.optBoolean("acceso"); }
        return false;
    }

    private static synchronized void impostaStato(Context c, String id, boolean acceso, boolean online) {
        try {
            JSONObject d = dati(c);
            JSONArray l = d.optJSONArray("luci");
            for (int i = 0; l != null && i < l.length(); i++) {
                JSONObject x = l.optJSONObject(i);
                if (x != null && id.equals(x.optString("id"))) { x.put("acceso", acceso); x.put("online", online); }
            }
            salva(c, d);
        } catch (Exception e) { /* niente */ }
    }

    /** Rilegge lo stato di tutte le luci dallo script e aggiorna il widget (in un thread). */
    static void riallinea(Context c) {
        try {
            JSONObject d = dati(c);
            if (d.optJSONArray("luci") == null || d.optJSONArray("luci").length() == 0) return;
            JSONObject r;
            if (LuciLocali.configurato(c)) r = LuciLocali.elenco(c);
            else if (d.optString("url").isEmpty()) return;
            else r = chiama(c, new JSONObject().put("azione", "luci_elenco"));
            JSONArray tutte = r.optJSONArray("luci");
            for (int i = 0; tutte != null && i < tutte.length(); i++) {
                JSONObject l = tutte.optJSONObject(i);
                if (l != null) impostaStato(c, l.optString("id"), l.optBoolean("acceso"), l.optBoolean("online", true));
            }
            new Handler(Looper.getMainLooper()).post(() -> aggiornaTutti(c));
        } catch (Exception e) { /* offline: resta lo stato di prima */ }
    }

    /** POST allo script di casa come fa il sito (Store.chiama): { chiave, azione, chi, ... }. */
    static JSONObject chiama(Context c, JSONObject corpo) throws Exception {
        JSONObject d = dati(c);
        String url = d.optString("url");
        if (url.isEmpty()) throw new Exception("Apri A&C → 💡 Luci una volta per preparare il widget");
        corpo.put("chiave", d.optString("chiave"));
        corpo.put("chi", d.optString("chi"));
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setInstanceFollowRedirects(true);
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
        try (OutputStream os = con.getOutputStream()) { os.write(corpo.toString().getBytes(StandardCharsets.UTF_8)); }
        int codice = con.getResponseCode();
        // lo script risponde con un rinvio (302) a googleusercontent: lo seguo a mano se Java non lo fa
        if (codice == 301 || codice == 302 || codice == 303 || codice == 307) {
            String dove = con.getHeaderField("Location");
            con.disconnect();
            con = (HttpURLConnection) new URL(dove).openConnection();
            con.setConnectTimeout(15000);
            con.setReadTimeout(30000);
            codice = con.getResponseCode();
        }
        if (codice != 200) throw new Exception("Lo script ha risposto " + codice);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = con.getInputStream()) { byte[] b = new byte[8192]; int k; while ((k = in.read(b)) > 0) out.write(b, 0, k); }
        con.disconnect();
        JSONObject r = new JSONObject(out.toString("UTF-8"));
        if (!r.optBoolean("ok")) {
            String err = r.optString("errore", "Errore dallo script");
            if (err.contains("Azione sconosciuta")) err = "Aggiorna lo script del foglio (README, «Aggiornare lo script»)";
            if (err.contains("TUYA_NON_CONFIGURATO")) err = "Collega Tuya in A&C → 💡 Luci → ⚙";
            throw new Exception(err);
        }
        return r;
    }

    private static void avviso(Context c, String testo) {
        final String t = testo == null || testo.isEmpty() ? "Nessuna connessione" : testo;
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c, t, Toast.LENGTH_SHORT).show());
    }
}
