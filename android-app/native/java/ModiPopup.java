package it.andreaecristina.casa;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Finestra a comparsa sopra la home, aperta dal widget "A&C Comandi":
 * - senza extra: elenco dei modi, un tocco applica il modo e chiude;
 * - extra "vpn": collega/scollega la VPN (FortiClient) e chiude subito.
 */
public class ModiPopup extends Activity {

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private GradientDrawable sfondo(int colore, float raggio, int bordo) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(colore);
        g.setCornerRadius(dp(raggio));
        if (bordo != 0) g.setStroke(dp(2), bordo);
        return g;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (getIntent().getBooleanExtra("vpn", false)) {
            try {
                String a = ComandiTelefono.avviaVpn(this, "home");
                if ("manuale".equals(a)) Toast.makeText(this, "Tocca Connetti in FortiClient", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "FortiClient non trovato", Toast.LENGTH_SHORT).show();
            }
            finish();
            return;
        }
        mostraModi();
    }

    private void mostraModi() {
        boolean scuro = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        int carta = scuro ? Color.parseColor("#1C2520") : Color.parseColor("#F7F8F3");
        int inchiostro = scuro ? Color.parseColor("#E6EBE3") : Color.parseColor("#1E2B25");
        int muschio = scuro ? Color.parseColor("#9BA89E") : Color.parseColor("#59665D");
        int confine = scuro ? Color.parseColor("#2E3A33") : Color.parseColor("#D2D7CA");
        int sangiovese = Color.parseColor("#7A1F3D");
        int attivoSfondo = scuro ? Color.parseColor("#3A1F28") : Color.parseColor("#F3E3E8");

        FrameLayout radice = new FrameLayout(this);
        radice.setBackgroundColor(Color.parseColor("#73000000"));
        radice.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { finish(); } });

        LinearLayout carta2 = new LinearLayout(this);
        carta2.setOrientation(LinearLayout.VERTICAL);
        carta2.setPadding(dp(16), dp(16), dp(16), dp(12));
        carta2.setBackground(sfondo(carta, 24, 0));
        carta2.setClickable(true); // i tocchi sulla scheda non chiudono
        FrameLayout.LayoutParams lpCarta = new FrameLayout.LayoutParams(Math.min(dp(340), getResources().getDisplayMetrics().widthPixels - dp(32)), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        radice.addView(carta2, lpCarta);

        TextView titolo = new TextView(this);
        titolo.setText("Modi");
        titolo.setTextColor(inchiostro);
        titolo.setTextSize(17);
        titolo.setTypeface(titolo.getTypeface(), android.graphics.Typeface.BOLD);
        titolo.setPadding(dp(4), 0, 0, dp(10));
        carta2.addView(titolo);

        ScrollView sc = new ScrollView(this);
        LinearLayout elenco = new LinearLayout(this);
        elenco.setOrientation(LinearLayout.VERTICAL);
        sc.addView(elenco);
        carta2.addView(sc, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final JSONObject conf = ComandiTelefono.configurazione(this);
        JSONArray modi = conf.optJSONArray("modi");
        String attivo = ComandiWidget.attivoVero(this, modi);
        for (int i = 0; modi != null && i < modi.length(); i++) {
            final JSONObject m = modi.optJSONObject(i);
            if (m == null) continue;
            boolean on = m.optString("id").equals(attivo);
            LinearLayout riga = new LinearLayout(this);
            riga.setOrientation(LinearLayout.HORIZONTAL);
            riga.setGravity(Gravity.CENTER_VERTICAL);
            riga.setPadding(dp(12), dp(7), dp(12), dp(7));
            riga.setBackground(sfondo(on ? attivoSfondo : carta, 14, on ? sangiovese : confine));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(6);
            TextView ic = new TextView(this);
            ic.setText(m.optString("icona", "🔔"));
            ic.setTextSize(20);
            ic.setPadding(0, 0, dp(12), 0);
            riga.addView(ic);
            LinearLayout testi = new LinearLayout(this);
            testi.setOrientation(LinearLayout.VERTICAL);
            TextView nome = new TextView(this);
            nome.setText(m.optString("nome", "Modo") + (on ? "  ✓" : ""));
            nome.setTextColor(inchiostro);
            nome.setTextSize(16);
            nome.setTypeface(nome.getTypeface(), android.graphics.Typeface.BOLD);
            testi.addView(nome);
            String d = ""; // elenco essenziale: solo icona e nome
            if (!d.isEmpty()) {
                TextView sotto = new TextView(this);
                sotto.setText(d);
                sotto.setTextColor(muschio);
                sotto.setTextSize(13);
                testi.addView(sotto);
            }
            riga.addView(testi);
            riga.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { applica(m); } });
            elenco.addView(riga, lp);
        }

        TextView app = new TextView(this);
        app.setText("Modifica i modi in A&C ›");
        app.setTextColor(muschio);
        app.setTextSize(14);
        app.setPadding(dp(4), dp(6), dp(4), dp(4));
        app.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) {
            Intent i = new Intent(ModiPopup.this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(i);
            finish();
        } });
        carta2.addView(app);

        setContentView(radice);
    }

    private static String descrizione(JSONObject m) {
        String s = m.optString("suoneria", "");
        String out = "suona".equals(s) ? "Suona" : "vibra".equals(s) ? "Vibra" : "silenzio".equals(s) ? "Silenzio" : "";
        String d = m.optString("dnd", "");
        if (!d.isEmpty() && !"off".equals(d)) out += (out.isEmpty() ? "" : " · ") + "Non disturbare";
        JSONObject v = m.optJSONObject("volumi");
        if (v != null && v.has("media") && !v.isNull("media")) {
            int x = v.optInt("media", -1);
            out += (out.isEmpty() ? "" : " · ") + (x == 0 ? "media muti" : "musica " + x + "%");
        }
        return out;
    }

    private void applica(JSONObject m) {
        try {
            ComandiTelefono.applica(this, m);
            Toast.makeText(this, m.optString("icona", "") + " " + m.optString("nome", "Modo") + " attivo", Toast.LENGTH_SHORT).show();
        } catch (ComandiTelefono.Errore e) {
            if ("PERMESSO_DND".equals(e.codice)) {
                Toast.makeText(this, "Dai ad A&C l'accesso a Non disturbare, poi riprova", Toast.LENGTH_LONG).show();
                try { startActivity(ComandiTelefono.intentPermesso(this, "dnd")); } catch (Exception x) { /* niente */ }
            } else Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Modo non applicato", Toast.LENGTH_SHORT).show();
        }
        ComandiWidget.aggiornaTutti(this);
        finish();
    }
}
