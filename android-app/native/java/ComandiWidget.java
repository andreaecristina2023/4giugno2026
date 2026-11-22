package it.andreaecristina.casa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Widget "A&C Comandi": fino a 5 modi audio (il primo tocco applica il modo), poi rotazione schermo
 * e, sul telefono di Andrea, VPN (apre FortiClient) e DNS privato (acceso/spento).
 * I modi arrivano dall'app in SharedPreferences "CapacitorStorage", chiave "comandi":
 * { modi: [ {id, nome, icona, suoneria, dnd, rotazione, volumi} ], andrea: true, dnsHost: "dns.example.it" }
 */
public class ComandiWidget extends AppWidgetProvider {

    static final String AZIONE = "it.andreaecristina.casa.COMANDO";
    private static final int[] MODI = { R.id.c_m1, R.id.c_m2, R.id.c_m3, R.id.c_m4, R.id.c_m5 };
    private static final int[] MODI_I = { R.id.c_m1_i, R.id.c_m2_i, R.id.c_m3_i, R.id.c_m4_i, R.id.c_m5_i };
    private static final int[] MODI_T = { R.id.c_m1_t, R.id.c_m2_t, R.id.c_m3_t, R.id.c_m4_t, R.id.c_m5_t };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) disegna(context, manager, id);
    }

    public static void aggiornaTutti(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, ComandiWidget.class));
        for (int id : ids) disegna(context, manager, id);
    }

    private static PendingIntent comando(Context c, int codice, String cmd, String id) {
        Intent i = new Intent(c, ComandiWidget.class);
        i.setAction(AZIONE);
        i.putExtra("cmd", cmd);
        if (id != null) i.putExtra("id", id);
        return PendingIntent.getBroadcast(c, 100 + codice, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Il modo segnato come attivo vale solo se suoneria e Non disturbare non sono stati cambiati a mano. */
    private static String attivoVero(Context c, JSONArray modi) {
        String id = ComandiTelefono.modoAttivo(c);
        if (id.isEmpty() || modi == null) return "";
        for (int i = 0; i < modi.length(); i++) {
            JSONObject m = modi.optJSONObject(i);
            if (m == null || !id.equals(m.optString("id"))) continue;
            String s = m.optString("suoneria", ""), d = m.optString("dnd", "");
            if (!s.isEmpty() && !s.equals(ComandiTelefono.suoneria(c))) return "";
            if (!d.isEmpty() && !d.equals(ComandiTelefono.dnd(c))) return "";
            return id;
        }
        return "";
    }

    static void disegna(Context c, AppWidgetManager manager, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_comandi);
        JSONObject conf = ComandiTelefono.configurazione(c);
        JSONArray modi = conf.optJSONArray("modi");
        String attivo = attivoVero(c, modi);

        int n = 0;
        for (int i = 0; modi != null && i < modi.length() && n < MODI.length; i++) {
            JSONObject m = modi.optJSONObject(i);
            if (m == null) continue;
            String id = m.optString("id");
            v.setViewVisibility(MODI[n], View.VISIBLE);
            v.setTextViewText(MODI_I[n], m.optString("icona", "🔔"));
            v.setTextViewText(MODI_T[n], m.optString("nome", "Modo"));
            v.setInt(MODI[n], "setBackgroundResource", id.equals(attivo) ? R.drawable.widget_tasto_attivo : R.drawable.widget_tasto);
            v.setOnClickPendingIntent(MODI[n], comando(c, n, "modo", id));
            n++;
        }
        if (n == 0) {
            // l'app non ha ancora salvato i modi: il tasto apre l'app
            Intent apri = new Intent(c, MainActivity.class);
            apri.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            v.setViewVisibility(MODI[0], View.VISIBLE);
            v.setTextViewText(MODI_I[0], "🔔");
            v.setTextViewText(MODI_T[0], "Apri A&C");
            v.setOnClickPendingIntent(MODI[0], PendingIntent.getActivity(c, 99, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        for (int k = Math.max(n, 1); k < MODI.length; k++) v.setViewVisibility(MODI[k], View.GONE);

        boolean auto = "auto".equals(ComandiTelefono.rotazione(c));
        v.setTextViewText(R.id.c_rot_i, auto ? "🔄" : "🔒");
        v.setTextViewText(R.id.c_rot_t, auto ? "Ruota: auto" : "Ruota: bloccata");
        v.setOnClickPendingIntent(R.id.c_rot, comando(c, 10, "rotazione", null));

        boolean andrea = conf.optBoolean("andrea", false);
        v.setViewVisibility(R.id.c_vpn, andrea ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.c_dns, andrea ? View.VISIBLE : View.GONE);
        if (andrea) {
            boolean vpn = ComandiTelefono.vpnAttiva(c);
            v.setTextViewText(R.id.c_vpn_t, vpn ? "VPN attiva" : "FortiClient");
            v.setInt(R.id.c_vpn, "setBackgroundResource", vpn ? R.drawable.widget_tasto_attivo : R.drawable.widget_tasto);
            v.setOnClickPendingIntent(R.id.c_vpn, PendingIntent.getActivity(c, 111, ComandiTelefono.intentFortiClient(c), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            boolean dns = "host".equals(ComandiTelefono.dnsModo(c));
            v.setTextViewText(R.id.c_dns_t, dns ? "DNS attivo" : "DNS spento");
            v.setInt(R.id.c_dns, "setBackgroundResource", dns ? R.drawable.widget_tasto_attivo : R.drawable.widget_tasto);
            v.setOnClickPendingIntent(R.id.c_dns, comando(c, 12, "dns", null));
        }
        manager.updateAppWidget(widgetId, v);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (!AZIONE.equals(intent.getAction())) return;
        String cmd = intent.getStringExtra("cmd");
        try {
            if ("modo".equals(cmd)) {
                String id = intent.getStringExtra("id");
                JSONArray modi = ComandiTelefono.configurazione(c).optJSONArray("modi");
                for (int i = 0; modi != null && i < modi.length(); i++) {
                    JSONObject m = modi.optJSONObject(i);
                    if (m == null || !m.optString("id").equals(id)) continue;
                    JSONObject r = ComandiTelefono.applica(c, m);
                    JSONArray saltati = r.optJSONArray("saltati");
                    String extra = "";
                    for (int k = 0; saltati != null && k < saltati.length(); k++) if ("rotazione".equals(saltati.optString(k))) extra = " (rotazione: serve un permesso, apri A&C)";
                    Toast.makeText(c, m.optString("icona", "") + " " + m.optString("nome", "Modo") + " attivo" + extra, Toast.LENGTH_SHORT).show();
                    break;
                }
            } else if ("rotazione".equals(cmd)) {
                if (!ComandiTelefono.permessoSistema(c)) {
                    Toast.makeText(c, "Per la rotazione apri A&C e concedi il permesso", Toast.LENGTH_LONG).show();
                } else {
                    boolean auto = "auto".equals(ComandiTelefono.rotazione(c));
                    ComandiTelefono.impostaRotazione(c, auto ? "bloccata" : "auto");
                    Toast.makeText(c, auto ? "Rotazione bloccata" : "Rotazione automatica", Toast.LENGTH_SHORT).show();
                }
            } else if ("dns".equals(cmd)) {
                boolean acceso = "host".equals(ComandiTelefono.dnsModo(c));
                String host = ComandiTelefono.configurazione(c).optString("dnsHost", "");
                ComandiTelefono.impostaDns(c, acceso ? "auto" : "host", host);
                Toast.makeText(c, acceso ? "DNS privato spento" : "DNS privato: " + host, Toast.LENGTH_SHORT).show();
            }
        } catch (ComandiTelefono.Errore e) {
            String msg = "PERMESSO_DND".equals(e.codice) ? "Serve l'accesso a Non disturbare: apri A&C e tocca di nuovo il modo"
                : "PERMESSO_DNS".equals(e.codice) ? "DNS: serve il permesso dal computer (vedi A&C → Modi)"
                : e.getMessage();
            Toast.makeText(c, msg, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(c, "Comando non riuscito", Toast.LENGTH_SHORT).show();
        }
        aggiornaTutti(c);
    }
}
