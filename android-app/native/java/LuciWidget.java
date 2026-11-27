package it.andreaecristina.casa;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Luci per il widget unico "A&C Comandi" (tasto Luce) e per la finestra dei colori (LuciPopup).
 * Se le luci sono state lette in modalità Wi-Fi le comanda in locale (LuciLocali), altrimenti tramite lo script del foglio (cloud Tuya).
 * Dati dall'app in SharedPreferences "CapacitorStorage", chiave "luci":
 * { url, chiave, chi, luci: [ { id, nome, acceso, online, luminosita, temperatura, modo, colore, ha } ] }  (la prima è quella del tasto)
 */
public class LuciWidget {

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    static synchronized JSONObject dati(Context c) {
        try { return new JSONObject(prefs(c).getString("luci", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static synchronized void salva(Context c, JSONObject d) { prefs(c).edit().putString("luci", d.toString()).apply(); }

    /** Ridisegna il widget (le luci ora stanno in "A&C Comandi"). */
    public static void aggiornaTutti(Context c) { ComandiWidget.aggiornaTutti(c); }
    static void aggiornaDopo(Context c) { new Handler(Looper.getMainLooper()).post(() -> aggiornaTutti(c)); }

    static JSONArray elenco(Context c) { JSONArray a = dati(c).optJSONArray("luci"); return a != null ? a : new JSONArray(); }
    /** La luce del tasto "Luce": la prima con ★ nell'app (o l'ultima scelta nella finestra dei colori). */
    static JSONObject prima(Context c) {
        JSONArray a = elenco(c);
        String scelta = prefs(c).getString("luciScelta", "");
        for (int i = 0; i < a.length(); i++) { JSONObject l = a.optJSONObject(i); if (l != null && l.optString("id").equals(scelta)) return l; }
        return a.length() > 0 ? a.optJSONObject(0) : null;
    }
    static void scegli(Context c, String id) { prefs(c).edit().putString("luciScelta", id).apply(); }

    /** Salva nel widget lo stato di una luce (formato di tuyaLuce / LuciLocali.normalizza). */
    static synchronized void salvaLuce(Context c, JSONObject nuova) {
        if (nuova == null) return;
        try {
            JSONObject d = dati(c);
            JSONArray a = d.optJSONArray("luci");
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject x = a.optJSONObject(i);
                if (x == null || !nuova.optString("id").equals(x.optString("id"))) continue;
                for (String k : new String[] { "acceso", "online", "luminosita", "temperatura", "modo", "ha" }) if (nuova.has(k)) x.put(k, nuova.get(k));
                JSONObject col = nuova.optJSONObject("colore");
                x.put("colore", "colour".equals(nuova.optString("modo")) && col != null ? col.optInt("h") : JSONObject.NULL);
            }
            salva(c, d);
        } catch (Exception ignored) { }
    }

    /** Comando a una luce: { acceso | luminosita | temperatura | colore {h,s} }. In un thread. */
    static JSONObject comanda(Context c, String id, JSONObject cmd) throws Exception {
        JSONObject l;
        if (LuciLocali.trova(c, id) != null) l = LuciLocali.comando(c, id, cmd);
        else {
            JSONObject corpo = new JSONObject().put("azione", "luce_comando").put("id", id);
            for (java.util.Iterator<String> it = cmd.keys(); it.hasNext(); ) { String k = it.next(); corpo.put(k, cmd.get(k)); }
            l = chiama(c, corpo).optJSONObject("luce");
        }
        salvaLuce(c, l);
        return l;
    }

    /** Tocco sul tasto "Luce": cambia subito il disegno, poi manda il comando. */
    static void accendiSpegni(Context c, Runnable fine) {
        final JSONObject l = prima(c);
        if (l == null) { avviso(c, "Scegli le luci in A&C → 💡 Luci (☆)"); fine.run(); return; }
        final String id = l.optString("id");
        final boolean nuovo = !l.optBoolean("acceso");
        try { salvaLuce(c, new JSONObject().put("id", id).put("acceso", nuovo).put("online", true).put("modo", l.optString("modo", "white"))); } catch (Exception ignored) { }
        aggiornaTutti(c);
        new Thread(() -> {
            try { comanda(c, id, new JSONObject().put("acceso", nuovo)); }
            catch (Exception e) {
                try { salvaLuce(c, new JSONObject().put("id", id).put("acceso", !nuovo).put("online", true)); } catch (Exception ignored) { }
                avviso(c, e.getMessage());
            } finally { aggiornaDopo(c); fine.run(); }
        }).start();
    }

    /** Rilegge lo stato di tutte le luci (locale o script) e aggiorna il widget. Da chiamare in un thread. */
    static void riallinea(Context c) {
        try {
            JSONObject d = dati(c);
            if (elenco(c).length() == 0) return;
            JSONObject r;
            if (LuciLocali.configurato(c)) r = LuciLocali.elenco(c);
            else if (d.optString("url").isEmpty()) return;
            else r = chiama(c, new JSONObject().put("azione", "luci_elenco"));
            JSONArray tutte = r.optJSONArray("luci");
            for (int i = 0; tutte != null && i < tutte.length(); i++) salvaLuce(c, tutte.optJSONObject(i));
            aggiornaDopo(c);
        } catch (Exception e) { /* fuori casa o offline: resta lo stato di prima */ }
    }

    /** POST allo script di casa come fa il sito (Store.chiama): { chiave, azione, chi, ... }. */
    static JSONObject chiama(Context c, JSONObject corpo) throws Exception {
        JSONObject d = dati(c);
        String url = d.optString("url");
        if (url.isEmpty()) throw new Exception("Apri A&C → 💡 Luci una volta per preparare il widget");
        corpo.put("chiave", d.optString("chiave"));
        corpo.put("chi", d.optString("chi"));
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setInstanceFollowRedirects(true);
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
        try (OutputStream os = con.getOutputStream()) { os.write(corpo.toString().getBytes(StandardCharsets.UTF_8)); }
        int codice = con.getResponseCode();
        // lo script risponde con un rinvio (302) a googleusercontent: lo seguo a mano se Java non lo fa
        if (codice == 301 || codice == 302 || codice == 303 || codice == 307) {
            String dove = con.getHeaderField("Location");
            con.disconnect();
            con = (HttpURLConnection) new URL(dove).openConnection();
            con.setConnectTimeout(15000);
            con.setReadTimeout(30000);
            codice = con.getResponseCode();
        }
        if (codice != 200) throw new Exception("Lo script ha risposto " + codice);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = con.getInputStream()) { byte[] b = new byte[8192]; int k; while ((k = in.read(b)) > 0) out.write(b, 0, k); }
        con.disconnect();
        JSONObject r = new JSONObject(out.toString("UTF-8"));
        if (!r.optBoolean("ok")) {
            String err = r.optString("errore", "Errore dallo script");
            if (err.contains("Azione sconosciuta")) err = "Aggiorna lo script del foglio (README, «Aggiornare lo script»)";
            if (err.contains("TUYA_NON_CONFIGURATO")) err = "Collega Tuya in A&C → 💡 Luci → ⚙";
            throw new Exception(err);
        }
        return r;
    }

    static void avviso(Context c, String testo) {
        final String t = testo == null || testo.isEmpty() ? "Nessuna connessione" : testo;
        new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(c, t, Toast.LENGTH_SHORT).show());
    }
}
