package it.andreaecristina.casa;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/**
 * Eventi da A&C VPN (protetti dal permesso di firma): { su: true } VPN collegata, { su: false } VPN caduta.
 * Quando la VPN cade riaccende il DNS privato spento per la VPN e ridisegna il widget.
 */
public class VpnEvento extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (i.getBooleanExtra("su", false)) {
            ComandiTelefono.prefs(c).edit().putBoolean("vpnVista", true).apply();
        } else if (ComandiTelefono.ripristinaDns(c)) {
            Toast.makeText(c, "DNS privato riattivato", Toast.LENGTH_SHORT).show();
        }
        ComandiWidget.aggiornaTutti(c);
    }
}
