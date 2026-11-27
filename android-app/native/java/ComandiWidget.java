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
 * Widget unico "A&C Comandi": il modo attivo (un tocco apre l'elenco a comparsa dei modi), poi 3 colonne su 2 righe:
 * rotazione schermo, sveglie (elenco dell'orologio), luce (accendi/spegni) / VPN e DNS privato (solo Andrea), colori luci (LuciPopup).
 * I modi arrivano dall'app in SharedPreferences "CapacitorStorage", chiave "comandi":
 * { modi: [ {id, nome, icona, suoneria, dnd, rotazione, volumi} ], andrea: true, dnsHost: "dns.example.it" }
 */
public class ComandiWidget extends AppWidgetProvider {

    static final String AZIONE = "it.andreaecristina.casa.COMANDO";
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) disegna(context, manager, id);
        // ogni mezz'ora (e quando lo aggiungi) riallineo lo stato delle luci
        if (LuciWidget.elenco(context).length() > 0) {
            final PendingResult pr = goAsync();
            final Context app = context.getApplicationContext();
            new Thread(() -> { try { LuciWidget.riallinea(app); } finally { pr.finish(); } }).start();
        }
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
    static String attivoVero(Context c, JSONArray modi) {
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
        ComandiTelefono.ripristinaDns(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_comandi);
        JSONObject conf = ComandiTelefono.configurazione(c);
        JSONArray modi = conf.optJSONArray("modi");
        String attivo = attivoVero(c, modi);

        // tasto del modo: mostra quello attivo, il tocco apre l'elenco a comparsa (ModiPopup)
        JSONObject mAtt = null;
        for (int i = 0; modi != null && i < modi.length(); i++) { JSONObject m = modi.optJSONObject(i); if (m != null && m.optString("id").equals(attivo)) mAtt = m; }
        v.setTextViewText(R.id.c_modo_i, mAtt != null ? mAtt.optString("icona", "🔔") : "🔈");
        v.setTextViewText(R.id.c_modo_t, mAtt != null ? mAtt.optString("nome", "Modo") : (modi == null || modi.length() == 0 ? "Apri A&C" : "Nessun modo"));
        v.setInt(R.id.c_modo, "setBackgroundResource", mAtt != null ? R.drawable.widget_tasto_attivo : R.drawable.widget_tasto);
        Intent pop = new Intent(c, (modi == null || modi.length() == 0) ? MainActivity.class : ModiPopup.class);
        // ModiPopup vive in un task a parte (taskAffinity ""), quindi CLEAR_TASK non chiude l'app
        pop.addFlags((modi == null || modi.length() == 0) ? Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP : Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        v.setOnClickPendingIntent(R.id.c_modo, PendingIntent.getActivity(c, 98, pop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        boolean auto = "auto".equals(ComandiTelefono.rotazione(c));
        v.setTextViewText(R.id.c_rot_i, auto ? "🔄" : "🔒");
        v.setTextViewText(R.id.c_rot_t, auto ? "Auto" : "Bloccata");
        v.setOnClickPendingIntent(R.id.c_rot, comando(c, 10, "rotazione", null));

        v.setOnClickPendingIntent(R.id.c_sveglie, PendingIntent.getActivity(c, 113, ComandiTelefono.intentElencoSveglie(), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        // luce: tocco = accendi/spegni la prima luce con ★ (o l'ultima scelta nei colori)
        Intent apriApp = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent piApp = PendingIntent.getActivity(c, 114, apriApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        JSONObject luce = LuciWidget.prima(c);
        if (luce == null) {
            v.setTextViewText(R.id.c_luce_i, "💡");
            v.setTextViewText(R.id.c_luce_t, "Luci");
            v.setInt(R.id.c_luce, "setBackgroundResource", R.drawable.widget_tasto);
            v.setOnClickPendingIntent(R.id.c_luce, piApp);
            v.setOnClickPendingIntent(R.id.c_colori, piApp);
        } else {
            boolean on = luce.optBoolean("acceso"), online = luce.optBoolean("online", true);
            v.setTextViewText(R.id.c_luce_i, !online ? "⚠️" : on ? "💡" : "🔅");
            v.setTextViewText(R.id.c_luce_t, luce.optString("nome", "Luce"));
            v.setInt(R.id.c_luce, "setBackgroundResource", on ? R.drawable.widget_tasto_luce : R.drawable.widget_tasto);
            v.setOnClickPendingIntent(R.id.c_luce, comando(c, 14, "luce", null));
            Intent col = new Intent(c, LuciPopup.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            v.setOnClickPendingIntent(R.id.c_colori, PendingIntent.getActivity(c, 115, col, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        // TV: telecomando a comparsa e accendi/spegni
        boolean tvOk = !TvCasa.conf(c).optString("chiave").isEmpty();
        Intent tvi = tvOk ? new Intent(c, TvPopup.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK) : apriApp;
        v.setOnClickPendingIntent(R.id.c_tv, PendingIntent.getActivity(c, 116, tvi, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        v.setOnClickPendingIntent(R.id.c_tvon, tvOk ? comando(c, 15, "tvon", null) : piApp);
        v.setTextViewText(R.id.c_tvon_t, "Acc./Spegni");

        boolean andrea = conf.optBoolean("andrea", false);
        // VPN solo sul telefono di Andrea (altrove resta lo spazio vuoto); DNS per tutti
        v.setViewVisibility(R.id.c_vpn, andrea ? View.VISIBLE : View.INVISIBLE);
        v.setViewVisibility(R.id.c_dns, View.VISIBLE);
        if (andrea) {
            boolean vpn = ComandiTelefono.vpnAttiva(c);
            v.setTextViewText(R.id.c_vpn_t, vpn ? "VPN attiva" : "VPN spenta");
            v.setInt(R.id.c_vpn, "setBackgroundResource", vpn ? R.drawable.widget_tasto_attivo : R.drawable.widget_tasto);
            // il tocco passa da ModiPopup: spegne il DNS se serve, apre FortiClient e (con "VPN in un tocco") preme Connetti/Disconnetti
            Intent vi = new Intent(c, ModiPopup.class).putExtra("vpn", true);
            vi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            v.setOnClickPendingIntent(R.id.c_vpn, PendingIntent.getActivity(c, 111, vi, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        {
            boolean dns = "host".equals(ComandiTelefono.dnsModo(c));
            boolean pausa = !ComandiTelefono.prefs(c).getString("dnsDaRipristinare", "").isEmpty();
            v.setTextViewText(R.id.c_dns_t, dns ? "DNS attivo" : pausa ? "DNS in pausa" : "DNS disattivato");
            // colorato quando il DNS privato è disattivato (o in pausa per la VPN), normale quando è attivo
            v.setInt(R.id.c_dns, "setBackgroundResource", dns ? R.drawable.widget_tasto : R.drawable.widget_tasto_attivo);
            v.setOnClickPendingIntent(R.id.c_dns, comando(c, 12, "dns", null));
        }
        manager.updateAppWidget(widgetId, v);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (!AZIONE.equals(intent.getAction())) return;
        String cmd = intent.getStringExtra("cmd");
        if ("tvon".equals(cmd)) {
            final PendingResult pr = goAsync();
            final Context app = c.getApplicationContext();
            new Thread(() -> {
                String msg;
                try { msg = TvCasa.accendiSpegni(app); } catch (Exception e) { msg = e.getMessage(); }
                LuciWidget.avviso(app, msg);
                pr.finish();
            }).start();
            return;
        }
        if ("luce".equals(cmd)) {
            final PendingResult pr = goAsync();
            LuciWidget.accendiSpegni(c.getApplicationContext(), pr::finish);
            return;
        }
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
                ComandiTelefono.impostaDns(c, acceso ? "off" : "host", host);
                ComandiTelefono.prefs(c).edit().remove("dnsDaRipristinare").putBoolean("dnsManualeOff", acceso).apply();
                Toast.makeText(c, acceso ? "DNS privato disattivato" : "DNS privato: " + host, Toast.LENGTH_SHORT).show();
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
