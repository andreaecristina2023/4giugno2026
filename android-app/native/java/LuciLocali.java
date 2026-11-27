package it.andreaecristina.casa;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.DhcpInfo;
import android.net.wifi.WifiManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Luci Tuya comandate sul Wi-Fi di casa, senza cloud.
 * Il cloud Tuya serve una volta sola per leggere la "chiave locale" di ogni luce (importa).
 * Dati in SharedPreferences "CapacitorStorage", chiave "luciLocali":
 * { luci: [ { id, nome, categoria, chiave, ip, versione, mappa: { sw, modo, br, brMin, brMax, tp, tpMin, tpMax, co, coV1 }, dps: {...} } ] }
 */
public class LuciLocali {

    static final String[] CATEGORIE = { "dj", "dd", "xdd", "fwd", "dc", "tgq", "tgkg", "kg", "cz", "pc", "sxd", "tyndj", "gyd", "fsd", "mbd", "ty" };
    static final Map<String, String> REGIONI = new TreeMap<>();
    static {
        REGIONI.put("eu", "https://openapi.tuyaeu.com"); REGIONI.put("weu", "https://openapi-weaz.tuyaeu.com");
        REGIONI.put("us", "https://openapi.tuyaus.com"); REGIONI.put("ueaz", "https://openapi-ueaz.tuyaus.com");
        REGIONI.put("in", "https://openapi.tuyain.com"); REGIONI.put("cn", "https://openapi.tuyacn.com");
    }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    static synchronized JSONObject dati(Context c) {
        try { return new JSONObject(prefs(c).getString("luciLocali", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static synchronized void salva(Context c, JSONObject d) { prefs(c).edit().putString("luciLocali", d.toString()).apply(); }
    static JSONArray elencoSalvato(Context c) { JSONArray a = dati(c).optJSONArray("luci"); return a != null ? a : new JSONArray(); }
    public static boolean configurato(Context c) { return elencoSalvato(c).length() > 0; }
    static JSONObject trova(Context c, String id) {
        JSONArray a = elencoSalvato(c);
        for (int i = 0; i < a.length(); i++) { JSONObject l = a.optJSONObject(i); if (l != null && id.equals(l.optString("id"))) return l; }
        return null;
    }
    static synchronized void aggiorna(Context c, JSONObject nuova) {
        try {
            JSONObject d = dati(c);
            JSONArray a = d.optJSONArray("luci"); if (a == null) a = new JSONArray();
            for (int i = 0; i < a.length(); i++) if (nuova.optString("id").equals(a.getJSONObject(i).optString("id"))) { a.put(i, nuova); break; }
            d.put("luci", a); salva(c, d);
        } catch (Exception ignored) { }
    }

    // ================= cloud Tuya: una volta sola =================

    /** Legge dal cloud le luci dell'account collegato, con chiave locale e numeri dei comandi. */
    public static JSONObject importa(Context c, String id, String secret, String regione) throws Exception {
        String base = REGIONI.containsKey(regione) ? REGIONI.get(regione) : "https://openapi.tuyaeu.com";
        Cloud cl = new Cloud(id.trim(), secret.trim(), base);
        cl.token();
        JSONArray dev = new JSONArray();
        String riga = "";
        for (int giri = 0; giri < 10; giri++) {
            TreeMap<String, String> q = new TreeMap<>();
            q.put("size", "100"); if (!riga.isEmpty()) q.put("last_row_key", riga);
            JSONObject r = cl.get("/v1.0/iot-01/associated-users/devices", q);
            JSONArray l = r.optJSONArray("devices"); if (l == null) l = r.optJSONArray("list");
            for (int i = 0; l != null && i < l.length(); i++) dev.put(l.get(i));
            riga = r.optString("last_row_key", "");
            if (!r.optBoolean("has_more") || riga.isEmpty()) break;
        }
        JSONObject vecchi = new JSONObject();
        JSONArray prima = elencoSalvato(c);
        for (int i = 0; i < prima.length(); i++) { JSONObject p = prima.optJSONObject(i); if (p != null) vecchi.put(p.optString("id"), p); }

        JSONArray luci = new JSONArray();
        int altri = 0;
        for (int i = 0; i < dev.length(); i++) {
            JSONObject d = dev.getJSONObject(i);
            if (!eLuce(d)) { altri++; continue; }
            JSONObject l = new JSONObject();
            l.put("id", d.optString("id")).put("nome", d.optString("name", "Luce")).put("categoria", d.optString("category"))
             .put("chiave", d.optString("local_key")).put("prodotto", d.optString("product_id"));
            JSONObject v = vecchi.optJSONObject(d.optString("id"));
            if (v != null) { l.put("ip", v.optString("ip")); l.put("versione", v.optDouble("versione", 0)); }
            l.put("mappa", mappa(cl, d));
            luci.put(l);
        }
        JSONObject out = new JSONObject().put("luci", luci).put("aggiornato", System.currentTimeMillis());
        salva(c, out);
        return new JSONObject().put("luci", luci.length()).put("altri", altri).put("senzaChiave", contaSenzaChiave(luci));
    }

    static int contaSenzaChiave(JSONArray a) { int n = 0; for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optString("chiave").isEmpty()) n++; return n; }

    static boolean eLuce(JSONObject d) {
        String cat = d.optString("category");
        for (String x : CATEGORIE) if (x.equals(cat)) return true;
        JSONArray st = d.optJSONArray("status");
        for (int i = 0; st != null && i < st.length(); i++) if (st.optJSONObject(i).optString("code").matches("^(switch_led|bright_value|colour_data).*")) return true;
        return false;
    }

    /** Numeri dei comandi (DP): dalle specifiche del dispositivo, altrimenti quelli standard delle luci Tuya. */
    static JSONObject mappa(Cloud cl, JSONObject d) throws Exception {
        JSONObject m = new JSONObject();
        try {
            JSONObject sp = cl.get("/v1.1/devices/" + d.optString("id") + "/specifications", null);
            JSONArray tutte = new JSONArray();
            for (String k : new String[] { "functions", "status" }) { JSONArray a = sp.optJSONArray(k); for (int i = 0; a != null && i < a.length(); i++) tutte.put(a.get(i)); }
            for (int i = 0; i < tutte.length(); i++) {
                JSONObject f = tutte.getJSONObject(i);
                String code = f.optString("code"); int dp = f.optInt("dp_id", 0);
                if (dp == 0) continue;
                JSONObject val = new JSONObject();
                try { val = new JSONObject(f.optString("values", "{}")); } catch (Exception ignored) { }
                if (!m.has("sw") && code.matches("switch_led|switch_1|switch")) m.put("sw", dp);
                else if (!m.has("modo") && code.equals("work_mode")) m.put("modo", dp);
                else if (!m.has("br") && code.matches("bright_value(_v2|_1)?")) m.put("br", dp).put("brMin", val.optInt("min", 10)).put("brMax", val.optInt("max", 1000));
                else if (!m.has("tp") && code.matches("temp_value(_v2)?")) m.put("tp", dp).put("tpMin", val.optInt("min", 0)).put("tpMax", val.optInt("max", 1000));
                else if (!m.has("co") && code.matches("colour_data(_v2)?")) {
                    JSONObject s = val.optJSONObject("s");
                    m.put("co", dp).put("coV1", dp == 5 || (s != null && s.optInt("max", 1000) <= 255));
                }
            }
        } catch (Exception e) { /* specifiche non disponibili: uso le standard */ }
        if (!m.has("sw")) {
            boolean v2 = false;
            JSONArray st = d.optJSONArray("status");
            for (int i = 0; st != null && i < st.length(); i++) if (st.optJSONObject(i).optString("code").endsWith("_v2")) v2 = true;
            String cat = d.optString("category");
            if (cat.matches("kg|cz|pc|tgkg")) m.put("sw", 1);
            else if (v2 || cat.matches("dj|dd|xdd|fwd|dc")) m.put("sw", 20).put("modo", 21).put("br", 22).put("brMin", 10).put("brMax", 1000).put("tp", 23).put("tpMin", 0).put("tpMax", 1000).put("co", 24).put("coV1", false);
            else m.put("sw", 1).put("modo", 2).put("br", 3).put("brMin", 25).put("brMax", 255).put("tp", 4).put("tpMin", 0).put("tpMax", 255).put("co", 5).put("coV1", true);
        }
        return m;
    }

    static class Cloud {
        final String id, secret, base; String tok = "";
        Cloud(String id, String secret, String base) { this.id = id; this.secret = secret; this.base = base; }
        void token() throws Exception {
            TreeMap<String, String> q = new TreeMap<>(); q.put("grant_type", "1");
            JSONObject r = chiama("/v1.0/token", q, true);
            tok = r.optString("access_token");
        }
        JSONObject get(String p, TreeMap<String, String> q) throws Exception { return chiama(p, q, false); }
        JSONObject chiama(String percorso, TreeMap<String, String> q, boolean perToken) throws Exception {
            StringBuilder url = new StringBuilder(percorso);
            if (q != null && !q.isEmpty()) {
                url.append('?'); boolean primo = true;
                for (Map.Entry<String, String> e : q.entrySet()) { if (!primo) url.append('&'); url.append(e.getKey()).append('=').append(e.getValue()); primo = false; }
            }
            String t = String.valueOf(System.currentTimeMillis());
            String sts = "GET\n" + hex(MessageDigest.getInstance("SHA-256").digest(new byte[0])) + "\n\n" + url;
            String firma = hmacHex(secret, id + (perToken ? "" : tok) + t + sts).toUpperCase(Locale.ROOT);
            HttpURLConnection con = (HttpURLConnection) new URL(base + url).openConnection();
            con.setConnectTimeout(15000); con.setReadTimeout(20000);
            con.setRequestProperty("client_id", id); con.setRequestProperty("sign", firma); con.setRequestProperty("t", t);
            con.setRequestProperty("sign_method", "HMAC-SHA256"); con.setRequestProperty("lang", "it");
            if (!perToken) con.setRequestProperty("access_token", tok);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            InputStream in = con.getResponseCode() < 400 ? con.getInputStream() : con.getErrorStream();
            if (in != null) { byte[] b = new byte[8192]; int k; while ((k = in.read(b)) > 0) out.write(b, 0, k); in.close(); }
            con.disconnect();
            JSONObject j = new JSONObject(out.toString("UTF-8"));
            if (!j.optBoolean("success")) throw new Exception(errore(j.optInt("code"), j.optString("msg")));
            Object r = j.opt("result");
            return r instanceof JSONObject ? (JSONObject) r : new JSONObject().put("list", r);
        }
    }

    static String errore(int codice, String msg) {
        switch (codice) {
            case 1004: return "Firma non valida: controlla l'Access Secret (codice 1004)";
            case 1106: return "Permesso negato: collega l'account Tuya Smart al progetto (Devices → Link App Account) (codice 1106)";
            case 1108: return "Data center sbagliato: per l'Italia è Europa centrale (codice 1108)";
            case 2009: return "Al progetto manca il servizio IoT Core (codice 2009)";
            case 28841101: case 28841002: return "Il periodo di prova di Tuya è scaduto: rinnovalo per rileggere le chiavi (codice " + codice + ")";
            case 28841105: return "Il progetto non è autorizzato: aggiungi il servizio IoT Core (codice 28841105)";
            default: return "Tuya: " + msg + " (codice " + codice + ")";
        }
    }
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x & 0xff)); return s.toString(); }
    static String hmacHex(String chiave, String testo) throws Exception {
        Mac m = Mac.getInstance("HmacSHA256"); m.init(new SecretKeySpec(chiave.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return hex(m.doFinal(testo.getBytes(StandardCharsets.UTF_8)));
    }

    // ================= rete di casa =================

    /** Cerca le luci sul Wi-Fi e aggiorna indirizzo e versione del protocollo. Restituisce quante ne ha trovate. */
    public static int cerca(Context c) {
        WifiManager wm = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = null;
        String bc = null;
        try {
            if (wm != null) {
                lock = wm.createMulticastLock("aec-luci"); lock.setReferenceCounted(false); lock.acquire();
                DhcpInfo dh = wm.getDhcpInfo();
                if (dh != null && dh.ipAddress != 0) {
                    int b = (dh.ipAddress & dh.netmask) | ~dh.netmask;
                    bc = (b & 0xff) + "." + ((b >> 8) & 0xff) + "." + ((b >> 16) & 0xff) + "." + ((b >> 24) & 0xff);
                }
            }
        } catch (Exception ignored) { }
        Map<String, String> trovati;
        try { trovati = TuyaLan.cerca(6000, bc); }
        finally { try { if (lock != null) lock.release(); } catch (Exception ignored) { } }
        int n = 0;
        try {
            JSONObject d = dati(c);
            JSONArray a = d.optJSONArray("luci");
            List<JSONObject> mancanti = new ArrayList<>();
            List<String> usati = new ArrayList<>();
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject l = a.getJSONObject(i);
                String ann = trovati.get(l.optString("id"));
                if (ann == null) { mancanti.add(l); continue; }
                JSONObject j = new JSONObject(ann);
                l.put("ip", j.optString("ip")); l.put("versione", j.optDouble("version", 3.3)); n++;
                usati.add(j.optString("ip"));
            }
            // piano B: nessun annuncio (porta occupata da un'altra app, router che blocca i broadcast)
            if (!mancanti.isEmpty() && wm != null) n += scansione(wm, mancanti, usati);
            d.put("cercato", System.currentTimeMillis());
            salva(c, d);
        } catch (Exception ignored) { }
        return n;
    }

    /** Prova tutti gli indirizzi della rete /24 sulla porta 6668 e riconosce le luci provando le loro chiavi. */
    static int scansione(WifiManager wm, List<JSONObject> mancanti, List<String> usati) {
        DhcpInfo dh = wm.getDhcpInfo();
        if (dh == null || dh.ipAddress == 0) return 0;
        int ip = dh.ipAddress;
        String rete = (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + ".";
        String mio = rete + ((ip >> 24) & 0xff);
        ExecutorService ex = Executors.newFixedThreadPool(48);
        List<Future<String>> fut = new ArrayList<>();
        for (int k = 1; k < 255; k++) {
            final String h = rete + k;
            if (h.equals(mio) || usati.contains(h)) continue;
            fut.add(ex.submit(() -> {
                try (java.net.Socket so = new java.net.Socket()) { so.connect(new java.net.InetSocketAddress(h, 6668), 500); return h; }
                catch (Exception e) { return null; }
            }));
        }
        List<String> aperti = new ArrayList<>();
        for (Future<String> f : fut) { try { String h = f.get(3, TimeUnit.SECONDS); if (h != null) aperti.add(h); } catch (Exception ignored) { } }
        ex.shutdownNow();
        int n = 0;
        for (JSONObject l : mancanti) {
            if (l.optString("chiave").isEmpty()) continue;
            esterno:
            for (String h : aperti) {
                for (double v : new double[] { 3.3, 3.4, 3.5 }) {
                    try {
                        TuyaLan t = new TuyaLan(l.optString("id"), h, l.optString("chiave"), v);
                        t.attesa = 2500;
                        if (estraiDps(t.stato()) != null) { l.put("ip", h); l.put("versione", v); aperti.remove(h); n++; break esterno; }
                    } catch (Exception ignored) { }
                }
            }
        }
        return n;
    }

    /** Stato di tutte le luci, nello stesso formato del cloud (id, nome, online, acceso, luminosita…). */
    public static JSONObject elenco(Context c) throws Exception {
        JSONArray salvate = elencoSalvato(c);
        boolean mancaIp = false;
        for (int i = 0; i < salvate.length(); i++) if (salvate.getJSONObject(i).optString("ip").isEmpty()) mancaIp = true;
        if (mancaIp) { cerca(c); salvate = elencoSalvato(c); }
        ExecutorService ex = Executors.newFixedThreadPool(Math.max(1, Math.min(6, salvate.length())));
        List<Future<JSONObject>> fut = new ArrayList<>();
        for (int i = 0; i < salvate.length(); i++) {
            final JSONObject l = salvate.getJSONObject(i);
            fut.add(ex.submit(() -> leggi(c, l, true)));
        }
        JSONArray out = new JSONArray();
        boolean nessuna = true;
        for (int i = 0; i < fut.size(); i++) {
            JSONObject r;
            try { r = fut.get(i).get(12, TimeUnit.SECONDS); } catch (Exception e) { r = normalizza(salvate.getJSONObject(i), false); }
            if (r.optBoolean("online")) nessuna = false;
            out.put(r);
        }
        ex.shutdownNow();
        // se nessuna risponde forse hanno cambiato indirizzo: ricerco una volta
        if (nessuna && !mancaIp && salvate.length() > 0 && System.currentTimeMillis() - dati(c).optLong("cercato") > 60000 && cerca(c) > 0) return elenco(c);
        return new JSONObject().put("configurato", true).put("locale", true).put("luci", out).put("scene", new JSONArray());
    }

    static JSONObject leggi(Context c, JSONObject l, boolean salvaDps) throws Exception {
        if (l.optString("ip").isEmpty() || l.optString("chiave").isEmpty()) return normalizza(l, false);
        try {
            String r = lan(l).stato();
            JSONObject dps = estraiDps(r);
            if (dps == null) return normalizza(l, false);
            l.put("dps", dps);
            if (salvaDps) aggiorna(c, l);
            return normalizza(l, true);
        } catch (Exception e) {
            // con versione sconosciuta provo le altre
            if (l.optDouble("versione", 0) == 0) {
                for (double v : new double[] { 3.3, 3.4, 3.5 }) {
                    try {
                        l.put("versione", v);
                        JSONObject dps = estraiDps(lan(l).stato());
                        if (dps != null) { l.put("dps", dps); aggiorna(c, l); return normalizza(l, true); }
                    } catch (Exception ignored) { }
                }
                l.put("versione", 0);
            }
            return normalizza(l, false).put("errore", e.getMessage());
        }
    }

    static TuyaLan lan(JSONObject l) {
        double v = l.optDouble("versione", 3.3); if (v < 3.3) v = 3.3;
        return new TuyaLan(l.optString("id"), l.optString("ip"), l.optString("chiave"), v);
    }

    static JSONObject estraiDps(String r) {
        if (r == null || r.isEmpty()) return null;
        try {
            JSONObject j = new JSONObject(r);
            if (j.has("dps")) return j.getJSONObject("dps");
            JSONObject d = j.optJSONObject("data");
            return d != null ? d.optJSONObject("dps") : null;
        } catch (Exception e) { return null; }
    }

    /** Comando: { acceso | luminosita (%) | temperatura (%) | colore {h, s} }. Restituisce la luce aggiornata. */
    public static JSONObject comando(Context c, String id, JSONObject cmd) throws Exception {
        JSONObject l = trova(c, id);
        if (l == null) throw new Exception("Luce non trovata: rileggi le luci da Tuya (💡 Luci → ⚙)");
        if (l.optString("ip").isEmpty()) { cerca(c); l = trova(c, id); }
        if (l == null || l.optString("ip").isEmpty()) throw new Exception("Non trovo la luce sul Wi-Fi: sei a casa?");
        JSONObject m = l.optJSONObject("mappa"); if (m == null) m = new JSONObject();
        JSONObject dps = l.optJSONObject("dps"); if (dps == null) dps = new JSONObject();
        JSONObject invio = new JSONObject();
        String modoOra = m.has("modo") ? dps.optString(String.valueOf(m.optInt("modo")), "white") : "white";
        if (cmd.has("acceso") && m.has("sw")) invio.put(String.valueOf(m.getInt("sw")), cmd.getBoolean("acceso"));
        if (cmd.has("temperatura") && m.has("tp")) {
            if (m.has("modo")) invio.put(String.valueOf(m.getInt("modo")), "white");
            invio.put(String.valueOf(m.getInt("tp")), daPct(cmd.getInt("temperatura"), m.optInt("tpMin", 0), m.optInt("tpMax", 1000)));
            modoOra = "white";
        }
        if (cmd.has("colore") && m.has("co")) {
            JSONObject col = cmd.getJSONObject("colore");
            int[] prima = coloreDa(dps.optString(String.valueOf(m.getInt("co"))), m.optBoolean("coV1"));
            int v = cmd.has("luminosita") ? cmd.getInt("luminosita") : (prima != null && prima[2] > 0 ? prima[2] : 100);
            if (m.has("modo")) invio.put(String.valueOf(m.getInt("modo")), "colour");
            invio.put(String.valueOf(m.getInt("co")), coloreA(col.optInt("h"), col.optInt("s", 100), v, m.optBoolean("coV1")));
            modoOra = "colour";
        }
        if (cmd.has("luminosita") && !cmd.has("colore")) {
            if ("colour".equals(modoOra) && m.has("co")) {
                int[] prima = coloreDa(dps.optString(String.valueOf(m.getInt("co"))), m.optBoolean("coV1"));
                invio.put(String.valueOf(m.getInt("co")), coloreA(prima != null ? prima[0] : 0, prima != null ? prima[1] : 100, cmd.getInt("luminosita"), m.optBoolean("coV1")));
            } else if (m.has("br")) invio.put(String.valueOf(m.getInt("br")), daPct(cmd.getInt("luminosita"), m.optInt("brMin", 10), m.optInt("brMax", 1000)));
        }
        if ((cmd.has("luminosita") || cmd.has("colore") || cmd.has("temperatura")) && m.has("sw")) invio.put(String.valueOf(m.getInt("sw")), true);
        if (invio.length() == 0) throw new Exception("Questa luce non ha quel comando");
        String r;
        try { r = lan(l).imposta(invio.toString()); }
        catch (Exception e) {
            // forse ha cambiato indirizzo: ricerco e riprovo una volta
            if (cerca(c) > 0) { l = trova(c, id); r = lan(l).imposta(invio.toString()); } else throw e;
        }
        JSONObject arrivati = estraiDps(r);
        for (Iterator<String> it = invio.keys(); it.hasNext(); ) { String k = it.next(); dps.put(k, invio.get(k)); }
        if (arrivati != null) for (Iterator<String> it = arrivati.keys(); it.hasNext(); ) { String k = it.next(); dps.put(k, arrivati.get(k)); }
        l.put("dps", dps);
        aggiorna(c, l);
        return normalizza(l, true);
    }

    static int daPct(int pct, int min, int max) { pct = Math.max(0, Math.min(100, pct)); return Math.round(min + (max - min) * pct / 100f); }
    static int aPct(int v, int min, int max) { if (max <= min) return 0; return Math.max(0, Math.min(100, Math.round((v - min) * 100f / (max - min)))); }

    /** Colore locale: v2 = "hhhhssssvvvv" (h 0-360, s e v 0-1000); v1 = "rrggbb0hhhssvv" (s e v 0-255). Restituisce h, s%, v%. */
    static int[] coloreDa(String x, boolean v1) {
        try {
            if (x == null) return null;
            if (x.length() == 12) return new int[] { Integer.parseInt(x.substring(0, 4), 16), Integer.parseInt(x.substring(4, 8), 16) / 10, Integer.parseInt(x.substring(8, 12), 16) / 10 };
            if (x.length() == 14) return new int[] { Integer.parseInt(x.substring(6, 10), 16), Math.round(Integer.parseInt(x.substring(10, 12), 16) * 100 / 255f), Math.round(Integer.parseInt(x.substring(12, 14), 16) * 100 / 255f) };
            if (x.startsWith("{")) { JSONObject j = new JSONObject(x); int mx = v1 ? 255 : 1000; return new int[] { j.optInt("h"), Math.round(j.optInt("s") * 100f / mx), Math.round(j.optInt("v") * 100f / mx) }; }
        } catch (Exception ignored) { }
        return null;
    }
    static String coloreA(int h, int s, int v, boolean v1) {
        h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)); v = Math.max(1, Math.min(100, v));
        if (!v1) return String.format(Locale.ROOT, "%04x%04x%04x", h, s * 10, v * 10);
        float[] rgb = hsv(h, s / 100f, v / 100f);
        return String.format(Locale.ROOT, "%02x%02x%02x%04x%02x%02x", Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), h, Math.round(s * 2.55f), Math.round(v * 2.55f));
    }
    static float[] hsv(float h, float s, float v) {
        float c = v * s, x = c * (1 - Math.abs((h / 60f) % 2 - 1)), m = v - c, r, g, b;
        if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
        return new float[] { r + m, g + m, b + m };
    }

    /** Stesso formato di tuyaLuce nello script, così la pagina 💡 Luci non cambia. */
    static JSONObject normalizza(JSONObject l, boolean online) {
        JSONObject o = new JSONObject();
        try {
            JSONObject m = l.optJSONObject("mappa"); if (m == null) m = new JSONObject();
            JSONObject dps = l.optJSONObject("dps"); if (dps == null) dps = new JSONObject();
            String sw = m.has("sw") ? String.valueOf(m.getInt("sw")) : null, br = m.has("br") ? String.valueOf(m.getInt("br")) : null,
                tp = m.has("tp") ? String.valueOf(m.getInt("tp")) : null, co = m.has("co") ? String.valueOf(m.getInt("co")) : null,
                md = m.has("modo") ? String.valueOf(m.getInt("modo")) : null;
            String modo = md != null ? dps.optString(md, "white") : "white";
            o.put("id", l.optString("id")).put("nome", l.optString("nome", "Luce")).put("categoria", l.optString("categoria")).put("online", online).put("modo", modo);
            o.put("acceso", sw != null && dps.has(sw) ? dps.optBoolean(sw) : JSONObject.NULL);
            o.put("ha", new JSONObject().put("interruttore", sw != null).put("luminosita", br != null).put("temperatura", tp != null).put("colore", co != null));
            o.put("luminosita", br != null && dps.has(br) ? aPct(dps.optInt(br), m.optInt("brMin", 10), m.optInt("brMax", 1000)) : JSONObject.NULL);
            o.put("temperatura", tp != null && dps.has(tp) ? aPct(dps.optInt(tp), m.optInt("tpMin", 0), m.optInt("tpMax", 1000)) : JSONObject.NULL);
            int[] col = co != null ? coloreDa(dps.optString(co, null), m.optBoolean("coV1")) : null;
            o.put("colore", col != null ? new JSONObject().put("h", col[0]).put("s", col[1]).put("v", col[2]) : JSONObject.NULL);
            if ("colour".equals(modo) && col != null) o.put("luminosita", col[2]);
            o.put("ip", l.optString("ip")).put("versione", l.optDouble("versione", 0));
        } catch (Exception ignored) { }
        return o;
    }
}
