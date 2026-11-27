package it.andreaecristina.casa;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Finestra a comparsa del tasto "Colori luci" del widget: accendi/spegni, colori pronti, bianco,
 * luminosità e bianco caldo/freddo della luce scelta (le luci con ★ in A&C).
 */
public class LuciPopup extends Activity {

    static final int[][] COLORI = { { 0 }, { 30 }, { 55 }, { 120 }, { 185 }, { 230 }, { 275 }, { 320 } };
    final Handler ui = new Handler(Looper.getMainLooper());
    int carta, inchiostro, muschio, confine, sangiovese;
    LinearLayout scheda;
    String scelta;
    boolean lavora = false;

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }
    private GradientDrawable sfondo(int colore, float raggio, int bordo) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(colore); g.setCornerRadius(dp(raggio));
        if (bordo != 0) g.setStroke(dp(2), bordo);
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
        scheda.setPadding(dp(16), dp(14), dp(16), dp(12));
        scheda.setBackground(sfondo(carta, 24, 0));
        scheda.setClickable(true);
        radice.addView(scheda, new FrameLayout.LayoutParams(Math.min(dp(360), getResources().getDisplayMetrics().widthPixels - dp(32)), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        setContentView(radice);

        JSONObject p = LuciWidget.prima(this);
        scelta = p != null ? p.optString("id") : "";
        disegna();
        // stato aggiornato in sottofondo (sul Wi-Fi di casa è questione di un secondo)
        new Thread(() -> { LuciWidget.riallinea(getApplicationContext()); ui.post(this::disegna); }).start();
    }

    JSONObject luce(String id) {
        JSONArray a = LuciWidget.elenco(this);
        for (int i = 0; i < a.length(); i++) { JSONObject l = a.optJSONObject(i); if (l != null && l.optString("id").equals(id)) return l; }
        return null;
    }

    void disegna() {
        if (isFinishing()) return;
        scheda.removeAllViews();
        TextView titolo = testo("Luci", 20, inchiostro, true);
        titolo.setPadding(dp(4), 0, 0, dp(8));
        scheda.addView(titolo);

        JSONArray a = LuciWidget.elenco(this);
        if (a.length() == 0) { scheda.addView(testo("Scegli le luci in A&C → 💡 Luci (☆)", 15, muschio, false)); return; }
        // una riga per luce: nome (tocco = la scelgo) e interruttore
        for (int i = 0; i < a.length(); i++) {
            final JSONObject l = a.optJSONObject(i);
            if (l == null) continue;
            final String id = l.optString("id");
            boolean sel = id.equals(scelta), online = l.optBoolean("online", true);
            LinearLayout riga = new LinearLayout(this);
            riga.setOrientation(LinearLayout.HORIZONTAL);
            riga.setGravity(Gravity.CENTER_VERTICAL);
            riga.setPadding(dp(12), dp(6), dp(8), dp(6));
            riga.setBackground(sfondo(carta, 14, sel && a.length() > 1 ? sangiovese : confine));
            TextView nome = testo((online ? (l.optBoolean("acceso") ? "💡 " : "🔅 ") : "⚠️ ") + l.optString("nome", "Luce")
                + (l.optBoolean("acceso") && !l.isNull("luminosita") && l.has("luminosita") ? "  " + l.optInt("luminosita") + "%" : ""), 16, inchiostro, true);
            riga.addView(nome, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            Switch sw = new Switch(this);
            sw.setChecked(l.optBoolean("acceso"));
            sw.setOnCheckedChangeListener((bt, on) -> { scelta = id; LuciWidget.scegli(this, id); invia(id, kv("acceso", on)); });
            riga.addView(sw);
            riga.setOnClickListener(v -> { scelta = id; LuciWidget.scegli(this, id); disegna(); LuciWidget.aggiornaTutti(this); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(6);
            scheda.addView(riga, lp);
        }

        final JSONObject l = luce(scelta);
        if (l == null) return;
        JSONObject ha = l.optJSONObject("ha");
        boolean haColore = ha == null || ha.optBoolean("colore", true), haTemp = ha == null || ha.optBoolean("temperatura", true), haLum = ha == null || ha.optBoolean("luminosita", true);

        if (haColore) {
            LinearLayout pal = new LinearLayout(this);
            pal.setOrientation(LinearLayout.HORIZONTAL);
            pal.setPadding(0, dp(8), 0, dp(4));
            if (haTemp) pal.addView(pallino(Color.parseColor("#FFF4DC"), v -> invia(scelta, kv("temperatura", l.isNull("temperatura") ? 30 : l.optInt("temperatura", 30)))), peso());
            for (int[] h : COLORI) {
                final int hue = h[0];
                pal.addView(pallino(Color.HSVToColor(new float[] { hue, 0.85f, 0.95f }), v -> invia(scelta, kvColore(hue))), peso());
            }
            scheda.addView(pal);
        }
        if (haLum) {
            scheda.addView(etichetta("🔆 Luminosità"));
            SeekBar sb = new SeekBar(this);
            sb.setMax(99);
            sb.setProgress(Math.max(0, (l.isNull("luminosita") ? 50 : l.optInt("luminosita", 50)) - 1));
            sb.setOnSeekBarChangeListener(fine(x -> invia(scelta, kv("luminosita", x + 1))));
            scheda.addView(sb);
        }
        if (haTemp) {
            scheda.addView(etichetta("🕯 Bianco caldo ↔ freddo ❄"));
            SeekBar st = new SeekBar(this);
            st.setMax(100);
            st.setProgress(l.isNull("temperatura") ? 50 : l.optInt("temperatura", 50));
            st.setOnSeekBarChangeListener(fine(x -> invia(scelta, kv("temperatura", x))));
            scheda.addView(st);
        }
        TextView app = testo("Apri 💡 Luci in A&C ›", 14, muschio, false);
        app.setPadding(dp(4), dp(10), dp(4), dp(2));
        app.setOnClickListener(v -> { startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)); finish(); });
        scheda.addView(app);
    }

    interface AlRilascio { void fai(int valore); }
    SeekBar.OnSeekBarChangeListener fine(AlRilascio f) {
        return new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean u) { }
            @Override public void onStartTrackingTouch(SeekBar s) { }
            @Override public void onStopTrackingTouch(SeekBar s) { f.fai(s.getProgress()); }
        };
    }

    static JSONObject kv(String k, Object v) { try { return new JSONObject().put(k, v); } catch (Exception e) { return new JSONObject(); } }
    static JSONObject kvColore(int h) { try { return new JSONObject().put("colore", new JSONObject().put("h", h).put("s", 100)); } catch (Exception e) { return new JSONObject(); } }

    void invia(String id, JSONObject cmd) {
        if (id == null || id.isEmpty()) return;
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            try { LuciWidget.comanda(app, id, cmd); }
            catch (Exception e) { LuciWidget.avviso(app, e.getMessage()); }
            ui.post(() -> { disegna(); LuciWidget.aggiornaTutti(app); });
        }).start();
    }

    TextView testo(String t, float sp, int colore, boolean grassetto) {
        TextView x = new TextView(this);
        x.setText(t); x.setTextSize(sp); x.setTextColor(colore);
        if (grassetto) x.setTypeface(x.getTypeface(), android.graphics.Typeface.BOLD);
        x.setMaxLines(1);
        return x;
    }
    TextView etichetta(String t) { TextView x = testo(t, 13, muschio, false); x.setPadding(dp(4), dp(8), 0, 0); return x; }
    LinearLayout.LayoutParams peso() { LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(34), 1); lp.setMargins(dp(3), 0, dp(3), 0); return lp; }
    View pallino(int colore, View.OnClickListener click) {
        FrameLayout f = new FrameLayout(this);
        View v = new View(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL); g.setColor(colore); g.setStroke(dp(1), confine);
        v.setBackground(g);
        f.addView(v, new FrameLayout.LayoutParams(dp(30), dp(30), Gravity.CENTER));
        f.setOnClickListener(click);
        return f;
    }
}
