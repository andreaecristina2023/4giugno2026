package it.andreaecristina.casa;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

    /** Il sito ha salvato modi o impostazioni: ridisegno il widget. */
    @PluginMethod
    public void aggiornaWidget(PluginCall call) {
        ComandiWidget.aggiornaTutti(getContext());
        call.resolve();
    }
}
