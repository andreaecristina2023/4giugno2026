package it.andreaecristina.casa;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Space;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/** Telecomando compatto della TV LG, a comparsa sopra la home (tasto 📺 TV del widget "A&C Comandi"). */
public class TvPopup extends Activity {

    int carta, inchiostro, muschio, confine, sangiovese;
    LinearLayout scheda, ingressi;
    boolean muto = false;

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }
    private GradientDrawable sfondo(int colore, float raggio, int bordo) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(colore); g.setCornerRadius(dp(raggio));
        if (bordo != 0) g.setStroke(dp(1), bordo);
        return g;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        boolean scuro = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        carta = scuro ? Color.parseColor("#1C2520") : Color.parseColor("#F7F8F3");
        inchiostro = scuro ? Color.parseColor("#E6EBE3") : Color.parseColor("#1E2B25");
        muschio = scuro ? Color.parseColor("#9BA89E") : Color.parseColor("#59665D");
        confine = scuro ? Color.parseColor("#2E3A33") : Color.parseColor("#D2D7CA");
        sangiovese = Color.parseColor("#7A1F3D");

        FrameLayout radice = new FrameLayout(this);
        radice.setBackgroundColor(Color.parseColor("#73000000"));
        radice.setOnClickListener(v -> finish());
        scheda = new LinearLayout(this);
        scheda.setOrientation(LinearLayout.VERTICAL);
        scheda.setPadding(dp(14), dp(12), dp(14), dp(12));
        scheda.setBackground(sfondo(carta, 24, 0));
        scheda.setClickable(true);
        radice.addView(scheda, new FrameLayout.LayoutParams(Math.min(dp(340), getResources().getDisplayMetrics().widthPixels - dp(32)), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        setContentView(radice);

        TextView t = new TextView(this);
        t.setText("📺 TV"); t.setTextSize(18); t.setTextColor(inchiostro); t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setPadding(dp(4), 0, 0, dp(8));
        scheda.addView(t);

        riga(new String[][] { { "⏻", "potenza" }, { "🔇", "muto" }, { "⤵ Sorgente", "sorgente" }, { "⌂", "tasto:HOME" } });
        riga(new String[][] { { "Vol +", "ssap:ssap://audio/volumeUp" }, null, { "▲", "tasto:UP" }, null, { "Ch +", "ssap:ssap://tv/channelUp" } });
        riga(new String[][] { { "Vol −", "ssap:ssap://audio/volumeDown" }, { "◀", "tasto:LEFT" }, { "OK", "tasto:ENTER" }, { "▶", "tasto:RIGHT" }, { "Ch −", "ssap:ssap://tv/channelDown" } });
        riga(new String[][] { { "↩", "tasto:BACK" }, null, { "▼", "tasto:DOWN" }, null, { "✕", "tasto:EXIT" } });
        ingressi = new LinearLayout(this);
        ingressi.setOrientation(LinearLayout.HORIZONTAL);
        ingressi.setVisibility(View.GONE);
        scheda.addView(ingressi);

        TextView app = new TextView(this);
        app.setText("Telecomando completo in A&C ›"); app.setTextColor(muschio); app.setTextSize(13);
        app.setPadding(dp(4), dp(8), dp(4), 0);
        app.setOnClickListener(v -> { startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)); finish(); });
        scheda.addView(app);
    }

    void riga(String[][] tasti) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        for (String[] k : tasti) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(50), 1);
            lp.setMargins(dp(3), dp(3), dp(3), dp(3));
            if (k == null) { r.addView(new Space(this), lp); continue; }
            TextView b = new TextView(this);
            b.setText(k[0]); b.setGravity(Gravity.CENTER); b.setTextSize(k[0].length() > 3 ? 14 : 18);
            b.setTypeface(b.getTypeface(), android.graphics.Typeface.BOLD);
            boolean ok = "tasto:ENTER".equals(k[1]);
            b.setTextColor(ok ? Color.WHITE : inchiostro);
            b.setBackground(sfondo(ok ? sangiovese : carta, ok ? 25 : 14, ok ? 0 : confine));
            final String azione = k[1];
            b.setOnClickListener(v -> { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); esegui(azione); });
            r.addView(b, lp);
        }
        scheda.addView(r);
    }

    void esegui(String azione) {
        final android.content.Context app = getApplicationContext();
        if ("sorgente".equals(azione)) { mostraIngressi(); return; }
        new Thread(() -> {
            try {
                if ("potenza".equals(azione)) LuciWidget.avviso(app, TvCasa.accendiSpegni(app));
                else if ("muto".equals(azione)) { muto = !muto; TvCasa.comando(app, new JSONObject().put("tipo", "ssap").put("valore", "ssap://audio/setMute").put("payload", new JSONObject().put("mute", muto))); }
                else if (azione.startsWith("tasto:")) TvCasa.comando(app, new JSONObject().put("tipo", "tasto").put("valore", azione.substring(6)));
                else if (azione.startsWith("ssap:")) TvCasa.comando(app, new JSONObject().put("tipo", "ssap").put("valore", azione.substring(5)));
                else if (azione.startsWith("ingresso:")) TvCasa.comando(app, new JSONObject().put("tipo", "ingresso").put("valore", azione.substring(9)));
                else if (azione.startsWith("app:")) TvCasa.comando(app, new JSONObject().put("tipo", "app").put("valore", azione.substring(4)));
            } catch (Exception e) { LuciWidget.avviso(app, e.getMessage()); }
        }).start();
    }

    void mostraIngressi() {
        if (ingressi.getVisibility() == View.VISIBLE) { ingressi.setVisibility(View.GONE); return; }
        ingressi.removeAllViews();
        JSONArray l = TvCasa.conf(this).optJSONArray("ingressi");
        String[][] voci = new String[(l == null ? 0 : Math.min(l.length(), 4)) + 1][];
        voci[0] = new String[] { "TV", "app:com.webos.app.livetv" };
        for (int i = 1; i < voci.length; i++) { JSONObject x = l.optJSONObject(i - 1); voci[i] = new String[] { x.optString("nome", "HDMI"), "ingresso:" + x.optString("id") }; }
        for (String[] k : voci) {
            TextView b = new TextView(this);
            b.setText(k[0]); b.setGravity(Gravity.CENTER); b.setTextSize(13); b.setTextColor(inchiostro); b.setMaxLines(1);
            b.setBackground(sfondo(carta, 14, confine));
            final String azione = k[1];
            b.setOnClickListener(v -> { esegui(azione); ingressi.setVisibility(View.GONE); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(40), 1);
            lp.setMargins(dp(3), dp(3), dp(3), dp(3));
            ingressi.addView(b, lp);
        }
        ingressi.setVisibility(View.VISIBLE);
    }
}
