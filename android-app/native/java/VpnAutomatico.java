package it.andreaecristina.casa;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.Toast;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * "VPN in un tocco": servizio di accessibilità che riceve eventi SOLO da FortiClient (vedi xml/vpn_automatico.xml)
 * e agisce solo dopo un tocco dell'utente sul tasto VPN di A&C (richiesta valida 25 secondi).
 * Preme "Connetti" o "Disconnetti"; le credenziali restano salvate in FortiClient, A&C non le legge.
 * Se FortiClient chiede password o codice, non tocca altro e lascia fare all'utente.
 */
public class VpnAutomatico extends AccessibilityService {

    private static final List<String> CONNETTI = Arrays.asList("connetti", "connect", "collega", "connettiti");
    private static final List<String> SCOLLEGA = Arrays.asList("disconnetti", "disconnect", "scollega", "disconnettiti");
    private final Handler h = new Handler(Looper.getMainLooper());
    private long ultimoClic = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        SharedPreferences p = ComandiTelefono.prefs(this);
        String azione = p.getString("vpnRichiesta", "");
        if (azione.isEmpty()) return;
        long ora = System.currentTimeMillis();
        if (ora > p.getLong("vpnScade", 0)) { p.edit().remove("vpnRichiesta").apply(); return; }
        if (ora - ultimoClic < 1500) return;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !root.getPackageName().toString().startsWith("com.fortinet")) return;

        boolean connetti = "connetti".equals(azione);
        // già nello stato voluto (es. la VPN si è collegata da sola): non tocco nulla
        if (connetti == ComandiTelefono.vpnAttiva(this)) { p.edit().remove("vpnRichiesta").apply(); fine(azione, p.getString("vpnRitorno", "home"), true); return; }

        AccessibilityNodeInfo b = cerca(root, connetti);
        if (b == null) return;
        AccessibilityNodeInfo cl = b;
        while (cl != null && !cl.isClickable()) cl = cl.getParent();
        if (cl == null || !cl.isEnabled()) return;
        if (cl.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
            ultimoClic = ora;
            String ritorno = p.getString("vpnRitorno", "home");
            p.edit().remove("vpnRichiesta").apply();
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
                boolean su = ComandiTelefono.vpnAttiva(VpnAutomatico.this);
                boolean fatto = "connetti".equals(azione) == su;
                if (fatto) fine(azione, ritorno, false);
                else if (giro < 20) attendi(azione, ritorno, giro + 1);
                else ComandiWidget.aggiornaTutti(VpnAutomatico.this); // password o codice da inserire: resto in FortiClient
            }
        }, 1000);
    }

    private void fine(String azione, String ritorno, boolean giaFatto) {
        ComandiWidget.aggiornaTutti(this);
        Toast.makeText(this, "connetti".equals(azione) ? "🛡️ VPN collegata" : "VPN scollegata", Toast.LENGTH_SHORT).show();
        if ("app".equals(ritorno)) {
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        } else {
            performGlobalAction(GLOBAL_ACTION_HOME);
        }
    }

    // Finché il servizio è attivo segue la VPN: quando cade (anche scollegata a mano in FortiClient) riaccende il DNS privato.
    private ConnectivityManager.NetworkCallback cb;

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
                @Override public void onAvailable(Network n) {
                    ComandiTelefono.prefs(VpnAutomatico.this).edit().putBoolean("vpnVista", true).apply();
                    h.post(new Runnable() { @Override public void run() { ComandiWidget.aggiornaTutti(VpnAutomatico.this); } });
                }
                @Override public void onLost(Network n) {
                    // piccolo ritardo: Android impiega un attimo a togliere la VPN
                    h.postDelayed(new Runnable() { @Override public void run() {
                        if (ComandiTelefono.ripristinaDns(VpnAutomatico.this))
                            Toast.makeText(VpnAutomatico.this, "DNS privato riattivato", Toast.LENGTH_SHORT).show();
                        ComandiWidget.aggiornaTutti(VpnAutomatico.this);
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
    public void onInterrupt() { }
}
