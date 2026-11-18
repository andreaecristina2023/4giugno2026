package it.andreaecristina.casa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Widget trasparente "Rifiuti": mostra i bidoni da portare fuori stasera (o il prossimo ritiro).
 * Dati preparati dall'app in SharedPreferences "CapacitorStorage", chiave "widgetRifiuti":
 * { giorni: [ { data: "YYYY-MM-DD" (giorno del ritiro), frazioni: [ {n: "Umido", c: "#8A5A2B"} ], nota: "" } ] }
 */
public class RifiutiWidget extends AppWidgetProvider {

    private static final int[] BOX = { R.id.r_box1, R.id.r_box2, R.id.r_box3 };
    private static final int[] BIN = { R.id.r_bin1, R.id.r_bin2, R.id.r_bin3 };
    private static final int[] NOME = { R.id.r_nome1, R.id.r_nome2, R.id.r_nome3 };
    private static final String[] GIORNI = { "dom", "lun", "mar", "mer", "gio", "ven", "sab" };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) disegna(context, manager, id);
    }

    public static void aggiornaTutti(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, RifiutiWidget.class));
        for (int id : ids) disegna(context, manager, id);
    }

    private static String iso(Calendar c) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ITALY).format(c.getTime());
    }

    private static String giornoPrima(String data) {
        try {
            Calendar c = Calendar.getInstance();
            c.setTime(new SimpleDateFormat("yyyy-MM-dd", Locale.ITALY).parse(data));
            c.add(Calendar.DAY_OF_MONTH, -1);
            return GIORNI[c.get(Calendar.DAY_OF_WEEK) - 1] + " " + c.get(Calendar.DAY_OF_MONTH);
        } catch (Exception e) {
            return data;
        }
    }

    static void disegna(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_rifiuti);

        Intent apri = new Intent(context, MainActivity.class);
        apri.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 1, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.r_radice, pi);

        Calendar c = Calendar.getInstance();
        int ora = c.get(Calendar.HOUR_OF_DAY);
        String oggi = iso(c);
        c.add(Calendar.DAY_OF_MONTH, 1);
        String domani = iso(c);

        String quando = "Nessun ritiro in vista";
        JSONObject scelto = null;
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String json = prefs.getString("widgetRifiuti", null);
            JSONArray giorni = json == null ? null : new JSONObject(json).optJSONArray("giorni");
            for (int i = 0; giorni != null && i < giorni.length(); i++) {
                JSONObject g = giorni.getJSONObject(i);
                String data = g.optString("data", "");
                if (ora < 5 && data.equals(oggi)) { scelto = g; quando = "Fuori adesso"; break; }
                if (data.equals(domani)) { scelto = g; quando = "Stasera fuori"; break; }
                if (data.compareTo(domani) > 0) { scelto = g; quando = "Fuori " + giornoPrima(data) + " sera"; break; }
            }
        } catch (Exception e) {
            scelto = null;
        }

        v.setTextViewText(R.id.r_quando, quando);
        int mostrati = 0;
        String nota = "";
        if (scelto != null) {
            JSONArray fr = scelto.optJSONArray("frazioni");
            nota = scelto.optString("nota", "");
            for (int i = 0; fr != null && i < fr.length() && mostrati < BOX.length; i++) {
                JSONObject f = fr.optJSONObject(i);
                if (f == null) continue;
                int colore;
                try { colore = Color.parseColor(f.optString("c", "#6B6F73")); } catch (Exception e) { colore = Color.GRAY; }
                v.setViewVisibility(BOX[mostrati], View.VISIBLE);
                v.setInt(BIN[mostrati], "setColorFilter", colore);
                v.setTextViewText(NOME[mostrati], f.optString("n", ""));
                mostrati++;
            }
        } else {
            nota = "Apri l'app per aggiornare";
        }
        for (int i = mostrati; i < BOX.length; i++) v.setViewVisibility(BOX[i], View.GONE);
        v.setTextViewText(R.id.r_nota, nota);
        v.setViewVisibility(R.id.r_nota, nota.isEmpty() ? View.GONE : View.VISIBLE);
        manager.updateAppWidget(widgetId, v);
    }
}
