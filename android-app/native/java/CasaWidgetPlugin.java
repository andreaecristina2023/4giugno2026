package it.andreaecristina.casa;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Chiamato dal sito dopo ogni modifica: ridisegna il widget sulla home. */
@CapacitorPlugin(name = "CasaWidget")
public class CasaWidgetPlugin extends Plugin {
    @PluginMethod
    public void aggiorna(PluginCall call) {
        CasaWidget.aggiornaTutti(getContext());
        call.resolve();
    }
}
