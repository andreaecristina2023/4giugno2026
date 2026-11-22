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
            rispondi(call, ComandiTelefono.stato(getContext()));
        } catch (ComandiTelefono.Errore e) {
            call.reject(e.getMessage(), e.codice);
        } catch (Exception e) {
            call.reject("DNS non cambiato: " + e.getMessage());
        }
    }

    @PluginMethod
    public void apriFortiClient(PluginCall call) {
        try { getContext().startActivity(ComandiTelefono.intentFortiClient(getContext())); call.resolve(); }
        catch (Exception e) { call.reject("FortiClient non trovato"); }
    }

    /** { quale: "dnd" | "sistema" | "rete" | "vpn" } */
    @PluginMethod
    public void apriPermesso(PluginCall call) {
        try { getContext().startActivity(ComandiTelefono.intentPermesso(getContext(), call.getString("quale"))); call.resolve(); }
        catch (Exception e) { call.reject("Impostazioni non disponibili: " + e.getMessage()); }
    }

    /** Il sito ha salvato modi o impostazioni: ridisegno il widget. */
    @PluginMethod
    public void aggiornaWidget(PluginCall call) {
        ComandiWidget.aggiornaTutti(getContext());
        call.resolve();
    }
}
