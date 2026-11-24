package it.andreaecristina.casa;

import android.app.Activity;
import android.app.KeyguardManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Schermata della sveglia del turnario (anche a telefono bloccato): ora, nome, Spegni e Posticipa 10 minuti. */
public class SvegliaSchermo extends Activity {

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private Button tasto(String testo, int sfondo, int colore) {
        Button b = new Button(this);
        b.setText(testo);
        b.setTextSize(20);
        b.setAllCaps(false);
        b.setTextColor(colore);
        GradientDrawable g = new GradientDrawable();
        g.setColor(sfondo);
        g.setCornerRadius(dp(28));
        b.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        lp.topMargin = dp(14);
        b.setLayoutParams(lp);
        return b;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final String nome = getIntent().getStringExtra("nome") == null ? "Sveglia" : getIntent().getStringExtra("nome");
        long t = getIntent().getLongExtra("t", System.currentTimeMillis());

        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setPadding(dp(28), dp(28), dp(28), dp(28));
        l.setBackgroundColor(Color.parseColor("#141B17"));

        TextView ora = new TextView(this);
        ora.setText(new java.text.SimpleDateFormat("HH:mm", java.util.Locale.ITALY).format(new java.util.Date(t)));
        ora.setTextSize(72);
        ora.setTypeface(Typeface.DEFAULT_BOLD);
        ora.setTextColor(Color.parseColor("#E6EBE3"));
        ora.setGravity(Gravity.CENTER);
        l.addView(ora);

        TextView tit = new TextView(this);
        tit.setText("⏰ " + nome);
        tit.setTextSize(24);
        tit.setTextColor(Color.parseColor("#E0BC52"));
        tit.setGravity(Gravity.CENTER);
        tit.setPadding(0, 0, 0, dp(30));
        l.addView(tit);

        Button spegni = tasto("Spegni", Color.parseColor("#9E2F52"), Color.WHITE);
        spegni.setOnClickListener(v -> { SvegliaTurno.spegni(this); finish(); });
        l.addView(spegni);
        Button dopo = tasto("Posticipa 10 minuti", Color.parseColor("#2E3A33"), Color.parseColor("#E6EBE3"));
        dopo.setOnClickListener(v -> { SvegliaTurno.posticipa(this, nome); finish(); });
        l.addView(dopo);

        setContentView(l);
    }
}
