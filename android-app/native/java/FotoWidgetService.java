package it.andreaecristina.casa;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

/** Fornisce le foto al widget "A&C Foto". */
public class FotoWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Fabbrica(getApplicationContext());
    }

    static File cartella(Context context) {
        return new File(context.getFilesDir(), "widget_foto");
    }

    static class Fabbrica implements RemoteViewsService.RemoteViewsFactory {
        private final Context context;
        private final List<File> file = new ArrayList<>();

        Fabbrica(Context context) { this.context = context; }

        @Override public void onCreate() { carica(); }
        @Override public void onDataSetChanged() { carica(); }
        @Override public void onDestroy() { file.clear(); }
        @Override public int getCount() { return file.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }

        private void carica() {
            file.clear();
            File dir = cartella(context);
            File elenco = new File(dir, "elenco.txt");
            if (!elenco.exists()) return;
            try (BufferedReader r = new BufferedReader(new FileReader(elenco))) {
                String riga;
                while ((riga = r.readLine()) != null) {
                    riga = riga.trim();
                    if (riga.isEmpty()) continue;
                    File f = new File(dir, riga + ".jpg");
                    if (f.exists()) file.add(f);
                }
            } catch (Exception e) {
                file.clear();
            }
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_foto_item);
            if (position < 0 || position >= file.size()) return v;
            String percorso = file.get(position).getAbsolutePath();
            // riduco per stare nei limiti di memoria dei widget
            BitmapFactory.Options misura = new BitmapFactory.Options();
            misura.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(percorso, misura);
            int campione = 1;
            while (Math.max(misura.outWidth, misura.outHeight) / campione > 900) campione *= 2;
            BitmapFactory.Options opz = new BitmapFactory.Options();
            opz.inSampleSize = campione;
            Bitmap bmp = BitmapFactory.decodeFile(percorso, opz);
            if (bmp != null) v.setImageViewBitmap(R.id.f_img, bmp);
            v.setOnClickFillInIntent(R.id.f_img, new Intent());
            return v;
        }
    }
}
