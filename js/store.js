/* Archivio locale + sincronizzazione con Google Apps Script.
   Funziona anche senza script configurato (solo su questo dispositivo). */
var Store = (function () {
  'use strict';
  var K = { items: 'casa.items', settings: 'casa.settings', conf: 'casa.conf', dirty: 'casa.dirty', last: 'casa.lastSync' };

  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena o non disponibile */ } }

  var items = load(K.items, {});          // id → voce
  var settings = load(K.settings, null);  // impostazioni condivise (rifiuti, ecc.)
  var conf = load(K.conf, { url: '', chiave: '', chi: '' }); // solo questo dispositivo
  var dirty = load(K.dirty, { items: {}, settings: false });
  var listeners = [];
  var stato = { sync: 'idle', errore: '', ultimo: load(K.last, 0) };

  var DEFAULT_SETTINGS = {
    aggiornato: 0,
    rifiuti: { attivo: true, zona: '', oraAvviso: '20:00', festivita: true, regole: [], eccezioni: [] },
    persone: ['Andrea', 'Cristina'],
    categorie: ['Casa', 'Bollette', 'Auto', 'Salute', 'Tasse', 'Banca', 'Altro']
  };
  // Eco-Calendario Alea di casa (foto del 18/11/2026): precaricato una volta se non ci sono giorni impostati
  var CALENDARIO_CASA = {
    regole: [
      { giorno: 1, frazioni: ['umido', 'carta'], settimane: [], mesi: [] },
      { giorno: 3, frazioni: ['secco'], settimane: [1, 3], mesi: [] },
      { giorno: 3, frazioni: ['vegetale'], settimane: [], mesi: [] },
      { giorno: 3, frazioni: ['vetro'], settimane: [2], mesi: [] },
      { giorno: 4, frazioni: ['umido', 'plastica'], settimane: [], mesi: [] }
    ],
    festivi: ['01-01', '01-06', '02-04', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25'],
    pasquetta: true
  };
  if (!settings) settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  else {
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (settings[k] === undefined) settings[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k])); });
  }

  function precarica() {
    var r = settings.rifiuti;
    if (r.precaricato || (r.regole && r.regole.length)) return;
    r.regole = JSON.parse(JSON.stringify(CALENDARIO_CASA.regole));
    if (!r.festivi) r.festivi = CALENDARIO_CASA.festivi.slice();
    if (r.pasquetta === undefined) r.pasquetta = true;
    r.precaricato = true;
    settings.aggiornato = Date.now(); dirty.settings = true; persist();
    if (typeof timer !== 'undefined') syncPresto();
  }
  precarica();

  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function persist() { save(K.items, items); save(K.settings, settings); save(K.dirty, dirty); }

  function lista() { return Object.keys(items).map(function (k) { return items[k]; }).filter(function (i) { return !i.eliminato; }); }
  function get(id) { return items[id]; }

  function upsert(it) {
    if (!it.id) it.id = Casa.nuovoId();
    it.aggiornato = Date.now();
    if (!it.creatoDa && conf.chi) it.creatoDa = conf.chi;
    items[it.id] = it;
    dirty.items[it.id] = true;
    persist(); emit(); syncPresto();
    return it;
  }
  function elimina(id) {
    var it = items[id]; if (!it) return;
    it.eliminato = true; it.aggiornato = Date.now();
    dirty.items[id] = true; persist(); emit(); syncPresto();
  }
  function segnaFatto(id, data, valore) {
    var it = items[id]; if (!it) return;
    var f = (it.fatti || []).filter(function (d) { return d !== data; });
    if (valore) f.push(data);
    it.fatti = f.sort();
    upsert(it);
  }
  function setSettings(patch) {
    Object.keys(patch).forEach(function (k) { settings[k] = patch[k]; });
    settings.aggiornato = Date.now();
    dirty.settings = true; persist(); emit(); syncPresto();
  }
  function setConf(patch) { Object.keys(patch).forEach(function (k) { conf[k] = patch[k]; }); save(K.conf, conf); emit(); }

  // ---------- sincronizzazione ----------
  var timer = null, inCorso = null;
  function syncPresto() { clearTimeout(timer); timer = setTimeout(sync, 800); }
  function configurato() { return !!(conf.url && conf.chiave); }

  function merge(remoti, remSettings) {
    (remoti || []).forEach(function (r) {
      var l = items[r.id];
      if (!l || (+r.aggiornato || 0) > (+l.aggiornato || 0)) { items[r.id] = r; delete dirty.items[r.id]; }
    });
    if (remSettings && (+remSettings.aggiornato || 0) > (+settings.aggiornato || 0)) {
      settings = remSettings; dirty.settings = false;
      Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (settings[k] === undefined) settings[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k])); });
    }
  }

  function sync() {
    if (!configurato()) { stato.sync = 'locale'; emit(); return Promise.resolve(); }
    if (inCorso) return inCorso;
    var inviati = Object.keys(dirty.items).map(function (id) { return items[id]; }).filter(Boolean);
    var body = { chiave: conf.chiave, azione: 'sync', voci: inviati, impostazioni: dirty.settings ? settings : null, chi: conf.chi };
    stato.sync = 'in corso'; emit();
    inCorso = fetch(conf.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Risposta ' + r.status + ' dallo script'); return r.json(); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.errore || 'Errore dallo script');
        inviati.forEach(function (it) { if (items[it.id] && items[it.id].aggiornato === it.aggiornato) delete dirty.items[it.id]; });
        if (body.impostazioni && settings.aggiornato === body.impostazioni.aggiornato) dirty.settings = false;
        merge(res.voci, res.impostazioni);
        precarica();
        stato.sync = 'ok'; stato.errore = ''; stato.ultimo = Date.now(); save(K.last, stato.ultimo);
        persist();
      })
      .catch(function (e) {
        stato.sync = 'errore';
        stato.errore = (e && e.message === 'Failed to fetch') ? 'Nessuna connessione con lo script: le modifiche restano qui e partono appena possibile.' : String(e.message || e);
      })
      .then(function () { inCorso = null; emit(); });
    return inCorso;
  }

  function prova(url, chiave) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ chiave: chiave, azione: 'ping' }), redirect: 'follow' })
      .then(function (r) { return r.json(); });
  }

  function esporta() { return JSON.stringify({ versione: 1, esportato: new Date().toISOString(), voci: Object.keys(items).map(function (k) { return items[k]; }), impostazioni: settings }, null, 2); }
  function importa(testo) {
    var d = JSON.parse(testo);
    (d.voci || []).forEach(function (v) { v.aggiornato = Date.now(); items[v.id] = v; dirty.items[v.id] = true; });
    if (d.impostazioni) { settings = d.impostazioni; settings.aggiornato = Date.now(); dirty.settings = true; }
    persist(); emit(); syncPresto();
    return (d.voci || []).length;
  }

  window.addEventListener('online', function () { sync(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });

  return {
    lista: lista, get: get, upsert: upsert, elimina: elimina, segnaFatto: segnaFatto,
    settings: function () { return settings; }, setSettings: setSettings,
    conf: function () { return conf; }, setConf: setConf,
    sync: sync, prova: prova, configurato: configurato, stato: function () { return stato; },
    pendenti: function () { return Object.keys(dirty.items).length + (dirty.settings ? 1 : 0); },
    on: function (f) { listeners.push(f); }, esporta: esporta, importa: importa
  };
})();
