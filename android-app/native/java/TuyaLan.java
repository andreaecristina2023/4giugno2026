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
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.CRC32;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Protocollo locale Tuya (porta TCP 6668) per le versioni 3.3, 3.4 e 3.5, più la ricerca sulla rete (UDP 6666/6667/7000).
 * Nessuna dipendenza Android: lavora con stringhe JSON. Ricavato dal comportamento di tinytuya.
 */
public class TuyaLan {

    public static class Errore extends Exception { public Errore(String m) { super(m); } }

    static final int P55AA = 0x000055AA, S55AA = 0x0000AA55, P6699 = 0x00006699, S6699 = 0x00009966;
    static final int SESS_START = 3, SESS_RESP = 4, SESS_FINISH = 5, CONTROL = 7, STATUS = 8, HEART_BEAT = 9,
        DP_QUERY = 10, CONTROL_NEW = 13, DP_QUERY_NEW = 16, UPDATEDPS = 18, REQ_DEVINFO = 0x25;
    static final List<Integer> SENZA_INTESTAZIONE = Arrays.asList(DP_QUERY, DP_QUERY_NEW, UPDATEDPS, HEART_BEAT, SESS_START, SESS_RESP, SESS_FINISH, 0x40);
    static final byte[] CHIAVE_UDP = md5("yGAdlopoPVldABfn".getBytes(StandardCharsets.UTF_8));
    static final SecureRandom CASO = new SecureRandom();

    public final String id, ip;
    public final double versione;
    final byte[] chiaveVera;
    byte[] chiave;
    int seq = 1, porta = 6668, attesa = 4000;
    Socket s; InputStream in; OutputStream out;
    public boolean device22 = false;

    public TuyaLan(String id, String ip, String chiaveLocale, double versione) {
        this.id = id; this.ip = ip; this.versione = versione;
        this.chiaveVera = chiaveLocale.getBytes(StandardCharsets.UTF_8);
        this.chiave = chiaveVera;
    }

    // ---------------- comandi ----------------

    /** Stato: JSON del dispositivo, con "dps" (es. {"dps":{"20":true,"22":500}}). */
    public String stato() throws Exception {
        apri();
        try {
            String r;
            if (versione >= 3.4) r = scambia(DP_QUERY_NEW, "{}", DP_QUERY_NEW);
            else {
                r = scambia(DP_QUERY, "{\"gwId\":\"" + id + "\",\"devId\":\"" + id + "\",\"uid\":\"" + id + "\",\"t\":\"" + ora() + "\"}", DP_QUERY);
                if (r != null && r.contains("data unvalid")) {
                    device22 = true;
                    r = scambia(CONTROL_NEW, "{\"devId\":\"" + id + "\",\"uid\":\"" + id + "\",\"t\":\"" + ora() + "\",\"dps\":{\"1\":null,\"20\":null}}", CONTROL_NEW);
                }
            }
            return r;
        } finally { chiudi(); }
    }

    /** Invia i valori (dpsJson = {"20":true,"22":500}); restituisce l'ultimo stato ricevuto, se arriva. */
    public String imposta(String dpsJson) throws Exception {
        apri();
        try {
            String r;
            if (versione >= 3.4) r = scambia(CONTROL_NEW, "{\"protocol\":5,\"t\":" + (System.currentTimeMillis() / 1000) + ",\"data\":{\"dps\":" + dpsJson + "}}", STATUS);
            else r = scambia(CONTROL, "{\"devId\":\"" + id + "\",\"uid\":\"" + id + "\",\"t\":\"" + ora() + "\",\"dps\":" + dpsJson + "}", STATUS);
            return r;
        } finally { chiudi(); }
    }

    static String ora() { return String.valueOf(System.currentTimeMillis() / 1000); }

    // ---------------- connessione ----------------

    void apri() throws Exception {
        s = new Socket();
        s.setTcpNoDelay(true);
        try { s.connect(new InetSocketAddress(ip, porta), attesa); }
        catch (Exception e) { throw new Errore("La luce non risponde su " + ip + " (sei sul Wi-Fi di casa?)"); }
        s.setSoTimeout(attesa);
        in = s.getInputStream(); out = s.getOutputStream();
        chiave = chiaveVera; seq = 1;
        if (versione >= 3.4) negozia();
    }

    void chiudi() { try { if (s != null) s.close(); } catch (Exception ignored) { } s = null; }

    void negozia() throws Exception {
        byte[] mio = new byte[16];
        CASO.nextBytes(mio);
        invia(SESS_START, mio);
        Messaggio m = ricevi();
        if (m == null || m.cmd != SESS_RESP) throw new Errore("La luce non accetta la connessione (chiave locale o versione sbagliata)");
        byte[] p = m.dati;
        if (versione < 3.5) p = ecbDec(chiaveVera, p, true);
        if (p.length < 48) throw new Errore("Risposta della luce troppo corta");
        byte[] suo = Arrays.copyOfRange(p, 0, 16);
        if (!Arrays.equals(hmac(chiaveVera, mio), Arrays.copyOfRange(p, 16, 48))) throw new Errore("Chiave locale sbagliata: rileggila da Tuya");
        invia(SESS_FINISH, hmac(chiaveVera, suo));
        byte[] x = new byte[16];
        for (int i = 0; i < 16; i++) x[i] = (byte) (mio[i] ^ suo[i]);
        if (versione < 3.5) chiave = ecbEnc(chiaveVera, x, false);
        else chiave = Arrays.copyOfRange(gcmEnc(chiaveVera, Arrays.copyOfRange(mio, 0, 12), x, null), 0, 16);
    }

    /** Manda un comando e aspetta una risposta con JSON (dello stesso comando o, per i comandi, lo stato). */
    String scambia(int cmd, String json, int atteso) throws Exception {
        invia(cmd, json.getBytes(StandardCharsets.UTF_8));
        String ultimo = null;
        long fine = System.currentTimeMillis() + attesa;
        while (System.currentTimeMillis() < fine) {
            Messaggio m;
            try { m = ricevi(); } catch (SocketTimeoutException e) { break; }
            if (m == null) break;
            String t = decodifica(m.dati);
            if (t == null || t.isEmpty()) {
                // conferma senza dati: per un comando basta, aspetto ancora un po' lo stato
                if (cmd == CONTROL || cmd == CONTROL_NEW) { s.setSoTimeout(1500); fine = Math.min(fine, System.currentTimeMillis() + 1500); }
                continue;
            }
            ultimo = t;
            if (m.cmd == atteso || m.cmd == STATUS || t.contains("\"dps\"") || t.contains("data unvalid")) break;
        }
        return ultimo;
    }

    // ---------------- messaggi ----------------

    static class Messaggio { int cmd, seq, codice; byte[] dati; }

    void invia(int cmd, byte[] payload) throws Exception {
        boolean testa = !SENZA_INTESTAZIONE.contains(cmd);
        byte[] intestazione = (versione >= 3.5 ? "3.5" : versione >= 3.4 ? "3.4" : "3.3").getBytes(StandardCharsets.US_ASCII);
        byte[] pv = new byte[15];
        System.arraycopy(intestazione, 0, pv, 0, 3);
        byte[] dati;
        if (versione >= 3.5) {
            dati = testa ? concat(pv, payload) : payload;
            out.write(impacca6699(chiave, seq++, cmd, dati));
        } else if (versione >= 3.4) {
            dati = ecbEnc(chiave, testa ? concat(pv, payload) : payload, true);
            out.write(impacca55AA(seq++, cmd, dati, chiave));
        } else {
            dati = ecbEnc(chiave, payload, true);
            if (testa) dati = concat(pv, dati);
            out.write(impacca55AA(seq++, cmd, dati, null));
        }
        out.flush();
    }

    Messaggio ricevi() throws Exception {
        // cerco l'inizio del messaggio
        byte[] q = new byte[4];
        leggi(q, 0, 4);
        while (true) {
            int p = ByteBuffer.wrap(q).getInt();
            if (p == P55AA || p == P6699) break;
            System.arraycopy(q, 1, q, 0, 3);
            leggi(q, 3, 1);
        }
        int pre = ByteBuffer.wrap(q).getInt();
        if (pre == P55AA) {
            byte[] h = new byte[12]; leggi(h, 0, 12);
            ByteBuffer b = ByteBuffer.wrap(h);
            Messaggio m = new Messaggio(); m.seq = b.getInt(); m.cmd = b.getInt(); int len = b.getInt();
            if (len < 8 || len > 65536) throw new Errore("Messaggio della luce non valido");
            byte[] resto = new byte[len]; leggi(resto, 0, len);
            int fineLen = versione >= 3.4 ? 36 : 8;
            byte[] corpo = Arrays.copyOfRange(resto, 0, Math.max(0, len - fineLen));
            if (versione >= 3.4) {
                byte[] tutto = concat(concat(q, h), corpo);
                if (!Arrays.equals(hmac(chiave, tutto), Arrays.copyOfRange(resto, len - 36, len - 4))) throw new Errore("Controllo del messaggio fallito (chiave sbagliata?)");
            }
            // i messaggi del dispositivo iniziano sempre con 4 byte di codice di ritorno
            if (corpo.length >= 4) { m.codice = ByteBuffer.wrap(corpo, 0, 4).getInt(); corpo = Arrays.copyOfRange(corpo, 4, corpo.length); }
            m.dati = corpo;
            return m;
        } else {
            byte[] h = new byte[14]; leggi(h, 0, 14);
            ByteBuffer b = ByteBuffer.wrap(h);
            b.getShort();
            Messaggio m = new Messaggio(); m.seq = b.getInt(); m.cmd = b.getInt(); int len = b.getInt();
            if (len < 28 || len > 65536) throw new Errore("Messaggio della luce non valido");
            byte[] resto = new byte[len + 4]; leggi(resto, 0, len + 4);
            byte[] iv = Arrays.copyOfRange(resto, 0, 12);
            byte[] cifrato = Arrays.copyOfRange(resto, 12, len); // testo cifrato + tag
            byte[] chiaro;
            try { chiaro = gcmDec(chiave, iv, cifrato, h); }
            catch (Exception e) { throw new Errore("Controllo del messaggio fallito (chiave sbagliata?)"); }
            if (chiaro.length >= 4 && chiaro[0] != '{') { m.codice = ByteBuffer.wrap(chiaro, 0, 4).getInt(); chiaro = Arrays.copyOfRange(chiaro, 4, chiaro.length); }
            m.dati = chiaro;
            return m;
        }
    }

    /** Toglie l'intestazione "3.x" e decifra (3.3: ECB qui; 3.4: ECB di tutto; 3.5: già in chiaro). */
    String decodifica(byte[] d) throws Exception {
        if (d == null || d.length == 0) return "";
        byte[] p = d;
        if (versione >= 3.4 && versione < 3.5) {
            if (p.length % 16 != 0) return "";
            p = ecbDec(chiave, p, true);
        }
        if (p.length >= 15 && p[0] == '3' && p[1] == '.') p = Arrays.copyOfRange(p, 15, p.length);
        else if (device22 && versione < 3.4 && (p.length & 0x0F) != 0 && p.length > 15) p = Arrays.copyOfRange(p, 15, p.length);
        if (versione < 3.4 && p.length > 0 && p[0] != '{') {
            if (p.length % 16 != 0) return "";
            p = ecbDec(chiave, p, true);
        }
        String t = new String(p, StandardCharsets.UTF_8).trim();
        return t.startsWith("{") ? t : (t.contains("data unvalid") ? "data unvalid" : "");
    }

    // ---------------- impacchettamento ----------------

    static byte[] impacca55AA(int seq, int cmd, byte[] dati, byte[] chiaveHmac) throws Exception {
        int fine = chiaveHmac != null ? 36 : 8;
        ByteBuffer b = ByteBuffer.allocate(16 + dati.length + fine);
        b.putInt(P55AA).putInt(seq).putInt(cmd).putInt(dati.length + fine).put(dati);
        byte[] fin = Arrays.copyOf(b.array(), 16 + dati.length);
        if (chiaveHmac != null) b.put(hmac(chiaveHmac, fin));
        else { CRC32 c = new CRC32(); c.update(fin); b.putInt((int) c.getValue()); }
        b.putInt(S55AA);
        return b.array();
    }

    static byte[] impacca6699(byte[] chiave, int seq, int cmd, byte[] dati) throws Exception {
        ByteBuffer h = ByteBuffer.allocate(18);
        h.putInt(P6699).putShort((short) 0).putInt(seq).putInt(cmd).putInt(dati.length + 12 + 16);
        byte[] iv = new byte[12];
        CASO.nextBytes(iv);
        byte[] aad = Arrays.copyOfRange(h.array(), 4, 18);
        byte[] cifr = gcmEnc(chiave, iv, dati, aad); // testo + tag
        ByteBuffer b = ByteBuffer.allocate(18 + 12 + cifr.length + 4);
        b.put(h.array()).put(iv).put(cifr).putInt(S6699);
        return b.array();
    }

    void leggi(byte[] b, int da, int n) throws Exception {
        int letti = 0;
        while (letti < n) {
            int r = in.read(b, da + letti, n - letti);
            if (r < 0) throw new Errore("La luce ha chiuso la connessione (chiave locale o versione sbagliata?)");
            letti += r;
        }
    }

    // ---------------- crittografia ----------------

    static byte[] ecbEnc(byte[] k, byte[] d, boolean pad) throws Exception {
        Cipher c = Cipher.getInstance(pad ? "AES/ECB/PKCS5Padding" : "AES/ECB/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(k, "AES"));
        return c.doFinal(d);
    }
    static byte[] ecbDec(byte[] k, byte[] d, boolean pad) throws Exception {
        Cipher c = Cipher.getInstance("AES/ECB/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(k, "AES"));
        byte[] r = c.doFinal(d);
        if (pad && r.length > 0) { int n = r[r.length - 1] & 0xff; if (n >= 1 && n <= 16) r = Arrays.copyOf(r, r.length - n); }
        return r;
    }
    static byte[] gcmEnc(byte[] k, byte[] iv, byte[] d, byte[] aad) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(k, "AES"), new GCMParameterSpec(128, iv));
        if (aad != null) c.updateAAD(aad);
        return c.doFinal(d);
    }
    static byte[] gcmDec(byte[] k, byte[] iv, byte[] dTag, byte[] aad) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(k, "AES"), new GCMParameterSpec(128, iv));
        if (aad != null) c.updateAAD(aad);
        return c.doFinal(dTag);
    }
    static byte[] hmac(byte[] k, byte[] d) throws Exception {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(k, "HmacSHA256"));
        return m.doFinal(d);
    }
    static byte[] md5(byte[] d) { try { return MessageDigest.getInstance("MD5").digest(d); } catch (Exception e) { throw new RuntimeException(e); } }
    static byte[] concat(byte[] a, byte[] b) { byte[] r = Arrays.copyOf(a, a.length + b.length); System.arraycopy(b, 0, r, a.length, b.length); return r; }

    // ---------------- ricerca sulla rete ----------------

    /** Ascolta per "ms" millisecondi gli annunci dei dispositivi Tuya: mappa id → JSON dell'annuncio (ip, gwId, version…). */
    public static Map<String, String> cerca(int ms, String ipBroadcast) {
        final Map<String, String> trovati = new LinkedHashMap<>();
        final List<DatagramSocket> prese = new ArrayList<>();
        final List<Thread> fili = new ArrayList<>();
        for (int porta : new int[] { 6666, 6667, 7000 }) {
            try {
                DatagramSocket ds = new DatagramSocket(null);
                ds.setReuseAddress(true);
                ds.setBroadcast(true);
                ds.bind(new InetSocketAddress(porta));
                ds.setSoTimeout(500);
                prese.add(ds);
                Thread t = new Thread(() -> {
                    byte[] buf = new byte[4096];
                    long fine = System.currentTimeMillis() + ms;
                    while (System.currentTimeMillis() < fine) {
                        try {
                            DatagramPacket p = new DatagramPacket(buf, buf.length);
                            ds.receive(p);
                            String j = decodificaUdp(Arrays.copyOf(p.getData(), p.getLength()));
                            if (j == null) continue;
                            String gw = campo(j, "gwId");
                            if (gw == null) continue;
                            if (campo(j, "ip") == null) j = j.replaceFirst("\\{", "{\"ip\":\"" + p.getAddress().getHostAddress() + "\",");
                            synchronized (trovati) { trovati.put(gw, j); }
                        } catch (SocketTimeoutException e) { /* continuo */ } catch (Exception e) { /* pacchetto non valido */ }
                    }
                });
                t.start(); fili.add(t);
            } catch (Exception e) { /* porta occupata: salto */ }
        }
        // i dispositivi 3.5 rispondono a una richiesta sulla porta 7000
        try (DatagramSocket tx = new DatagramSocket()) {
            tx.setBroadcast(true);
            byte[] corpo = "{\"from\":\"app\",\"ip\":\"0.0.0.0\"}".getBytes(StandardCharsets.UTF_8);
            byte[] msg = impacca6699(CHIAVE_UDP, 0, REQ_DEVINFO, corpo);
            InetAddress dest = InetAddress.getByName(ipBroadcast != null ? ipBroadcast : "255.255.255.255");
            for (int i = 0; i < 3 && i * 1500 < ms; i++) { tx.send(new DatagramPacket(msg, msg.length, dest, 7000)); Thread.sleep(1500); }
        } catch (Exception ignored) { }
        for (Thread t : fili) { try { t.join(ms + 1000); } catch (InterruptedException ignored) { } }
        for (DatagramSocket ds : prese) ds.close();
        return trovati;
    }

    static String decodificaUdp(byte[] d) {
        try {
            if (d.length >= 4) {
                int p = ByteBuffer.wrap(d).getInt();
                if (p == P55AA && d.length > 28) {
                    int len = ByteBuffer.wrap(d, 12, 4).getInt();
                    byte[] corpo = Arrays.copyOfRange(d, 20, Math.min(d.length, 16 + len - 8)); // salto il codice di ritorno
                    if (corpo.length > 0 && corpo[0] == '{') return new String(corpo, StandardCharsets.UTF_8);
                    return new String(ecbDec(CHIAVE_UDP, corpo, true), StandardCharsets.UTF_8);
                }
                if (p == P6699 && d.length > 50) {
                    int len = ByteBuffer.wrap(d, 14, 4).getInt();
                    byte[] iv = Arrays.copyOfRange(d, 18, 30);
                    byte[] cifr = Arrays.copyOfRange(d, 30, 18 + len);
                    byte[] chiaro = gcmDec(CHIAVE_UDP, iv, cifr, Arrays.copyOfRange(d, 4, 18));
                    String t = new String(chiaro, StandardCharsets.UTF_8);
                    int i = t.indexOf('{');
                    return i >= 0 ? t.substring(i).replaceAll("\\u0000+$", "") : null;
                }
            }
            return new String(ecbDec(CHIAVE_UDP, d, true), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }

    /** Legge un campo stringa da un JSON semplice (senza dipendenze). */
    static String campo(String j, String nome) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + nome + "\"\\s*:\\s*\"([^\"]*)\"").matcher(j);
        return m.find() ? m.group(1) : null;
    }
}
