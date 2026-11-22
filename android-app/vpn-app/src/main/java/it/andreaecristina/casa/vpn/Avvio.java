package it.andreaecristina.casa.vpn;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Schermata dell'icona "A&C VPN": stato del servizio, diagnosi dell'ultimo tentativo, link all'Accessibilità. */
public class Avvio extends Activity {
    private static String ora(long t) { return t == 0 ? "mai" : new SimpleDateFormat("dd/MM HH:mm:ss", Locale.ITALY).format(new Date(t)); }

    @Override
    protected void onResume() {
        super.onResume();
        int p = Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 20, getResources().getDisplayMetrics()));
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(p, p, p, p);
        TextView t = new TextView(this);
        t.setTextSize(16);
        boolean on = VpnAutomatico.attivo(this);
        t.setText(on
            ? "✓ VPN in un tocco è attiva.\n\nUsa il tasto VPN in A&C (Modi e comandi) o nel widget \"A&C Comandi\"."
            : "✗ Il servizio NON è attivo.\n\n1. In FortiClient spunta \"Salva password\" e collegati una volta a mano.\n2. Tocca qui sotto, poi Servizi installati → A&C · VPN in un tocco → attiva.");
        l.addView(t);
        Button b = new Button(this);
        b.setText(on ? "Impostazioni Accessibilità" : "Apri Accessibilità");
        b.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        l.addView(b);

        SharedPreferences sp = VpnAutomatico.prefs(this);
        TextView d = new TextView(this);
        d.setTextSize(13);
        d.setTextIsSelectable(true);
        d.setPadding(0, p, 0, 0);
        d.setText("DIAGNOSI (mandala se qualcosa non va)\n"
            + "Servizio avviato: " + ora(sp.getLong("diag_servizio", 0)) + "\n"
            + "Ultima richiesta da A&C: " + ora(sp.getLong("diag_richiesta", 0)) + " (" + sp.getString("diag_azione", "-") + ")\n"
            + "Ultima schermata vista: " + sp.getString("diag_pacchetto", "-") + " alle " + ora(sp.getLong("diag_evento", 0)) + "\n"
            + "VPN adesso: " + (VpnAutomatico.vpnAttiva(this) ? "collegata" : "non collegata") + "\n"
            + "Esito: " + sp.getString("diag_esito", "-") + "\n\n"
            + sp.getString("diag_schermata", ""));
        l.addView(d);
        ScrollView sc = new ScrollView(this);
        sc.addView(l);
        setContentView(sc);
    }
}
