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
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkRequest req = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_VPN)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                .build();
            cb = new ConnectivityManager.NetworkCallback() {
                @Override public void onAvailable(Network n) { avvisaAc(true); }
                @Override public void onLost(Network n) {
                    h.postDelayed(new Runnable() { @Override public void run() { if (!vpnAttiva(VpnAutomatico.this)) avvisaAc(false); } }, 1500);
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
        if (root == null || root.getPackageName() == null || !root.getPackageName().toString().startsWith("com.fortinet")) return;

        boolean connetti = "connetti".equals(azione);
        String ritorno = p.getString("ritorno", "home");
        if (connetti == vpnAttiva(this)) { p.edit().remove("richiesta").apply(); fine(azione, ritorno); return; }

        AccessibilityNodeInfo b = cerca(root, connetti);
        if (b == null) return;
        AccessibilityNodeInfo cl = b;
        while (cl != null && !cl.isClickable()) cl = cl.getParent();
        if (cl == null || !cl.isEnabled()) return;
        if (cl.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            ultimoClic = ora;
            p.edit().remove("richiesta").apply();
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
        AccessibilityNodeInfo perId = null;
        ArrayDeque<AccessibilityNodeInfo> coda = new ArrayDeque<>();
        coda.add(root);
        int visti = 0;
        while (!coda.isEmpty() && visti++ < 600) {
            AccessibilityNodeInfo n = coda.poll();
            if (n == null) continue;
            if (n.isVisibleToUser() && parole.contains(testo(n))) return n;
            String id = n.getViewIdResourceName();
            if (perId == null && id != null && n.isVisibleToUser()) {
                String l = id.toLowerCase(Locale.ROOT);
                boolean dis = l.contains("disconnect");
                if (connetti ? (l.contains("connect") && !dis && !l.contains("status")) : dis) perId = n;
            }
            for (int i = 0; i < n.getChildCount(); i++) coda.add(n.getChild(i));
        }
        return perId;
    }

    /** Aspetta che la VPN cambi stato (max 20 s), poi torna a casa o in A&C. */
    private void attendi(final String azione, final String ritorno, final int giro) {
        h.postDelayed(new Runnable() {
            @Override public void run() {
                boolean fatto = "connetti".equals(azione) == vpnAttiva(VpnAutomatico.this);
                if (fatto) fine(azione, ritorno);
                else if (giro < 20) attendi(azione, ritorno, giro + 1);
                // altrimenti FortiClient sta chiedendo password o codice: resto lì
            }
        }, 1000);
    }

    private void fine(String azione, String ritorno) {
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
