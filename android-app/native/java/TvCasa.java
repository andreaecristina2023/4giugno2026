package it.andreaecristina.casa;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.DhcpInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * TV LG di casa: impostazioni in SharedPreferences "CapacitorStorage", chiave "tv": { ip, chiave, mac, app: [ {id, nome} ], ingressi: [ {id, nome} ] }.
 * Tiene aperto il collegamento per 90 secondi dopo l'ultimo comando, così i tasti rispondono subito.
 */
public class TvCasa {

    static TvLg sessione;
    static final Handler h = new Handler(Looper.getMainLooper());
    static final Runnable chiudi = () -> { synchronized (TvCasa.class) { if (sessione != null) sessione.chiudiTutto(); sessione = null; } };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    public static JSONObject conf(Context c) { try { return new JSONObject(prefs(c).getString("tv", "{}")); } catch (Exception e) { return new JSONObject(); } }
    static void salva(Context c, JSONObject d) { prefs(c).edit().putString("tv", d.toString()).apply(); }

    static synchronized TvLg tv(Context c) throws Exception {
        JSONObject d = conf(c);
        if (d.optString("ip").isEmpty() || d.optString("chiave").isEmpty()) throw new Exception("Collega prima la TV (📺 TV → ⚙)");
        if (sessione == null || !sessione.ip.equals(d.optString("ip"))) { if (sessione != null) sessione.chiudiTutto(); sessione = new TvLg(d.optString("ip"), d.optString("chiave")); }
        h.removeCallbacks(chiudi); h.postDelayed(chiudi, 90000);
        return sessione;
    }

    static String broadcast(Context c) {
        try {
            WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            DhcpInfo dh = wm.getDhcpInfo();
            if (dh == null || dh.ipAddress == 0) return null;
            int b = (dh.ipAddress & dh.netmask) | ~dh.netmask;
            return (b & 0xff) + "." + ((b >> 8) & 0xff) + "." + ((b >> 16) & 0xff) + "." + ((b >> 24) & 0xff);
        } catch (Exception e) { return null; }
    }

    public static String cerca(Context c) {
        WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = null;
        try { if (wm != null) { lock = wm.createMulticastLock("aec-tv"); lock.setReferenceCounted(false); lock.acquire(); } } catch (Exception ignored) { }
        try { return TvLg.cerca(5000); }
        finally { try { if (lock != null) lock.release(); } catch (Exception ignored) { } }
    }

    /** Abbinamento (la TV chiede "Consenti"), poi legge MAC, app e ingressi. */
    public static JSONObject abbina(Context c, String ip) throws Exception {
        synchronized (TvCasa.class) { if (sessione != null) sessione.chiudiTutto(); sessione = null; }
        JSONObject d = conf(c);
        TvLg t = new TvLg(ip, ip.equals(d.optString("ip")) ? d.optString("chiave") : "");
        String chiave = t.abbina(60000);
        d.put("ip", ip).put("chiave", chiave);
        salva(c, d);
        try { aggiornaInfo(c); } catch (Exception ignored) { }
        return conf(c);
    }

    public static JSONObject aggiornaInfo(Context c) throws Exception {
        TvLg t = tv(c);
        JSONObject d = conf(c);
        try {
            String r = t.chiediAperto("ssap://com.webos.service.connectionmanager/getinfo", "{}");
            String mac = TvLg.campo(r, "macAddress");
            if (mac != null && !mac.isEmpty()) d.put("mac", mac);
        } catch (Exception ignored) { }
        try {
            JSONObject r = new JSONObject(t.chiediAperto("ssap://com.webos.applicationManager/listLaunchPoints", "{}"));
            JSONArray l = r.optJSONArray("launchPoints"), app = new JSONArray();
            for (int i = 0; l != null && i < l.length(); i++) {
                JSONObject x = l.optJSONObject(i);
                if (x != null && !x.optString("id").isEmpty()) app.put(new JSONObject().put("id", x.optString("id")).put("nome", x.optString("title", x.optString("id"))));
            }
            if (app.length() > 0) d.put("app", app);
        } catch (Exception ignored) { }
        try {
            JSONObject r = new JSONObject(t.chiediAperto("ssap://tv/getExternalInputList", "{}"));
            JSONArray l = r.optJSONArray("devices"), ing = new JSONArray();
            for (int i = 0; l != null && i < l.length(); i++) {
                JSONObject x = l.optJSONObject(i);
                if (x != null) ing.put(new JSONObject().put("id", x.optString("id")).put("nome", x.optString("label", x.optString("id"))));
            }
            if (ing.length() > 0) d.put("ingressi", ing);
        } catch (Exception ignored) { }
        salva(c, d);
        return d;
    }

    /** Comando: { tipo: "tasto"|"ssap"|"app"|"ingresso"|"accendi"|"spegni"|"volume", valore, payload } */
    public static JSONObject comando(Context c, JSONObject cmd) throws Exception {
        String tipo = cmd.optString("tipo"), v = cmd.optString("valore");
        JSONObject d = conf(c);
        if ("accendi".equals(tipo)) {
            if (d.optString("mac").isEmpty()) throw new Exception("Non conosco il MAC della TV: accendila col telecomando e tocca ↻ in 📺 TV → ⚙");
            TvLg.accendi(d.optString("mac"), broadcast(c));
            return new JSONObject().put("ok", true);
        }
        TvLg t = tv(c);
        String r = "{}";
        switch (tipo) {
            case "tasto": t.tastoAperto(v); break;
            case "spegni": r = t.chiediAperto("ssap://system/turnOff", "{}"); synchronized (TvCasa.class) { t.chiudiTutto(); sessione = null; } break;
            case "app": r = t.chiediAperto("ssap://system.launcher/launch", new JSONObject().put("id", v).toString()); break;
            case "ingresso": r = t.chiediAperto("ssap://tv/switchInput", new JSONObject().put("inputId", v).toString()); break;
            case "ssap": r = t.chiediAperto(v, cmd.has("payload") ? cmd.get("payload").toString() : "{}"); break;
            default: throw new Exception("Comando sconosciuto");
        }
        try { return new JSONObject(r); } catch (Exception e) { return new JSONObject(); }
    }
}
