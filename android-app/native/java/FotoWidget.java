package it.andreaecristina.casa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Widget "A&C Foto": carosello di foto dell'album (scelte a caso dall'app ogni giorno).
 * Le foto sono file in files/widget_foto, l'ordine in files/widget_foto/elenco.txt.
 */
public class FotoWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) disegna(context, manager, id);
    }

    public static void aggiornaTutti(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FotoWidget.class));
        for (int id : ids) disegna(context, manager, id);
        manager.notifyAppWidgetViewDataChanged(ids, R.id.f_flipper);
    }

    static void disegna(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_foto);

        Intent servizio = new Intent(context, FotoWidgetService.class);
        servizio.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        servizio.setData(Uri.parse(servizio.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.f_flipper, servizio);
        v.setEmptyView(R.id.f_flipper, R.id.f_vuoto);

        Intent apri = new Intent(context, MainActivity.class);
        apri.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent modello = PendingIntent.getActivity(context, 2, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        v.setPendingIntentTemplate(R.id.f_flipper, modello);
        PendingIntent vuoto = PendingIntent.getActivity(context, 3, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.f_vuoto, vuoto);

        manager.updateAppWidget(widgetId, v);
    }
}
