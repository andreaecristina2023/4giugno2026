package it.andreaecristina.casa;

import android.content.Context;
import android.text.Html;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * Turni VVF in servizio in un giorno: stessa sequenza a 32 giorni di FireOps
 * (fireops-core.js, SEQUENZA_TURNI, riferimento 26/01/2026). Calcolata qui così i widget
 * la mostrano anche se l'app non è stata aperta.
 */
public final class TurniVVF {
    private TurniVVF() {}

    private static final String[] SEQUENZA = {"A4", "C4", "B4", "B4", "D4", "C4", "C4", "A5", "D4", "D4", "B5", "A5", "A5", "C5", "B5", "B5", "D5", "C5", "C5", "A6", "D5", "D5", "B6", "A6", "A6", "C6", "B6", "B6", "D6", "C6", "C6", "A7", "D6", "D6", "B7", "A7", "A7", "C7", "B7", "B7", "D7", "C7", "C7", "A8", "D7", "D7", "B8", "A8", "A8", "C8", "B8", "B8", "D8", "C8", "C8", "A1", "D8", "D8", "B1", "A1", "A1", "C1", "B1", "B1", "D1", "C1", "C1", "A2", "D1", "D1", "B2", "A2", "A2", "C2", "B2", "B2", "D2", "C2", "C2", "A3", "D2", "D2", "B3", "A3", "A3", "C3", "B3", "B3", "D3", "C3", "C3", "A4", "D3", "D3", "B4", "A4"};

    private static long giornoAssoluto(int anno, int mese0, int giorno) {
        Calendar u = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        u.clear();
        u.set(anno, mese0, giorno, 0, 0, 0);
        return u.getTimeInMillis() / 86400000L;
    }

    /** {notteUscente, diurno, notte} del giorno indicato (ora locale del telefono). */
    public static String[] delGiorno(Calendar c) {
        long d = giornoAssoluto(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)) - giornoAssoluto(2026, 0, 26);
        int k = (int) (((d % 32) + 32) % 32);
        return new String[] { SEQUENZA[3 * k], SEQUENZA[3 * k + 1], SEQUENZA[3 * k + 2] };
    }

    /** Lettera del proprio turno salvata dall'app (vuota se il turnario non è attivo). */
    public static String mioTurno(Context context) {
        try {
            String js = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("widget", null);
            return js == null ? "" : new JSONObject(js).optString("mioTurno", "");
        } catch (Exception e) {
            return "";
        }
    }

    /** Testo "C6 / b6" con il proprio turno sottolineato; null se il turnario non è attivo. */
    public static CharSequence etichetta(Context context, Calendar c) {
        String mio = mioTurno(context);
        if (mio.isEmpty()) return null;
        String[] t = delGiorno(c);
        String g = t[1], n = t[2].toLowerCase();
        String hg = g.startsWith(mio) ? "<u>" + g + "</u>" : g;
        String hn = t[2].startsWith(mio) ? "<u>" + n + "</u>" : n;
        return Html.fromHtml(hg + " / " + hn, Html.FROM_HTML_MODE_LEGACY);
    }
}
