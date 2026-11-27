package it.andreaecristina.casa;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.activity.result.ActivityResult;

import org.json.JSONObject;

/**
 * Ponte dal sito ai comandi del telefono (vedi ComandiTelefono): modi audio, rotazione schermo,
 * VPN FortiClient e DNS privato. Dopo ogni comando ridisegna il widget "A&C Comandi".
 */
@CapacitorPlugin(name = "AudioModi")
public class AudioModiPlugin extends Plugin {

    private void rispondi(PluginCall call, JSONObject stato) {
        ComandiWidget.aggiornaTutti(getContext());
        try { call.resolve(JSObject.fromJSONObject(stato)); } catch (Exception e) { call.resolve(); }
    }

    @PluginMethod
    public void stato(PluginCall call) {
        try { call.resolve(JSObject.fromJSONObject(ComandiTelefono.stato(getContext()))); } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void applica(PluginCall call) {
        try {
            rispondi(call, ComandiTelefono.applica(getContext(), call.getData()));
        } catch (ComandiTelefono.Errore e) {
            call.reject(e.getMessage(), e.codice);
        } catch (Exception e) {
            call.reject("Modo non applicato: " + e.getMessage());
        }
    }

    /** { id } oppure { id: "" }: segna quale modo è attivo (anche per il widget). */
    @PluginMethod
    public void segna(PluginCall call) {
        ComandiTelefono.segnaAttivo(getContext(), call.getString("id", ""));
        rispondi(call, ComandiTelefono.stato(getContext()));
    }

    /** { rotazione: "auto"|"bloccata" } */
    @PluginMethod
    public void rotazione(PluginCall call) {
        if (!ComandiTelefono.permessoSistema(getContext())) { call.reject("Serve il permesso Modifica impostazioni di sistema", "PERMESSO_SISTEMA"); return; }
        try {
            ComandiTelefono.impostaRotazione(getContext(), call.getString("rotazione"));
            rispondi(call, ComandiTelefono.stato(getContext()));
        } catch (Exception e) {
            call.reject("Rotazione non cambiata: " + e.getMessage());
        }
    }

    /** { modo: "host"|"auto"|"off", host } */
    @PluginMethod
    public void dns(PluginCall call) {
        try {
            ComandiTelefono.impostaDns(getContext(), call.getString("modo"), call.getString("host"));
            // scelta a mano: vince lei; "spento a mano" blocca il DNS attivo di default finché non si riattiva
            ComandiTelefono.prefs(getContext()).edit().remove("dnsDaRipristinare").putBoolean("dnsManualeOff", !"host".equals(call.getString("modo"))).apply();
            rispondi(call, ComandiTelefono.stato(getContext()));
        } catch (ComandiTelefono.Errore e) {
            call.reject(e.getMessage(), e.codice);
        } catch (Exception e) {
            call.reject("DNS non cambiato: " + e.getMessage());
        }
    }

    /** Tasto VPN dell'app: collega o scollega (con "VPN in un tocco" attivo), altrimenti apre FortiClient. */
    @PluginMethod
    public void apriFortiClient(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("azione", ComandiTelefono.avviaVpn(getContext(), "app"));
            call.resolve(r);
        } catch (Exception e) { call.reject("FortiClient non trovato"); }
    }

    /** { quale: "dnd" | "sistema" | "rete" | "vpn" } */
    @PluginMethod
    public void apriPermesso(PluginCall call) {
        try { getContext().startActivity(ComandiTelefono.intentPermesso(getContext(), call.getString("quale"))); call.resolve(); }
        catch (Exception e) { call.reject("Impostazioni non disponibili: " + e.getMessage()); }
    }

    /** { ora, minuti, giorni, nome, vibra, mostra }: crea la sveglia nell'Orologio del telefono. */
    @PluginMethod
    public void sveglia(PluginCall call) {
        try { getContext().startActivity(ComandiTelefono.intentSveglia(call.getData())); call.resolve(); }
        catch (android.content.ActivityNotFoundException e) { call.reject("Nessuna app Orologio che accetti sveglie", "NO_OROLOGIO"); }
        catch (Exception e) { call.reject("Sveglia non impostata: " + e.getMessage()); }
    }

    /** { ora, minuti }: spegne la sveglia nell'Orologio. */
    @PluginMethod
    public void togliSveglia(PluginCall call) {
        try { getContext().startActivity(ComandiTelefono.intentTogliSveglia(call.getData())); call.resolve(); }
        catch (Exception e) { call.reject("Apri l'Orologio per toglierla", "NO_OROLOGIO"); }
    }

    @PluginMethod
    public void elencoSveglie(PluginCall call) {
        try { getContext().startActivity(ComandiTelefono.intentElencoSveglie()); call.resolve(); }
        catch (Exception e) { call.reject("Orologio non disponibile", "NO_OROLOGIO"); }
    }

    /**
     * Modo automatico nei turni (solo Andrea): { attivo, inTurno, dopo, modi, intervalli: [[inizioMs, fineMs]] }.
     * Risponde con lo stato e "inTurno": true se adesso è in turno.
     */
    @PluginMethod
    public void turnoAuto(PluginCall call) {
        try {
            ComandiTelefono.prefs(getContext()).edit().putString("turnoAuto", call.getData().toString()).commit();
            TurnoAuto.programma(getContext());
            JSObject r = JSObject.fromJSONObject(ComandiTelefono.stato(getContext()));
            r.put("turnoAutoFatto", ComandiTelefono.prefs(getContext()).getString("turnoAutoFatto", ""));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Turni automatici non programmati: " + e.getMessage());
        }
    }

    /**
     * Navigazione in auto con Google Maps: { lat, lon } oppure { q: indirizzo }.
     * Parte subito la guida (google.navigation, mode=d); senza Google Maps apre il link delle indicazioni.
     */
    @PluginMethod
    public void naviga(PluginCall call) {
        Double lat = call.getDouble("lat"), lon = call.getDouble("lon");
        String q = call.getString("q", "");
        String dest = lat != null && lon != null ? lat + "," + lon : android.net.Uri.encode(q);
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("google.navigation:q=" + dest + "&mode=d"));
            i.setPackage("com.google.android.apps.maps");
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                android.content.Intent w = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + dest + "&travelmode=driving&dir_action=navigate"));
                w.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(w);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Google Maps non disponibile");
            }
        }
    }

    /**
     * Sveglie dal turnario: { attive, eventi: [ { t: ms, nome } ] }. Risponde con la prossima sveglia
     * e se Android lascia mostrare la schermata della sveglia a telefono bloccato.
     */
    @PluginMethod
    public void sveglieTurno(PluginCall call) {
        try {
            ComandiTelefono.prefs(getContext()).edit().putString("sveglieTurno", call.getData().toString()).commit();
            SvegliaTurno.programma(getContext());
            JSObject r = new JSObject();
            android.content.SharedPreferences p = ComandiTelefono.prefs(getContext());
            boolean attive = call.getBoolean("attive", false);
            r.put("prossima", attive ? p.getLong("svegliaProssima", 0) : 0);
            r.put("nome", p.getString("svegliaProssimaNome", ""));
            android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            r.put("schermoBloccato", android.os.Build.VERSION.SDK_INT < 34 || (nm != null && nm.canUseFullScreenIntent()));
            android.app.AlarmManager am = (android.app.AlarmManager) getContext().getSystemService(android.content.Context.ALARM_SERVICE);
            r.put("esatte", android.os.Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
            r.put("permessoDnd", ComandiTelefono.permessoDnd(getContext()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Sveglie non programmate: " + e.getMessage());
        }
    }

    /** Sceglie un brano dal telefono per la sveglia: { uri, nome } (permesso di lettura che resta). */
    @PluginMethod
    public void scegliBrano(PluginCall call) {
        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(android.content.Intent.CATEGORY_OPENABLE);
        i.setType("audio/*");
        startActivityForResult(call, i, "branoScelto");
    }

    @ActivityCallback
    private void branoScelto(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { call.reject("Nessun brano scelto", "ANNULLATO"); return; }
        android.net.Uri u = result.getData().getData();
        try { getContext().getContentResolver().takePersistableUriPermission(u, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { /* alcuni gestori non lo permettono */ }
        String nome = "";
        try (android.database.Cursor cur = getContext().getContentResolver().query(u, new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cur != null && cur.moveToFirst()) nome = cur.getString(0);
        } catch (Exception e) { /* niente */ }
        JSObject r = new JSObject();
        r.put("uri", u.toString());
        r.put("nome", nome == null ? "" : nome);
        call.resolve(r);
    }

    /** Ferma il suono della prova (o della sveglia). */
    @PluginMethod
    public void fermaSveglia(PluginCall call) {
        SvegliaSuono.ferma(getContext());
        call.resolve();
    }

    /** Prova della sveglia: suona subito. */
    /** Prova della luce della sveglia: "insieme" subito, "alba" accelerata in 40 secondi. */
    @PluginMethod
    public void provaLuce(PluginCall call) {
        try {
            JSObject luce = call.getObject("luce");
            android.content.SharedPreferences p = ComandiTelefono.prefs(getContext());
            org.json.JSONObject conf = new org.json.JSONObject(p.getString("sveglieTurno", "{}"));
            if (luce != null) { conf.put("luce", luce); p.edit().putString("sveglieTurno", conf.toString()).commit(); }
            org.json.JSONObject l = AlbaLuce.conf(getContext());
            if (AlbaLuce.idLuce(getContext(), l).isEmpty()) { call.reject("Scegli prima le luci in 💡 Luci (☆) o leggile dal Wi-Fi"); return; }
            if ("alba".equals(l.optString("modo"))) AlbaLuce.avvia(getContext(), System.currentTimeMillis() + 40000);
            else { final android.content.Context app = getContext().getApplicationContext(); new Thread(() -> AlbaLuce.finale(app, l)).start(); }
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void provaSveglia(PluginCall call) {
        try {
            JSObject suono = call.getObject("suono");
            if (suono != null) {
                android.content.SharedPreferences p = ComandiTelefono.prefs(getContext());
                org.json.JSONObject conf = new org.json.JSONObject(p.getString("sveglieTurno", "{}"));
                conf.put("suono", suono);
                p.edit().putString("sveglieTurno", conf.toString()).commit();
            }
        } catch (Exception e) { /* niente */ }
        SvegliaTurno.suona(getContext(), call.getString("nome", "Prova"), System.currentTimeMillis());
        call.resolve();
    }

    /** Pagina di Android per consentire la sveglia a schermo intero (Android 14+). */
    @PluginMethod
    public void permessoSchermoSveglia(PluginCall call) {
        try {
            android.content.Intent i = new android.content.Intent(android.os.Build.VERSION.SDK_INT >= 34 ? "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT" : android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS,
                android.net.Uri.parse("package:" + getContext().getPackageName()));
            if (android.os.Build.VERSION.SDK_INT < 34) { i = new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS); i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()); }
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject("Impostazioni non disponibili"); }
    }

    // ---------- luci sul Wi-Fi di casa (senza cloud) ----------
    private void inFondo(PluginCall call, Lavoro l) {
        new Thread(() -> {
            try { JSObject r = JSObject.fromJSONObject(l.fai()); call.resolve(r); }
            catch (Exception e) { call.reject(e.getMessage() != null ? e.getMessage() : "Errore"); }
        }).start();
    }
    interface Lavoro { JSONObject fai() throws Exception; }

    @PluginMethod
    public void luciLocaliStato(PluginCall call) {
        try {
            JSONObject d = LuciLocali.dati(getContext());
            org.json.JSONArray a = d.optJSONArray("luci");
            call.resolve(JSObject.fromJSONObject(new JSONObject().put("configurato", a != null && a.length() > 0).put("luci", a != null ? a.length() : 0).put("aggiornato", d.optLong("aggiornato"))));
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod
    public void luciLocaliImporta(PluginCall call) {
        String id = call.getString("id", ""), secret = call.getString("secret", ""), reg = call.getString("regione", "eu");
        if (id.isEmpty() || secret.isEmpty()) { call.reject("Servono Access ID e Access Secret"); return; }
        inFondo(call, () -> { JSONObject r = LuciLocali.importa(getContext(), id, secret, reg); r.put("trovate", LuciLocali.cerca(getContext())); return r; });
    }
    @PluginMethod
    public void luciLocaliCerca(PluginCall call) { inFondo(call, () -> new JSONObject().put("trovate", LuciLocali.cerca(getContext()))); }
    @PluginMethod
    public void luciLocaliElenco(PluginCall call) { inFondo(call, () -> LuciLocali.elenco(getContext())); }
    @PluginMethod
    public void luciLocaliComando(PluginCall call) {
        String id = call.getString("id", "");
        JSObject cmd = call.getObject("cmd", new JSObject());
        inFondo(call, () -> new JSONObject().put("luce", LuciLocali.comando(getContext(), id, cmd)));
    }
    @PluginMethod
    public void luciLocaliTogli(PluginCall call) {
        LuciLocali.prefs(getContext()).edit().remove("luciLocali").apply();
        call.resolve();
    }

    /** Il sito ha salvato le luci del widget: ridisegno "A&C Luci". */
    @PluginMethod
    public void aggiornaLuci(PluginCall call) {
        LuciWidget.aggiornaTutti(getContext());
        call.resolve();
    }

    /** Il sito ha salvato modi o impostazioni: ridisegno il widget. */
    @PluginMethod
    public void aggiornaWidget(PluginCall call) {
        ComandiWidget.aggiornaTutti(getContext());
        call.resolve();
    }
}
