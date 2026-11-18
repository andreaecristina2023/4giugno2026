package it.andreaecristina.casa;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Chiamato dal sito: ridisegna i widget e prepara le foto del widget "A&C Foto". */
@CapacitorPlugin(name = "CasaWidget")
public class CasaWidgetPlugin extends Plugin {

    @PluginMethod
    public void aggiorna(PluginCall call) {
        CasaWidget.aggiornaTutti(getContext());
        RifiutiWidget.aggiornaTutti(getContext());
        call.resolve();
    }

    private static String pulito(String nome) {
        return nome == null ? "" : nome.replaceAll("[^A-Za-z0-9_-]", "");
    }

    @PluginMethod
    public void salvaFoto(PluginCall call) {
        String nome = pulito(call.getString("nome"));
        String dati = call.getString("dati");
        if (nome.isEmpty() || dati == null) { call.reject("Foto mancante"); return; }
        try {
            File dir = FotoWidgetService.cartella(getContext());
            if (!dir.exists() && !dir.mkdirs()) { call.reject("Cartella non creata"); return; }
            byte[] byteFoto = Base64.decode(dati, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(new File(dir, nome + ".jpg"))) { out.write(byteFoto); }
            call.resolve();
        } catch (Exception e) {
            call.reject("Foto non salvata: " + e.getMessage());
        }
    }

    @PluginMethod
    public void impostaFoto(PluginCall call) {
        try {
            JSArray arr = call.getArray("nomi");
            List<String> nomi = arr == null ? new java.util.ArrayList<String>() : arr.<String>toList();
            File dir = FotoWidgetService.cartella(getContext());
            if (!dir.exists()) dir.mkdirs();
            Set<String> tieni = new HashSet<>();
            StringBuilder elenco = new StringBuilder();
            for (String n : nomi) { String p = pulito(n); if (p.isEmpty()) continue; tieni.add(p + ".jpg"); elenco.append(p).append('\n'); }
            try (FileWriter w = new FileWriter(new File(dir, "elenco.txt"))) { w.write(elenco.toString()); }
            File[] presenti = dir.listFiles();
            if (presenti != null) for (File f : presenti) {
                if (f.getName().endsWith(".jpg") && !tieni.contains(f.getName())) f.delete();
            }
            FotoWidget.aggiornaTutti(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Elenco foto non salvato: " + e.getMessage());
        }
    }
}
