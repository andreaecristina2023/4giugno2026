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
 * Widget "Casa": legge le righe preparate dall'app (Preferences → SharedPreferences "CapacitorStorage", chiave "widget")
 * e mostra le prossime 5 cose da oggi in poi. Si aggiorna quando l'app salva e ogni 30 minuti.
 */
public class CasaWidget extends AppWidgetProvider {

    private static final int[] RIGHE = { R.id.riga1, R.id.riga2, R.id.riga3, R.id.riga4, R.id.riga5 };
    private static final int[] BARRE = { R.id.barra1, R.id.barra2, R.id.barra3, R.id.barra4, R.id.barra5 };
    private static final int[] QUANDO = { R.id.quando1, R.id.quando2, R.id.quando3, R.id.quando4, R.id.quando5 };
    private static final int[] TESTI = { R.id.testo1, R.id.testo2, R.id.testo3, R.id.testo4, R.id.testo5 };
    private static final String[] GIORNI = { "dom", "lun", "mar", "mer", "gio", "ven", "sab" };
    private static final String[] MESI = { "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic" };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) disegna(context, manager, id);
    }

    public static void aggiornaTutti(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, CasaWidget.class));
        for (int id : ids) disegna(context, manager, id);
    }

    private static String iso(Calendar c) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ITALY).format(c.getTime());
    }

    private static String etichetta(String data, String oggi, String domani, boolean rifiuti) {
        if (data.equals(oggi)) return rifiuti ? "Stasera" : "Oggi";
        if (data.equals(domani)) return rifiuti ? "Domani sera" : "Domani";
        try {
            Calendar c = Calendar.getInstance();
            c.setTime(new SimpleDateFormat("yyyy-MM-dd", Locale.ITALY).parse(data));
            String s = GIORNI[c.get(Calendar.DAY_OF_WEEK) - 1] + " " + c.get(Calendar.DAY_OF_MONTH) + " " + MESI[c.get(Calendar.MONTH)];
            return rifiuti ? s + " sera" : s;
        } catch (Exception e) {
            return data;
        }
    }

    static void disegna(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_casa);

        Intent apri = new Intent(context, MainActivity.class);
        apri.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 0, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_radice, pi);

        Calendar c = Calendar.getInstance();
        String oggi = iso(c);
        String titolo = "A&C · " + GIORNI[c.get(Calendar.DAY_OF_WEEK) - 1] + " " + c.get(Calendar.DAY_OF_MONTH) + " " + MESI[c.get(Calendar.MONTH)];
        try {
            String js = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("widget", null);
            JSONObject serv = js == null ? null : new JSONObject(js).optJSONObject("servizio");
            String oggiServ = serv == null ? "" : serv.optString(oggi, "");
            if (!oggiServ.isEmpty()) titolo += " · " + oggiServ;
        } catch (Exception e) {
            // senza dati dei turni resta il titolo semplice
        }
        v.setTextViewText(R.id.widget_titolo, titolo);
        c.add(Calendar.DAY_OF_MONTH, 1);
        String domani = iso(c);

        int mostrate = 0;
        try {
            SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String json = prefs.getString("widget", null);
            if (json != null) {
                JSONArray righe = new JSONObject(json).optJSONArray("righe");
                for (int i = 0; righe != null && i < righe.length() && mostrate < RIGHE.length; i++) {
                    JSONObject r = righe.getJSONObject(i);
                    String data = r.optString("data", "");
                    if (data.compareTo(oggi) < 0) continue;
                    boolean rif = r.optBoolean("rifiuti", false);
                    v.setViewVisibility(RIGHE[mostrate], View.VISIBLE);
                    v.setTextViewText(QUANDO[mostrate], etichetta(data, oggi, domani, rif));
                    v.setTextViewText(TESTI[mostrate], r.optString("testo", ""));
                    int colore;
                    try { colore = Color.parseColor(r.optString("colore", "#59665D")); } catch (Exception e) { colore = Color.parseColor("#59665D"); }
                    v.setInt(BARRE[mostrate], "setBackgroundColor", colore);
                    mostrate++;
                }
            }
        } catch (Exception e) {
            // dati non leggibili: mostro il messaggio vuoto
        }
        for (int i = mostrate; i < RIGHE.length; i++) v.setViewVisibility(RIGHE[i], View.GONE);
        v.setViewVisibility(R.id.widget_vuoto, mostrate == 0 ? View.VISIBLE : View.GONE);
        manager.updateAppWidget(widgetId, v);
    }
}
