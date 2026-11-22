package it.andreaecristina.casa.vpn;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * "VPN in un tocco": riceve eventi SOLO da FortiClient (xml/vpn_automatico.xml) e agisce solo dopo
 * una richiesta di A&C (valida 25 secondi). Preme "Connetti" o "Disconnetti"; le credenziali restano in FortiClient.
 * Se FortiClient chiede password o codice non tocca altro. Avvisa A&C quando la VPN si collega o cade
 * (A&C riaccende il DNS privato).
 */
public class VpnAutomatico extends AccessibilityService {

    static final String PKG_AC = "it.andreaecristina.casa";
    static final String PERMESSO = "it.andreaecristina.casa.permission.VPN";
    private static final List<String> CONNETTI = Arrays.asList("connetti", "connect", "collega", "connettiti");
    private static final List<String> SCOLLEGA = Arrays.asList("disconnetti", "disconnect", "scollega", "disconnettiti");
    // finestra che FortiClient mostra dopo Connetti (es. avviso sul certificato del server)
    private static final List<String> PROCEDI = Arrays.asList("proceed", "procedi", "continua", "continue", "prosegui");
    private final Handler h = new Handler(Looper.getMainLooper());
    private long ultimoClic = 0;
    private ConnectivityManager.NetworkCallback cb;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("vpn", Context.MODE_PRIVATE); }

    static boolean attivo(Context c) {
        String s = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return s != null && s.toLowerCase(Locale.ROOT).contains(c.getPackageName() + "/");
    }

    static boolean vpnAttiva(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
            }
        } catch (Exception e) { /* niente */ }
        return false;
    }

    /** Avvisa A&C: VPN su o giù (broadcast protetto dal permesso di firma). */
    private void avvisaAc(boolean su) {
        Intent i = new Intent(PKG_AC + ".VPN_EVENTO");
        i.setComponent(new ComponentName(PKG_AC, PKG_AC + ".VpnEvento"));
        i.putExtra("su", su);
        sendBroadcast(i, PERMESSO);
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        prefs(this).edit().putLong("diag_servizio", System.currentTimeMillis()).apply();
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkRequest req = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_VPN)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                .build();
            cb = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network n) {
                    avvisaAc(true);
                    h.post(new Runnable() { @Override public void run() { if ("connetti".equals(attesa)) fine("connetti", attesaRitorno); } });
                }
                @Override public void onLost(Network n) {
                    h.postDelayed(new Runnable() { @Override public void run() {
                        if (!vpnAttiva(VpnAutomatico.this)) { avvisaAc(false); if ("scollega".equals(attesa)) fine("scollega", attesaRitorno); }
                    } }, 1500);
                }
            };
            cm.registerNetworkCallback(req, cb);
        } catch (Exception e) { cb = null; }
    }

    @Override
    public void onDestroy() {
        try { if (cb != null) ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(cb); } catch (Exception e) { /* niente */ }
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        SharedPreferences p = prefs(this);
        String azione = p.getString("richiesta", "");
        if (azione.isEmpty()) return;
        long ora = System.currentTimeMillis();
        if (ora > p.getLong("scade", 0)) { p.edit().remove("richiesta").apply(); return; }
        if (ora - ultimoClic < 1500) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;
        p.edit().putString("diag_pacchetto", root.getPackageName().toString()).putLong("diag_evento", ora).apply();
        if (!root.getPackageName().toString().startsWith("com.fortinet")) return;

        String ritorno = p.getString("ritorno", "home");
        if ("conferma".equals(azione)) {
            // dopo Connetti: premo "Proceed" se compare
            AccessibilityNodeInfo pr = cercaParole(root, PROCEDI);
            if (pr == null) return;
            AccessibilityNodeInfo pc = pr;
            while (pc != null && !pc.isClickable()) pc = pc.getParent();
            if (pc != null && pc.isEnabled() && pc.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                ultimoClic = ora;
                p.edit().remove("richiesta").putString("diag_esito", p.getString("diag_esito", "") + " → premuto: " + descrivi(pr)).apply();
            }
            return;
        }
        boolean connetti = "connetti".equals(azione);
        if (connetti == vpnAttiva(this)) { p.edit().remove("richiesta").apply(); fine(azione, ritorno); return; }

        AccessibilityNodeInfo b = cerca(root, connetti);
        if (b == null) { p.edit().putString("diag_schermata", riassunto(root)).putString("diag_esito", "pulsante non trovato").apply(); return; }
        AccessibilityNodeInfo cl = b;
        while (cl != null && !cl.isClickable()) cl = cl.getParent();
        if (cl == null || !cl.isEnabled()) return;
        if (cl.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            p.edit().putString("diag_esito", "premuto: " + descrivi(b)).apply();
            ultimoClic = ora;
            // dopo Connetti resto in ascolto 20 s per il pulsante "Proceed"
            if (connetti) p.edit().putString("richiesta", "conferma").putLong("scade", ora + 20000).apply();
            else p.edit().remove("richiesta").apply();
            attendi(azione, ritorno, 0);
        }
    }

    private static String testo(AccessibilityNodeInfo n) {
        CharSequence t = n.getText();
        if (t == null || t.length() == 0) t = n.getContentDescription();
        return t == null ? "" : t.toString().trim().toLowerCase(Locale.ITALY);
    }

    /** Cerca il pulsante per testo esatto; in mancanza, per id ("connect" / "disconnect"). */
    private static AccessibilityNodeInfo cerca(AccessibilityNodeInfo root, boolean connetti) {
        List<String> parole = connetti ? CONNETTI : SCOLLEGA;
        AccessibilityNodeInfo perId = null, perSwitch = null;
        ArrayDeque<AccessibilityNodeInfo> coda = new ArrayDeque<>();
        coda.add(root);
        int visti = 0;
        while (!coda.isEmpty() && visti++ < 600) {
            AccessibilityNodeInfo n = coda.poll();
            if (n == null) continue;
            if (n.isVisibleToUser() && parole.contains(testo(n))) return n;
            // interruttore della VPN: lo tocco se è nello stato opposto (spento per collegare, acceso per scollegare)
            CharSequence cls = n.getClassName();
            if (perSwitch == null && n.isVisibleToUser() && n.isCheckable() && cls != null && cls.toString().matches(".*(Switch|Toggle|CompoundButton|CheckBox).*")
                && n.isChecked() != connetti) perSwitch = n;
            String id = n.getViewIdResourceName();
            if (perId == null && id != null && n.isVisibleToUser()) {
                String l = id.toLowerCase(Locale.ROOT);
                boolean dis = l.contains("disconnect");
                if (connetti ? (l.contains("connect") && !dis && !l.contains("status")) : dis) perId = n;
            }
            for (int i = 0; i < n.getChildCount(); i++) coda.add(n.getChild(i));
        }
        return perId != null ? perId : perSwitch;
    }

    private static AccessibilityNodeInfo cercaParole(AccessibilityNodeInfo root, List<String> parole) {
        ArrayDeque<AccessibilityNodeInfo> coda = new ArrayDeque<>();
        coda.add(root);
        int visti = 0;
        while (!coda.isEmpty() && visti++ < 600) {
            AccessibilityNodeInfo n = coda.poll();
            if (n == null) continue;
            if (n.isVisibleToUser() && parole.contains(testo(n))) return n;
            for (int i = 0; i < n.getChildCount(); i++) coda.add(n.getChild(i));
        }
        return null;
    }

    private static String descrivi(AccessibilityNodeInfo n) {
        String c = n.getClassName() == null ? "?" : n.getClassName().toString().replaceAll(".*\\.", "");
        String id = n.getViewIdResourceName() == null ? "" : n.getViewIdResourceName().replaceAll(".*/", "");
        return c + (testo(n).isEmpty() ? "" : " «" + testo(n) + "»") + (id.isEmpty() ? "" : " #" + id)
            + (n.isCheckable() ? (n.isChecked() ? " [on]" : " [off]") : "") + (n.isClickable() ? " (tocc.)" : "");
    }

    /** Riassunto della schermata di FortiClient per la diagnosi (max 40 elementi con testo, id o tocco). */
    private static String riassunto(AccessibilityNodeInfo root) {
        StringBuilder sb = new StringBuilder();
        ArrayDeque<AccessibilityNodeInfo> coda = new ArrayDeque<>();
        coda.add(root);
        int righe = 0, visti = 0;
        while (!coda.isEmpty() && visti++ < 600 && righe < 40) {
            AccessibilityNodeInfo n = coda.poll();
            if (n == null) continue;
            if (n.isVisibleToUser() && (!testo(n).isEmpty() || n.getViewIdResourceName() != null || n.isClickable() || n.isCheckable())) { sb.append(descrivi(n)).append('\n'); righe++; }
            for (int i = 0; i < n.getChildCount(); i++) coda.add(n.getChild(i));
        }
        return sb.toString();
    }

    /** Aspetta che la VPN cambi stato (max 20 s), poi torna a casa o in A&C. */
    private String attesa = null, attesaRitorno = "home"; // azione in corso, chiusa da fine()

    private void attendi(final String azione, final String ritorno, final int giro) {
        if (giro == 0) { attesa = azione; attesaRitorno = ritorno; }
        h.postDelayed(new Runnable() {
            @Override public void run() {
                if (attesa == null) return; // già chiusa dalla callback di rete
                boolean fatto = "connetti".equals(azione) == vpnAttiva(VpnAutomatico.this);
                if (fatto) fine(azione, ritorno);
                else if (giro < 60) attendi(azione, ritorno, giro + 1);
                else attesa = null; // dopo 60 s smetto di aspettare (password o codice da inserire a mano)
            }
        }, 1000);
    }

    private void fine(String azione, String ritorno) {
        attesa = null;
        prefs(this).edit().remove("richiesta").putString("diag_esito", prefs(this).getString("diag_esito", "") + " → VPN " + ("connetti".equals(azione) ? "collegata" : "scollegata")).apply();
        Toast.makeText(this, "connetti".equals(azione) ? "🛡️ VPN collegata" : "VPN scollegata", Toast.LENGTH_SHORT).show();
        Intent app = "app".equals(ritorno) ? getPackageManager().getLaunchIntentForPackage(PKG_AC) : null;
        if (app != null) {
            app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(app);
        } else {
            performGlobalAction(GLOBAL_ACTION_HOME);
        }
    }

    @Override
    public void onInterrupt() { }
}
