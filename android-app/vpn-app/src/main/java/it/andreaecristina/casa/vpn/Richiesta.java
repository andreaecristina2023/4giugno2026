package it.andreaecristina.casa.vpn;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Richiesta da A&C (solo app con la stessa firma): { azione: "connetti"|"scollega", ritorno: "home"|"app" }. */
public class Richiesta extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String azione = i.getStringExtra("azione");
        if (!"connetti".equals(azione) && !"scollega".equals(azione)) return;
        VpnAutomatico.prefs(c).edit()
            .putString("richiesta", azione)
            .putLong("scade", System.currentTimeMillis() + 25000)
            .putString("ritorno", "app".equals(i.getStringExtra("ritorno")) ? "app" : "home")
            .putLong("diag_richiesta", System.currentTimeMillis()).putString("diag_azione", azione)
            .putString("diag_esito", "in attesa di FortiClient").remove("diag_schermata")
            .apply();
    }
}
