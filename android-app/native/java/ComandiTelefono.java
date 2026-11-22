package it.andreaecristina.casa;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.provider.AlarmClock;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

/**
 * Comandi del telefono usati dall'app e dal widget "A&C Comandi":
 * modi audio (suoneria, volumi, Non disturbare), rotazione schermo, stato VPN / FortiClient, DNS privato.
 *
 * Permessi speciali (l'utente li concede una volta):
 * - accesso a "Non disturbare" → silenzio, vibrazione, Non disturbare;
 * - "Modifica impostazioni di sistema" → rotazione;
 * - WRITE_SECURE_SETTINGS (solo dal computer: adb shell pm grant it.andreaecristina.casa android.permission.WRITE_SECURE_SETTINGS) → DNS privato.
 */
public final class ComandiTelefono {

    private ComandiTelefono() { }

    /** Errore con un codice leggibile dal sito (PERMESSO_DND, PERMESSO_SISTEMA, PERMESSO_DNS, …). */
    public static class Errore extends Exception {
        public final String codice;
        Errore(String codice, String messaggio) { super(messaggio); this.codice = codice; }
    }

    static final String[] NOMI = { "suoneria", "notifiche", "chiamate", "media", "sveglia" };
    static final int[] FLUSSI = { AudioManager.STREAM_RING, AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_VOICE_CALL, AudioManager.STREAM_MUSIC, AudioManager.STREAM_ALARM };
    static final String[] FORTICLIENT = { "com.fortinet.forticlient_vpn", "com.fortinet.forticlient", "com.fortinet.forticlient_fa" };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE); }
    private static AudioManager audio(Context c) { return (AudioManager) c.getSystemService(Context.AUDIO_SERVICE); }
    private static NotificationManager notifiche(Context c) { return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); }

    // ---------- permessi ----------
    static boolean permessoDnd(Context c) { NotificationManager nm = notifiche(c); return nm != null && nm.isNotificationPolicyAccessGranted(); }
    static boolean permessoSistema(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(c); }
    static boolean permessoDns(Context c) { return c.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED; }

    // ---------- stato ----------
    static String suoneria(Context c) {
        int m = audio(c).getRingerMode();
        return m == AudioManager.RINGER_MODE_SILENT ? "silenzio" : m == AudioManager.RINGER_MODE_VIBRATE ? "vibra" : "suona";
    }

    static String dnd(Context c) {
        NotificationManager nm = notifiche(c);
        if (nm == null) return "off";
        switch (nm.getCurrentInterruptionFilter()) {
            case NotificationManager.INTERRUPTION_FILTER_PRIORITY: return "priorita";
            case NotificationManager.INTERRUPTION_FILTER_ALARMS: return "sveglie";
            case NotificationManager.INTERRUPTION_FILTER_NONE: return "totale";
            default: return "off";
        }
    }

    private static int filtroDnd(String s) {
        if ("priorita".equals(s)) return NotificationManager.INTERRUPTION_FILTER_PRIORITY;
        if ("sveglie".equals(s)) return NotificationManager.INTERRUPTION_FILTER_ALARMS;
        if ("totale".equals(s)) return NotificationManager.INTERRUPTION_FILTER_NONE;
        return NotificationManager.INTERRUPTION_FILTER_ALL;
    }

    static String rotazione(Context c) {
        try {
            return Settings.System.getInt(c.getContentResolver(), Settings.System.ACCELEROMETER_ROTATION) == 1 ? "auto" : "bloccata";
        } catch (Settings.SettingNotFoundException e) {
            return "auto";
        }
    }

    static boolean vpnAttiva(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
            }
        } catch (Exception e) { /* niente */ }
        return false;
    }

    static String pacchettoForti(Context c) {
        PackageManager pm = c.getPackageManager();
        for (String p : FORTICLIENT) if (pm.getLaunchIntentForPackage(p) != null) return p;
        return null;
    }

    /** "off", "auto" (opportunistic, predefinito di Android) o "host". */
    static String dnsModo(Context c) {
        String m = Settings.Global.getString(c.getContentResolver(), "private_dns_mode");
        if ("hostname".equals(m)) return "host";
        if ("off".equals(m)) return "off";
        return "auto";
    }

    static String dnsHost(Context c) {
        String h = Settings.Global.getString(c.getContentResolver(), "private_dns_specifier");
        return h == null ? "" : h;
    }

    /** App separata "A&C VPN" (servizio di accessibilità che preme Connetti in FortiClient). */
    static final String PKG_VPN = "it.andreaecristina.casa.vpn";
    static final String PERMESSO_VPN = "it.andreaecristina.casa.permission.VPN";

    static boolean vpnAppInstallata(Context c) {
        try { c.getPackageManager().getPackageInfo(PKG_VPN, 0); return true; } catch (Exception e) { return false; }
    }

    /** "VPN in un tocco": il servizio di accessibilità di A&C VPN è attivo? */
    static boolean vpnAutoAttivo(Context c) {
        String s = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return s != null && s.toLowerCase(java.util.Locale.ROOT).contains(PKG_VPN + "/");
    }

    /** Prima di collegare la VPN: se il DNS privato è attivo lo spengo e ricordo l'indirizzo per riaccenderlo dopo. */
    static void spegniDnsPerVpn(Context c) {
        if (!permessoDns(c) || !"host".equals(dnsModo(c))) return;
        String host = dnsHost(c);
        try {
            impostaDns(c, "off", null);
            prefs(c).edit().putString("dnsDaRipristinare", host).putLong("dnsSpentoAlle", System.currentTimeMillis()).putBoolean("vpnVista", false).apply();
        } catch (Exception e) { /* niente */ }
    }

    /**
     * Riaccende il DNS privato spento per la VPN, quando la VPN non c'è più: dopo che è stata vista collegata,
     * oppure se dopo 3 minuti non si è mai collegata (connessione annullata). Restituisce true se l'ha riacceso.
     */
    static boolean ripristinaDns(Context c) {
        SharedPreferences p = prefs(c);
        String host = p.getString("dnsDaRipristinare", "");
        if (host.isEmpty()) return false;
        if (vpnAttiva(c)) { p.edit().putBoolean("vpnVista", true).apply(); return false; }
        boolean vista = p.getBoolean("vpnVista", false);
        if (!vista && System.currentTimeMillis() - p.getLong("dnsSpentoAlle", 0) < 180000) return false;
        try {
            if (permessoDns(c) && !"host".equals(dnsModo(c))) impostaDns(c, "host", host);
        } catch (Exception e) { return false; }
        p.edit().remove("dnsDaRipristinare").remove("dnsSpentoAlle").remove("vpnVista").apply();
        return true;
    }

    static String avviaVpn(Context c, String ritorno) {
        String azione = vpnAttiva(c) ? "scollega" : "connetti";
        if ("connetti".equals(azione)) spegniDnsPerVpn(c);
        boolean auto = vpnAutoAttivo(c) && pacchettoForti(c) != null;
        if (auto) {
            // la richiesta va ad A&C VPN, che preme il pulsante appena FortiClient è aperto
            Intent r = new Intent(PKG_VPN + ".RICHIESTA");
            r.setComponent(new ComponentName(PKG_VPN, PKG_VPN + ".Richiesta"));
            r.putExtra("azione", azione).putExtra("ritorno", ritorno);
            r.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);
            c.sendBroadcast(r, PERMESSO_VPN);
        }
        c.startActivity(intentFortiClient(c));
        return auto ? azione : "manuale";
    }

    static String modoAttivo(Context c) { return prefs(c).getString("modoAttivo", ""); }
    static void segnaAttivo(Context c, String id) { prefs(c).edit().putString("modoAttivo", id == null ? "" : id).apply(); }

    static JSONObject stato(Context c) {
        ripristinaDns(c);
        JSONObject r = new JSONObject();
        try {
            AudioManager am = audio(c);
            r.put("suoneria", suoneria(c));
            r.put("dnd", dnd(c));
            r.put("permessoDnd", permessoDnd(c));
            r.put("volumiFissi", am.isVolumeFixed());
            r.put("rotazione", rotazione(c));
            r.put("permessoSistema", permessoSistema(c));
            r.put("vpn", vpnAttiva(c));
            r.put("forticlient", pacchettoForti(c) != null);
            r.put("vpnAuto", vpnAutoAttivo(c));
            r.put("vpnApp", vpnAppInstallata(c));
            r.put("dnsInPausa", prefs(c).getString("dnsDaRipristinare", ""));
            r.put("dnsManualeOff", prefs(c).getBoolean("dnsManualeOff", false));
            r.put("dnsModo", dnsModo(c));
            r.put("dnsHost", dnsHost(c));
            r.put("permessoDns", permessoDns(c));
            r.put("attivo", modoAttivo(c));
            JSONObject vol = new JSONObject();
            for (int i = 0; i < NOMI.length; i++) {
                int max = am.getStreamMaxVolume(FLUSSI[i]);
                vol.put(NOMI[i], max > 0 ? Math.round(am.getStreamVolume(FLUSSI[i]) * 100f / max) : 0);
            }
            r.put("volumi", vol);
        } catch (Exception e) { /* niente */ }
        return r;
    }

    // ---------- comandi ----------
    static boolean impostaRotazione(Context c, String r) {
        if (r == null || r.isEmpty()) return true;
        if (!permessoSistema(c)) return false;
        Settings.System.putInt(c.getContentResolver(), Settings.System.ACCELEROMETER_ROTATION, "auto".equals(r) ? 1 : 0);
        return true;
    }

    private static int minimo(AudioManager am, int flusso) {
        if (Build.VERSION.SDK_INT >= 28) return am.getStreamMinVolume(flusso);
        return flusso == AudioManager.STREAM_VOICE_CALL || flusso == AudioManager.STREAM_ALARM ? 1 : 0;
    }

    private static void imposta(AudioManager am, JSONObject vol, int i, JSONArray saltati) {
        if (vol == null || !vol.has(NOMI[i]) || vol.isNull(NOMI[i])) return;
        int pct = vol.optInt(NOMI[i], -1);
        if (pct < 0) return;
        int flusso = FLUSSI[i];
        int max = am.getStreamMaxVolume(flusso);
        int v = Math.round(Math.min(100, pct) * max / 100f);
        v = Math.max(minimo(am, flusso), Math.min(max, v));
        try { am.setStreamVolume(flusso, v, 0); } catch (SecurityException e) { saltati.put(NOMI[i]); }
    }

    private static String testo(JSONObject o, String k) {
        if (o == null || !o.has(k) || o.isNull(k)) return null;
        String s = o.optString(k, "");
        return s.isEmpty() ? null : s;
    }

    /**
     * modo = { id, suoneria: "suona"|"vibra"|"silenzio", dnd: "off"|"priorita"|"sveglie"|"totale",
     *          rotazione: "auto"|"bloccata", volumi: { suoneria, notifiche, chiamate, media, sveglia } in % }
     * Campi assenti o vuoti = non cambiare. Restituisce lo stato con "saltati" (cose non applicate).
     */
    static JSONObject applica(Context c, JSONObject modo) throws Errore {
        AudioManager am = audio(c);
        NotificationManager nm = notifiche(c);
        String suon = testo(modo, "suoneria"), dnd = testo(modo, "dnd"), rot = testo(modo, "rotazione");
        JSONObject vol = modo.optJSONObject("volumi");
        // Non disturbare lo cambio solo se serve davvero, così Normale e Moto funzionano anche senza permesso
        boolean cambiaDnd = dnd != null && nm != null && filtroDnd(dnd) != nm.getCurrentInterruptionFilter();
        if (cambiaDnd && !permessoDnd(c)) throw new Errore("PERMESSO_DND", "Serve l'accesso a Non disturbare");
        JSONArray saltati = new JSONArray();
        try {
            if (!impostaRotazione(c, rot)) saltati.put("rotazione");
            if (cambiaDnd) nm.setInterruptionFilter(filtroDnd(dnd)); // prima: con Non disturbare acceso Android blocca la suoneria
            if (suon == null || "suona".equals(suon)) {
                if (suon != null) am.setRingerMode(AudioManager.RINGER_MODE_NORMAL);
                for (int i = 0; i < NOMI.length; i++) imposta(am, vol, i, saltati);
            } else {
                // con vibra/silenzio suoneria e notifiche non si toccano, altrimenti Android torna a "suona"
                for (int i = 2; i < NOMI.length; i++) imposta(am, vol, i, saltati);
                am.setRingerMode("vibra".equals(suon) ? AudioManager.RINGER_MODE_VIBRATE : AudioManager.RINGER_MODE_SILENT);
            }
        } catch (SecurityException e) {
            throw new Errore("PERMESSO_DND", "Serve l'accesso a Non disturbare");
        }
        String id = testo(modo, "id");
        if (id != null) segnaAttivo(c, id);
        JSONObject r = stato(c);
        try { r.put("saltati", saltati); } catch (Exception e) { /* niente */ }
        return r;
    }

    /** modo: "host" (con l'indirizzo), "auto" o "off". */
    static void impostaDns(Context c, String modo, String host) throws Errore {
        if (!permessoDns(c)) throw new Errore("PERMESSO_DNS", "Serve il permesso per il DNS (si dà dal computer)");
        ContentResolver cr = c.getContentResolver();
        if ("host".equals(modo)) {
            if (host == null || host.trim().isEmpty()) throw new Errore("DNS_VUOTO", "Scrivi l'indirizzo del DNS");
            Settings.Global.putString(cr, "private_dns_specifier", host.trim());
            Settings.Global.putString(cr, "private_dns_mode", "hostname");
        } else {
            Settings.Global.putString(cr, "private_dns_mode", "off".equals(modo) ? "off" : "opportunistic");
        }
    }

    // ---------- pagine di Android ----------
    static Intent intentFortiClient(Context c) {
        String p = pacchettoForti(c);
        Intent i = p != null ? c.getPackageManager().getLaunchIntentForPackage(p)
            : new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + FORTICLIENT[0]));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    static Intent intentPermesso(Context c, String quale) {
        Intent i;
        if ("sistema".equals(quale)) i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + c.getPackageName()));
        else if ("rete".equals(quale)) i = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
        else if ("vpn".equals(quale)) i = new Intent(Settings.ACTION_VPN_SETTINGS);
        else if ("accessibilita".equals(quale)) i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        else if ("app".equals(quale)) i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
        else i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    // ---------- sveglie (nell'app Orologio del telefono) ----------
    static Intent intentElencoSveglie() {
        Intent i = new Intent(AlarmClock.ACTION_SHOW_ALARMS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    /**
     * Crea una sveglia nell'Orologio: { ora, minuti, giorni: [1=lun … 7=dom] (vuoto = una volta sola),
     * nome, vibra, mostra (true = apre l'Orologio invece di crearla in silenzio) }
     */
    static Intent intentSveglia(JSONObject s) {
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM);
        i.putExtra(AlarmClock.EXTRA_HOUR, s.optInt("ora", 7));
        i.putExtra(AlarmClock.EXTRA_MINUTES, s.optInt("minuti", 0));
        String nome = s.optString("nome", "");
        if (!nome.isEmpty()) i.putExtra(AlarmClock.EXTRA_MESSAGE, nome);
        JSONArray g = s.optJSONArray("giorni");
        if (g != null && g.length() > 0) {
            // da lun=1…dom=7 a Calendar (dom=1, lun=2 … sab=7)
            ArrayList<Integer> giorni = new ArrayList<>();
            for (int k = 0; k < g.length(); k++) { int d = g.optInt(k); if (d >= 1 && d <= 7) giorni.add(d == 7 ? 1 : d + 1); }
            i.putExtra(AlarmClock.EXTRA_DAYS, giorni);
        }
        i.putExtra(AlarmClock.EXTRA_VIBRATE, s.optBoolean("vibra", true));
        i.putExtra(AlarmClock.EXTRA_SKIP_UI, !s.optBoolean("mostra", false));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    /** Spegne nell'Orologio la sveglia con quell'ora (alcuni orologi chiedono conferma). */
    static Intent intentTogliSveglia(JSONObject s) {
        Intent i = new Intent(AlarmClock.ACTION_DISMISS_ALARM);
        int ora = s.optInt("ora", 7);
        i.putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_TIME);
        i.putExtra(AlarmClock.EXTRA_HOUR, ora); // 0-23: con IS_PM coerente l'Orologio lo legge giusto in entrambi i formati
        i.putExtra(AlarmClock.EXTRA_MINUTES, s.optInt("minuti", 0));
        i.putExtra(AlarmClock.EXTRA_IS_PM, ora >= 12);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    /** Modi salvati dall'app per il widget (chiave "comandi"): { modi: [...], andrea: bool, dnsHost: "" } */
    static JSONObject configurazione(Context c) {
        try {
            String s = prefs(c).getString("comandi", null);
            return s == null ? new JSONObject() : new JSONObject(s);
        } catch (Exception e) {
            return new JSONObject();
        }
    }
}
