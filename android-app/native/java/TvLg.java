package it.andreaecristina.casa;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Telecomando delle TV LG webOS sul Wi-Fi di casa (protocollo SSAP su WebSocket, porta 3000 o 3001 con TLS).
 * Abbinamento: la TV chiede "Consenti" e restituisce una chiave (client-key) da riusare.
 * Frecce/OK/Indietro/Home passano dal "pointer input socket". Accensione: Wake-on-LAN sul MAC della TV.
 * Nessuna dipendenza Android: JSON scritto e letto a mano.
 */
public class TvLg {

    public static class Errore extends Exception { public Errore(String m) { super(m); } }

    static final String MANIFEST = "{\"manifestVersion\":1,\"appVersion\":\"1.1\",\"signed\":{\"created\":\"20140509\",\"appId\":\"com.lge.test\",\"vendorId\":\"com.lge\","
        + "\"localizedAppNames\":{\"\":\"LG Remote App\"},\"localizedVendorNames\":{\"\":\"LG Electronics\"},\"permissions\":[\"TEST_SECURE\",\"CONTROL_INPUT_TEXT\",\"CONTROL_MOUSE_AND_KEYBOARD\","
        + "\"READ_INSTALLED_APPS\",\"READ_LGE_SDX\",\"READ_NOTIFICATIONS\",\"SEARCH\",\"WRITE_SETTINGS\",\"WRITE_NOTIFICATION_ALERT\",\"CONTROL_POWER\",\"READ_CURRENT_CHANNEL\",\"READ_RUNNING_APPS\","
        + "\"READ_UPDATE_INFO\",\"UPDATE_FROM_REMOTE_APP\",\"READ_LGE_TV_INPUT_EVENTS\",\"READ_TV_CURRENT_TIME\"],\"serial\":\"2f930e2d2cfe083771f68e4fe7bb07\"},"
        + "\"permissions\":[\"LAUNCH\",\"LAUNCH_WEBAPP\",\"APP_TO_APP\",\"CLOSE\",\"TEST_OPEN\",\"TEST_PROTECTED\",\"CONTROL_AUDIO\",\"CONTROL_DISPLAY\",\"CONTROL_INPUT_JOYSTICK\","
        + "\"CONTROL_INPUT_MEDIA_RECORDING\",\"CONTROL_INPUT_MEDIA_PLAYBACK\",\"CONTROL_INPUT_TV\",\"CONTROL_POWER\",\"READ_APP_STATUS\",\"READ_CURRENT_CHANNEL\",\"READ_INPUT_DEVICE_LIST\","
        + "\"READ_NETWORK_STATE\",\"READ_RUNNING_APPS\",\"READ_TV_CHANNEL_LIST\",\"WRITE_NOTIFICATION_TOAST\",\"READ_POWER_STATE\",\"READ_COUNTRY_INFO\",\"READ_SETTINGS\",\"CONTROL_TV_SCREEN\","
        + "\"CONTROL_TV_STANBY\",\"CONTROL_FAVORITE_GROUP\",\"CONTROL_USER_INFO\",\"CHECK_BLUETOOTH_DEVICE\",\"CONTROL_BLUETOOTH\",\"CONTROL_TIMER_INFO\",\"STB_INTERNAL_CONNECTION\","
        + "\"CONTROL_RECORDING\",\"READ_RECORDING_STATE\",\"WRITE_RECORDING_LIST\",\"READ_RECORDING_LIST\",\"READ_RECORDING_SCHEDULE\",\"WRITE_RECORDING_SCHEDULE\",\"READ_STORAGE_DEVICE_LIST\","
        + "\"READ_TV_PROGRAM_INFO\",\"CONTROL_BOX_CHANNEL\",\"READ_TV_ACR_AUTH_TOKEN\",\"READ_TV_CONTENT_STATE\",\"READ_TV_CURRENT_TIME\",\"ADD_LAUNCHER_CHANNEL\",\"SET_CHANNEL_SKIP\","
        + "\"RELEASE_CHANNEL_SKIP\",\"CONTROL_CHANNEL_BLOCK\",\"DELETE_SELECT_CHANNEL\",\"CONTROL_CHANNEL_GROUP\",\"SCAN_TV_CHANNELS\",\"CONTROL_TV_POWER\",\"CONTROL_WOL\"],"
        + "\"signatures\":[{\"signatureVersion\":1,\"signature\":\"eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw==\"}]}";

    public final String ip;
    public String chiave;
    int timeout = 5000;
    Ws ws;
    int seq = 1;

    public TvLg(String ip, String chiave) { this.ip = ip; this.chiave = chiave == null ? "" : chiave; }

    // ---------------- comandi ----------------

    /** Abbinamento: se la TV chiede conferma aspetta fino a "attesaMs". Restituisce la chiave. */
    public String abbina(int attesaMs) throws Exception {
        apri();
        try { return registra(attesaMs); } finally { chiudi(); }
    }

    /** Richiesta SSAP (es. ssap://audio/volumeUp). Restituisce il payload JSON della risposta. */
    public String chiedi(String uri, String payload) throws Exception {
        apri();
        try { registra(timeout); return richiesta(uri, payload); } finally { chiudi(); }
    }

    /** Tasto del telecomando (UP, DOWN, LEFT, RIGHT, ENTER, BACK, HOME, EXIT, MENU, INFO, 0-9…). */
    public void tasto(String nome) throws Exception {
        apri();
        try {
            registra(timeout);
            String r = richiesta("ssap://com.webos.service.networkinput/getPointerInputSocket", "{}");
            String percorso = campo(r, "socketPath");
            if (percorso == null) throw new Errore("La TV non ha dato il canale dei tasti");
            Matcher m = Pattern.compile("^(wss?)://([^:/]+)(?::(\\d+))?(/.*)$").matcher(percorso);
            if (!m.find()) throw new Errore("Canale dei tasti non valido");
            boolean tls = "wss".equals(m.group(1));
            int porta = m.group(3) != null ? Integer.parseInt(m.group(3)) : (tls ? 3001 : 3000);
            Ws p = new Ws();
            p.apri(ip, porta, m.group(4), tls, timeout);
            try { p.invia("type:button\nname:" + nome + "\n\n"); Thread.sleep(120); } finally { p.chiudi(); }
        } finally { chiudi(); }
    }

    // ---------------- sessione aperta (tasti veloci) ----------------
    Ws puntatore;

    public synchronized void connetti() throws Exception { if (ws == null) { apri(); try { registra(timeout); } catch (Exception e) { chiudi(); throw e; } } }

    /** Come chiedi(), ma tiene aperto il collegamento; se è caduto lo riapre una volta. */
    public synchronized String chiediAperto(String uri, String payload) throws Exception {
        try { connetti(); return richiesta(uri, payload); }
        catch (Errore e) { if (e.getMessage() != null && e.getMessage().startsWith("La TV dice")) throw e; chiudiTutto(); connetti(); return richiesta(uri, payload); }
        catch (Exception e) { chiudiTutto(); connetti(); return richiesta(uri, payload); }
    }

    public synchronized void tastoAperto(String nome) throws Exception {
        for (int volta = 0; volta < 2; volta++) {
            try {
                if (puntatore == null) {
                    connetti();
                    String r = richiesta("ssap://com.webos.service.networkinput/getPointerInputSocket", "{}");
                    String percorso = campo(r, "socketPath");
                    Matcher m = Pattern.compile("^(wss?)://([^:/]+)(?::(\\d+))?(/.*)$").matcher(percorso == null ? "" : percorso);
                    if (!m.find()) throw new Errore("La TV non ha dato il canale dei tasti");
                    boolean tls = "wss".equals(m.group(1));
                    Ws p = new Ws();
                    p.apri(ip, m.group(3) != null ? Integer.parseInt(m.group(3)) : (tls ? 3001 : 3000), m.group(4), tls, timeout);
                    puntatore = p;
                }
                puntatore.invia("type:button\nname:" + nome + "\n\n");
                return;
            } catch (Exception e) { chiudiTutto(); if (volta == 1) throw e; }
        }
    }

    public synchronized void chiudiTutto() { if (puntatore != null) puntatore.chiudi(); puntatore = null; chiudi(); }

    // ---------------- protocollo ----------------

    void apri() throws Exception {
        ws = new Ws();
        try { ws.apri(ip, 3000, "/", false, timeout); }
        catch (Exception e) {
            // TV più recenti: solo TLS sulla 3001
            try { ws = new Ws(); ws.apri(ip, 3001, "/", true, timeout); }
            catch (Exception e2) { throw new Errore("La TV non risponde su " + ip + " (è accesa? sei sul Wi-Fi di casa?)"); }
        }
    }
    void chiudi() { if (ws != null) ws.chiudi(); ws = null; }

    String registra(int attesaMs) throws Exception {
        String id = "reg" + (seq++);
        ws.invia("{\"type\":\"register\",\"id\":\"" + id + "\",\"payload\":{\"forcePairing\":false,\"pairingType\":\"PROMPT\","
            + (chiave.isEmpty() ? "" : "\"client-key\":\"" + chiave + "\",") + "\"manifest\":" + MANIFEST + "}}");
        long fine = System.currentTimeMillis() + Math.max(timeout, attesaMs);
        while (System.currentTimeMillis() < fine) {
            String t;
            try { t = ws.ricevi((int) Math.max(500, fine - System.currentTimeMillis())); } catch (SocketTimeoutException e) { break; }
            if (t == null) break;
            String tipo = campo(t, "type");
            if ("registered".equals(tipo)) { String k = campo(t, "client-key"); if (k != null) chiave = k; return chiave; }
            if ("error".equals(tipo)) throw new Errore("La TV ha rifiutato il collegamento" + (campo(t, "error") != null ? ": " + campo(t, "error") : ""));
            // "response" con pairingType PROMPT: la TV sta chiedendo "Consenti", aspetto
        }
        throw new Errore(chiave.isEmpty() ? "Nessuna risposta: tocca «Consenti» sulla TV entro un minuto" : "La TV non ha confermato il collegamento: rifai l'abbinamento");
    }

    String richiesta(String uri, String payload) throws Exception {
        String id = "req" + (seq++);
        ws.invia("{\"type\":\"request\",\"id\":\"" + id + "\",\"uri\":\"" + uri + "\",\"payload\":" + (payload == null ? "{}" : payload) + "}");
        long fine = System.currentTimeMillis() + timeout;
        while (System.currentTimeMillis() < fine) {
            String t;
            try { t = ws.ricevi((int) Math.max(500, fine - System.currentTimeMillis())); } catch (SocketTimeoutException e) { break; }
            if (t == null) break;
            if (!t.contains("\"" + id + "\"")) continue;
            if ("error".equals(campo(t, "type"))) throw new Errore("La TV dice: " + (campo(t, "error") != null ? campo(t, "error") : "errore"));
            int i = t.indexOf("\"payload\"");
            if (i < 0) return "{}";
            int j = t.indexOf('{', i);
            return j >= 0 ? t.substring(j, t.lastIndexOf('}')).trim() : "{}";
        }
        throw new Errore("La TV non ha risposto");
    }

    static String campo(String j, String nome) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(nome) + "\"\\s*:\\s*\"([^\"]*)\"").matcher(j);
        return m.find() ? m.group(1) : null;
    }

    // ---------------- accensione e ricerca ----------------

    /** Wake-on-LAN: la TV deve avere attivo "Accendi tramite Wi-Fi / Mobile TV On". */
    public static void accendi(String mac, String broadcast) throws Exception {
        String h = mac.replaceAll("[^0-9A-Fa-f]", "");
        if (h.length() != 12) throw new Errore("Indirizzo MAC della TV non valido");
        byte[] m = new byte[6];
        for (int i = 0; i < 6; i++) m[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
        byte[] p = new byte[102];
        for (int i = 0; i < 6; i++) p[i] = (byte) 0xff;
        for (int k = 0; k < 16; k++) System.arraycopy(m, 0, p, 6 + k * 6, 6);
        try (DatagramSocket s = new DatagramSocket()) {
            s.setBroadcast(true);
            InetAddress dest = InetAddress.getByName(broadcast != null ? broadcast : "255.255.255.255");
            for (int volta = 0; volta < 3; volta++) {
                s.send(new DatagramPacket(p, p.length, dest, 9));
                s.send(new DatagramPacket(p, p.length, dest, 7));
                Thread.sleep(100);
            }
        }
    }

    /** Cerca TV LG webOS sulla rete (SSDP): restituisce l'indirizzo IP della prima trovata o null. */
    public static String cerca(int ms) {
        String q = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:lge-com:service:webos-second-screen:1\r\n\r\n";
        try (DatagramSocket s = new DatagramSocket()) {
            s.setSoTimeout(700);
            byte[] b = q.getBytes(StandardCharsets.US_ASCII);
            long fine = System.currentTimeMillis() + ms;
            int giro = 0;
            while (System.currentTimeMillis() < fine) {
                if (giro++ % 3 == 0) s.send(new DatagramPacket(b, b.length, InetAddress.getByName("239.255.255.250"), 1900));
                try {
                    byte[] buf = new byte[2048];
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    String r = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8).toLowerCase();
                    if (r.contains("webos") || r.contains("lge")) return p.getAddress().getHostAddress();
                } catch (SocketTimeoutException e) { /* riprovo */ }
            }
        } catch (Exception ignored) { }
        return null;
    }

    // ---------------- WebSocket minimo (RFC 6455, solo testo) ----------------

    static class Ws {
        Socket s; InputStream in; OutputStream out;
        final SecureRandom caso = new SecureRandom();

        void apri(String host, int porta, String percorso, boolean tls, int timeout) throws Exception {
            if (tls) {
                SSLContext ctx = SSLContext.getInstance("TLS");
                ctx.init(null, new TrustManager[] { new X509TrustManager() { // certificato autofirmato della TV, solo rete di casa
                    public void checkClientTrusted(X509Certificate[] c, String a) { }
                    public void checkServerTrusted(X509Certificate[] c, String a) { }
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                } }, new SecureRandom());
                Socket raw = new Socket();
                raw.connect(new InetSocketAddress(host, porta), timeout);
                SSLSocket ss = (SSLSocket) ctx.getSocketFactory().createSocket(raw, host, porta, true);
                ss.startHandshake();
                s = ss;
            } else {
                s = new Socket();
                s.connect(new InetSocketAddress(host, porta), timeout);
            }
            s.setSoTimeout(timeout);
            s.setTcpNoDelay(true);
            in = s.getInputStream(); out = s.getOutputStream();
            byte[] k = new byte[16]; caso.nextBytes(k);
            String chiave = base64(k);
            String req = "GET " + percorso + " HTTP/1.1\r\nHost: " + host + ":" + porta + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                + "Sec-WebSocket-Key: " + chiave + "\r\nSec-WebSocket-Version: 13\r\n\r\n";
            out.write(req.getBytes(StandardCharsets.US_ASCII)); out.flush();
            ByteArrayOutputStream h = new ByteArrayOutputStream();
            int a = 0, b2 = 0, c = 0, d;
            while ((d = in.read()) >= 0) {
                h.write(d);
                if (a == '\r' && b2 == '\n' && c == '\r' && d == '\n') break;
                a = b2; b2 = c; c = d;
                if (h.size() > 8192) break;
            }
            String risposta = h.toString("US-ASCII");
            if (!risposta.startsWith("HTTP/1.1 101")) throw new Errore("La TV non accetta il collegamento");
        }

        void invia(String testo) throws Exception {
            byte[] p = testo.getBytes(StandardCharsets.UTF_8);
            ByteArrayOutputStream f = new ByteArrayOutputStream();
            f.write(0x81);
            if (p.length < 126) f.write(0x80 | p.length);
            else if (p.length < 65536) { f.write(0x80 | 126); f.write(p.length >> 8); f.write(p.length & 0xff); }
            else { f.write(0x80 | 127); for (int i = 7; i >= 0; i--) f.write((int) ((long) p.length >> (8 * i)) & 0xff); }
            byte[] m = new byte[4]; caso.nextBytes(m);
            f.write(m);
            for (int i = 0; i < p.length; i++) f.write(p[i] ^ m[i % 4]);
            out.write(f.toByteArray()); out.flush();
        }

        /** Prossimo messaggio di testo (risponde ai ping, salta gli altri frame). */
        String ricevi(int timeoutMs) throws Exception {
            s.setSoTimeout(timeoutMs);
            ByteArrayOutputStream msg = new ByteArrayOutputStream();
            while (true) {
                int b0 = in.read(); if (b0 < 0) return null;
                int b1 = in.read(); if (b1 < 0) return null;
                long len = b1 & 0x7f;
                if (len == 126) len = (in.read() << 8) | in.read();
                else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | in.read(); }
                byte[] maschera = null;
                if ((b1 & 0x80) != 0) { maschera = new byte[4]; leggi(maschera); }
                if (len > 4_000_000) throw new Errore("Messaggio della TV troppo grande");
                byte[] p = new byte[(int) len]; leggi(p);
                if (maschera != null) for (int i = 0; i < p.length; i++) p[i] ^= maschera[i % 4];
                int op = b0 & 0x0f;
                if (op == 8) return null;                         // chiusura
                if (op == 9) { pong(p); continue; }               // ping
                if (op == 10) continue;                           // pong
                msg.write(p);
                if ((b0 & 0x80) != 0) return msg.toString("UTF-8"); // ultimo frame
            }
        }

        void pong(byte[] p) throws Exception {
            ByteArrayOutputStream f = new ByteArrayOutputStream();
            f.write(0x8A); f.write(0x80 | p.length);
            byte[] m = new byte[4]; caso.nextBytes(m); f.write(m);
            for (int i = 0; i < p.length; i++) f.write(p[i] ^ m[i % 4]);
            out.write(f.toByteArray()); out.flush();
        }

        void leggi(byte[] b) throws Exception {
            int n = 0;
            while (n < b.length) { int r = in.read(b, n, b.length - n); if (r < 0) throw new Errore("Collegamento chiuso dalla TV"); n += r; }
        }

        void chiudi() {
            try { if (out != null) { byte[] m = new byte[4]; caso.nextBytes(m); out.write(new byte[] { (byte) 0x88, (byte) 0x80, m[0], m[1], m[2], m[3] }); out.flush(); } } catch (Exception ignored) { }
            try { if (s != null) s.close(); } catch (Exception ignored) { }
        }

        // java.util.Base64 c'è solo da Android 8
        static String base64(byte[] d) {
            String a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            StringBuilder o = new StringBuilder();
            for (int i = 0; i < d.length; i += 3) {
                int n = (d[i] & 0xff) << 16 | (i + 1 < d.length ? (d[i + 1] & 0xff) << 8 : 0) | (i + 2 < d.length ? d[i + 2] & 0xff : 0);
                o.append(a.charAt(n >> 18 & 63)).append(a.charAt(n >> 12 & 63));
                o.append(i + 1 < d.length ? a.charAt(n >> 6 & 63) : '=').append(i + 2 < d.length ? a.charAt(n & 63) : '=');
            }
            return o.toString();
        }
    }
}
