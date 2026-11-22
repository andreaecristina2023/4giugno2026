package it.andreaecristina.casa.vpn;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Schermata dell'icona "A&C VPN": dice se il servizio è attivo e apre le impostazioni di Accessibilità. */
public class Avvio extends Activity {
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
            : "Per usare la VPN in un tocco:\n\n1. In FortiClient spunta \"Salva password\" e collegati una volta a mano.\n2. Tocca qui sotto, poi Servizi installati → A&C · VPN in un tocco → attiva.");
        l.addView(t);
        Button b = new Button(this);
        b.setText(on ? "Impostazioni Accessibilità" : "Apri Accessibilità");
        b.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        l.addView(b);
        setContentView(l);
    }
}
