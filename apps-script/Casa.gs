// ===== Casa: incolla TUTTO questo file in Code.gs (Estensioni → Apps Script) =====

/**
 * Casa — backend su Google Sheet.
 * 1) Crea un Google Sheet vuoto → Estensioni → Apps Script.
 * 2) Incolla questo file come Code.gs e il file Core.gs come secondo file.
 * 3) Esegui la funzione setup (una volta, accetta i permessi).
 * 4) Distribuisci → Nuova distribuzione → App web: "Esegui come: me", "Chi ha accesso: Chiunque".
 * 5) Nel sito, sezione Altro: incolla l'URL /exec e la chiave che trovi nel foglio "Impostazioni".
 *
 * Bot Telegram (facoltativo): vedi funzioni trovaChatId e installaPromemoria in fondo.
 */

var COLONNE = ['id', 'tipo', 'titolo', 'data', 'ora', 'ricorrenza', 'fine', 'importo', 'categoria', 'chi', 'avviso', 'note', 'fatti', 'creatoDa', 'aggiornato', 'eliminato'];
var FOGLIO_VOCI = 'Voci';
var FOGLIO_IMP = 'Impostazioni';
// Foglio "Casa" su Drive: usato quando lo script non è creato dentro il foglio
var ID_FOGLIO = '1QkPFNUH__sHU81sqVxK3ieL82WNRTdN4fb0MECGTV5M';
function foglio() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ID_FOGLIO); }

// ---------------- installazione ----------------
function setup() {
  var ss = foglio();
  var v = ss.getSheetByName(FOGLIO_VOCI) || ss.insertSheet(FOGLIO_VOCI);
  v.getRange(1, 1, 1, COLONNE.length).setValues([COLONNE]).setFontWeight('bold');
  v.setFrozenRows(1);
  v.getRange('A:P').setNumberFormat('@'); // tutto come testo: niente conversioni automatiche di date e ore
  var imp = ss.getSheetByName(FOGLIO_IMP) || ss.insertSheet(FOGLIO_IMP);
  var props = PropertiesService.getScriptProperties();
  var chiave = props.getProperty('CHIAVE');
  if (!chiave) { chiave = Utilities.getUuid().replace(/-/g, '').slice(0, 20); props.setProperty('CHIAVE', chiave); }
  imp.getRange('A1:B1').setValues([['chiave (da incollare nel sito)', chiave]]);
  imp.getRange('A2').setValue('impostazioni condivise (non modificare a mano)');
  imp.getRange('B2').setNumberFormat('@');
  imp.setColumnWidth(1, 300); imp.setColumnWidth(2, 420);
  var s1 = ss.getSheetByName('Foglio1') || ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(s1);
  var tz = Session.getScriptTimeZone();
  Logger.log('Pronto. Chiave: ' + chiave + ' — fuso orario script: ' + tz + (tz !== 'Europe/Rome' ? '  ⚠ Imposta Europe/Rome in Impostazioni progetto' : ''));
}

// ---------------- API ----------------
function doGet() {
  return ContentService.createTextOutput('Casa: lo script è attivo. Usa questo indirizzo nel sito, sezione Altro.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var chiave = PropertiesService.getScriptProperties().getProperty('CHIAVE');
    if (!chiave || req.chiave !== chiave) throw new Error('Chiave non valida');
    if (req.azione === 'ping') out = { ok: true, messaggio: 'Collegato' };
    else if (req.azione === 'sync') out = sincronizza(req.voci || [], req.impostazioni || null);
    else throw new Error('Azione sconosciuta');
  } catch (err) {
    out = { ok: false, errore: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function sincronizza(arrivate, impostazioni) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var dati = leggiVoci();
    var cambiate = false;
    arrivate.forEach(function (n) {
      if (!n || !n.id) return;
      var vecchia = dati.mappa[n.id];
      if (!vecchia || (+n.aggiornato || 0) > (+vecchia.aggiornato || 0)) { dati.mappa[n.id] = n; cambiate = true; }
    });
    if (cambiate || dati.sistemate) scriviVoci(dati.mappa);
    var imp = leggiImpostazioni();
    if (impostazioni && (+impostazioni.aggiornato || 0) > (+(imp && imp.aggiornato) || 0)) { scriviImpostazioni(impostazioni); imp = impostazioni; }
    return { ok: true, voci: Object.keys(dati.mappa).map(function (k) { return dati.mappa[k]; }), impostazioni: imp };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- lettura/scrittura foglio ----------------
function testo(v, tipo) {
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    return tipo === 'ora' ? Utilities.formatDate(v, tz, 'HH:mm') : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : String(v);
}

function leggiVoci() {
  var sh = foglio().getSheetByName(FOGLIO_VOCI);
  var righe = sh.getDataRange().getValues();
  var intest = righe.shift() || COLONNE;
  var mappa = {}, sistemate = false;
  righe.forEach(function (r) {
    if (!r.join('')) return;
    var o = {};
    intest.forEach(function (c, i) { o[c] = r[i]; });
    // righe aggiunte a mano nel foglio: completo i campi mancanti
    if (!o.id) { o.id = Utilities.getUuid().slice(0, 12); sistemate = true; }
    if (!o.aggiornato) { o.aggiornato = Date.now(); sistemate = true; }
    if (!o.tipo) o.tipo = 'promemoria';
    o.data = testo(o.data, 'data'); o.fine = testo(o.fine, 'data'); o.ora = testo(o.ora, 'ora');
    o.importo = o.importo === '' ? '' : Number(String(o.importo).replace(',', '.'));
    o.avviso = o.avviso === '' ? '' : String(o.avviso);
    o.aggiornato = Number(o.aggiornato);
    o.eliminato = o.eliminato === true || o.eliminato === 'TRUE' || o.eliminato === 'true' || o.eliminato === 'sì';
    try { o.fatti = o.fatti ? (String(o.fatti).charAt(0) === '[' ? JSON.parse(o.fatti) : String(o.fatti).split(/[,\s]+/).filter(String)) : []; } catch (e) { o.fatti = []; }
    ['titolo', 'ricorrenza', 'categoria', 'chi', 'note', 'creatoDa'].forEach(function (k) { o[k] = testo(o[k]); });
    mappa[o.id] = o;
  });
  return { mappa: mappa, sistemate: sistemate };
}

function scriviVoci(mappa) {
  var sh = foglio().getSheetByName(FOGLIO_VOCI);
  // le voci eliminate da più di 60 giorni spariscono davvero
  var limite = Date.now() - 60 * 86400000;
  var lista = Object.keys(mappa).map(function (k) { return mappa[k]; })
    .filter(function (o) { return !(o.eliminato && +o.aggiornato < limite); })
    .sort(function (a, b) { return (a.data || '') < (b.data || '') ? -1 : 1; });
  var valori = lista.map(function (o) {
    return COLONNE.map(function (c) {
      var v = o[c];
      if (c === 'fatti') return JSON.stringify(v || []);
      if (c === 'eliminato') return v ? 'sì' : '';
      return v === undefined || v === null ? '' : String(v);
    });
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, COLONNE.length).clearContent();
  if (valori.length) sh.getRange(2, 1, valori.length, COLONNE.length).setNumberFormat('@').setValues(valori);
}

function leggiImpostazioni() {
  var v = foglio().getSheetByName(FOGLIO_IMP).getRange('B2').getValue();
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function scriviImpostazioni(o) {
  foglio().getSheetByName(FOGLIO_IMP).getRange('B2').setValue(JSON.stringify(o));
}

// ---------------- bot Telegram (facoltativo) ----------------
// 1. Su Telegram scrivi a @BotFather → /newbot → copia il token.
// 2. Progetto Apps Script → Impostazioni progetto → Proprietà script: aggiungi TELEGRAM_TOKEN = <token>.
// 3. Scrivi un messaggio qualsiasi al tuo bot (e Cristina pure, o aggiungilo a un gruppo e scrivi nel gruppo).
// 4. Esegui trovaChatId: nel registro trovi gli id. Aggiungi la proprietà TELEGRAM_CHAT_ID = id1,id2
// 5. Esegui installaPromemoria: ogni sera all'ora dei rifiuti e ogni mattina alle 7 arriva il riepilogo.

function trovaChatId() {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  if (!token) throw new Error('Manca la proprietà TELEGRAM_TOKEN');
  var r = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates').getContentText());
  var visti = {};
  (r.result || []).forEach(function (u) {
    var m = u.message || u.channel_post; if (!m) return;
    visti[m.chat.id] = (m.chat.title || ((m.chat.first_name || '') + ' ' + (m.chat.last_name || ''))).trim();
  });
  Logger.log(Object.keys(visti).length ? JSON.stringify(visti, null, 2) : 'Nessun messaggio: scrivi prima qualcosa al bot e riprova.');
}

function inviaTelegram(testoMsg) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('TELEGRAM_TOKEN'), chat = p.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return;
  chat.split(',').map(function (s) { return s.trim(); }).filter(String).forEach(function (id) {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: id, text: testoMsg, parse_mode: 'HTML', disable_web_page_preview: true })
    });
  });
}

function caricaTutto() {
  var m = leggiVoci().mappa;
  var voci = Object.keys(m).map(function (k) { return m[k]; }).filter(function (v) { return !v.eliminato; });
  var imp = leggiImpostazioni() || {};
  return { voci: voci, rifiuti: imp.rifiuti || null };
}

function h(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function rigaVoceTelegram(x) {
  return '• ' + (x.ora ? x.ora + ' ' : '') + h(x.item.titolo) + (x.item.importo ? ' — ' + Casa.euro(x.item.importo) : '') + (x.item.chi ? ' (' + h(x.item.chi) + ')' : '');
}

function promemoriaSerale() {
  var d = caricaTutto(), oggi = Casa.oggi(), domani = Casa.addGiorni(oggi, 1), righe = [];
  if (d.rifiuti && d.rifiuti.attivo !== false) {
    var r = Casa.ritiri(d.rifiuti, domani);
    if (r.frazioni.length) righe.push('🗑 <b>Stasera fuori: ' + h(Casa.nomiFrazioni(r.frazioni)) + '</b>' + (r.nota ? '\n<i>' + h(r.nota) + '</i>' : ''));
  }
  var ag = Casa.agenda(d.voci, null, domani, domani).filter(function (x) { return !x.fatto; });
  if (ag.length) righe.push('📅 <b>Domani</b>\n' + ag.map(rigaVoceTelegram).join('\n'));
  var pag = Casa.agenda(d.voci, null, Casa.addGiorni(oggi, 2), Casa.addGiorni(oggi, 3)).filter(function (x) { return !x.fatto && (x.tipo === 'pagamento' || x.tipo === 'scadenza'); });
  if (pag.length) righe.push('💶 <b>In scadenza a breve</b>\n' + pag.map(function (x) { return rigaVoceTelegram(x) + ' · ' + Casa.dataBreve(x.data); }).join('\n'));
  if (righe.length) inviaTelegram(righe.join('\n\n'));
}

function riepilogoMattina() {
  var d = caricaTutto(), oggi = Casa.oggi(), righe = [];
  var ag = Casa.agenda(d.voci, null, oggi, oggi).filter(function (x) { return !x.fatto; });
  if (ag.length) righe.push('☀️ <b>Oggi</b>\n' + ag.map(rigaVoceTelegram).join('\n'));
  var arr = Casa.arretrati(d.voci, oggi, 60);
  if (arr.length) righe.push('⚠️ <b>Ancora da sistemare</b>\n' + arr.map(function (x) { return rigaVoceTelegram(x) + ' · scaduto ' + Casa.dataBreve(x.data); }).join('\n'));
  if (righe.length) inviaTelegram(righe.join('\n\n'));
}

function installaPromemoria() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['promemoriaSerale', 'riepilogoMattina'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  var imp = leggiImpostazioni() || {};
  var ora = +(((imp.rifiuti || {}).oraAvviso || '20:00').slice(0, 2));
  ScriptApp.newTrigger('promemoriaSerale').timeBased().everyDays(1).atHour(ora).nearMinute(0).inTimezone(Session.getScriptTimeZone()).create();
  ScriptApp.newTrigger('riepilogoMattina').timeBased().everyDays(1).atHour(7).nearMinute(0).inTimezone(Session.getScriptTimeZone()).create();
  inviaTelegram('✅ Promemoria di casa attivi: ogni sera verso le ' + ora + ' e ogni mattina verso le 7.');
  Logger.log('Promemoria installati alle ' + ora + ' e alle 7 (Google li esegue entro un quarto d\'ora circa).');
}


// ===== Logica condivisa (copia di js/core.js) =====
/* Casa — logica condivisa (browser, app Android e Google Apps Script).
   Nessuna dipendenza, nessun DOM: solo date, ricorrenze e calendario rifiuti. */
var Casa = (function () {
  'use strict';

  var GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  var FRAZIONI = {
    umido:    { nome: 'Umido',            colore: '#8A5A2B' },
    carta:    { nome: 'Carta e cartone',  colore: '#2F6DB5' },
    plastica: { nome: 'Plastica e lattine', colore: '#E3B505' },
    vetro:    { nome: 'Vetro',            colore: '#2E8B57' },
    secco:    { nome: 'Secco',            colore: '#6B6F73' },
    vegetale: { nome: 'Vegetale',         colore: '#B08A5E' }
  };

  var TIPI = {
    appuntamento: { nome: 'Appuntamento', plurale: 'Appuntamenti' },
    pagamento:    { nome: 'Pagamento',    plurale: 'Pagamenti' },
    scadenza:     { nome: 'Scadenza',     plurale: 'Scadenze' },
    promemoria:   { nome: 'Promemoria',   plurale: 'Promemoria' }
  };

  var RICORRENZE = {
    '':            { nome: 'Una volta', mesi: 0, giorni: 0 },
    settimanale:   { nome: 'Ogni settimana', giorni: 7 },
    quindicinale:  { nome: 'Ogni 2 settimane', giorni: 14 },
    mensile:       { nome: 'Ogni mese', mesi: 1 },
    bimestrale:    { nome: 'Ogni 2 mesi', mesi: 2 },
    trimestrale:   { nome: 'Ogni 3 mesi', mesi: 3 },
    semestrale:    { nome: 'Ogni 6 mesi', mesi: 6 },
    annuale:       { nome: 'Ogni anno', mesi: 12 }
  };

  // ---------- date (sempre "YYYY-MM-DD", fuso locale) ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); }
  function oggi(now) { return iso(now || new Date()); }
  function addGiorni(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function addMesi(s, n, giornoOrig) {
    var d = parse(s);
    var g = giornoOrig || d.getDate();
    var m = d.getMonth() + n;
    var y = d.getFullYear() + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    var ultimo = new Date(y, m + 1, 0).getDate();
    return iso(new Date(y, m, Math.min(g, ultimo), 12));
  }
  function diffGiorni(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function giornoSett(s) { return parse(s).getDay(); }
  function settimanaDelMese(s) { return Math.ceil(parse(s).getDate() / 7); }

  function etichettaGiorno(s, rif) {
    var r = rif || oggi();
    var dd = diffGiorni(r, s);
    if (dd === 0) return 'Oggi';
    if (dd === 1) return 'Domani';
    if (dd === -1) return 'Ieri';
    var d = parse(s);
    var base = GIORNI_LUNGHI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
    if (d.getFullYear() !== parse(r).getFullYear()) base += ' ' + d.getFullYear();
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  function dataBreve(s) { var d = parse(s); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()].slice(0, 3); }

  // ---------- festività (Italia + regole Alea) ----------
  function pasqua(y) { // algoritmo di Meeus/Jones/Butcher
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
        mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(new Date(y, mese - 1, giorno, 12));
  }
  // Festività nazionali (per il calendario)
  var NAZIONALI = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '10-04', '11-01', '12-08', '12-25', '12-26'];
  // Giorni senza raccolta secondo l'Eco-Calendario Alea (modificabili nelle impostazioni rifiuti)
  var FESTIVI_ALEA = ['01-01', '01-06', '02-04', '04-25', '05-01', '06-02', '08-15', '10-04', '11-01', '12-08', '12-25', '12-26'];
  var _fest = {};
  function insiemeFestivi(y, lista, pasquetta) {
    var k = y + '|' + lista.join(',') + '|' + pasquetta;
    if (_fest[k]) return _fest[k];
    var set = {};
    lista.forEach(function (md) { set[y + '-' + md] = true; });
    if (pasquetta) set[addGiorni(pasqua(y), 1)] = true;
    _fest[k] = set;
    return set;
  }
  // festivo nazionale (calendario)
  function eFestivo(s) { return !!insiemeFestivi(+s.slice(0, 4), NAZIONALI, true)[s]; }
  // giorno senza raccolta rifiuti
  function senzaRaccolta(cfg, s) {
    var lista = (cfg && cfg.festivi && cfg.festivi.length) ? cfg.festivi : FESTIVI_ALEA;
    return !!insiemeFestivi(+s.slice(0, 4), lista, !(cfg && cfg.pasquetta === false))[s];
  }

  // ---------- rifiuti ----------
  // cfg = { regole:[{giorno:1..6, frazioni:[...], settimane:[1,3] (vuoto = tutte), mesi:[4..10] (vuoto = tutti)}],
  //         festivita:true, eccezioni:[{data, frazioni:[...], nota}] , oraEsposizione:'21:30' }
  function frazioniDaRegole(cfg, s) {
    var g = giornoSett(s), w = settimanaDelMese(s), m = parse(s).getMonth() + 1, out = [];
    (cfg.regole || []).forEach(function (r) {
      if (+r.giorno !== g) return;
      if (r.settimane && r.settimane.length && r.settimane.indexOf(w) < 0) return;
      if (r.mesi && r.mesi.length && r.mesi.indexOf(m) < 0) return;
      (r.frazioni || []).forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); });
    });
    return out;
  }
  // Ritiri effettivi del giorno s (dopo spostamenti per festività ed eccezioni manuali)
  // Regole Alea: festa lun-mer → recupero il sabato prima; gio-ven → il sabato dopo; di sabato non si recupera.
  // Il recupero c'è solo se cade ad almeno 2 giorni dalla raccolta precedente o successiva dello stesso rifiuto.
  function ritiri(cfg, s) {
    if (!cfg || !cfg.regole) return { frazioni: [], nota: '' };
    var ecc = (cfg.eccezioni || []).filter(function (e) { return e.data === s; })[0];
    if (ecc) return { frazioni: (ecc.frazioni || []).slice(), nota: ecc.nota || 'Modifica manuale' };
    var usaFest = cfg.festivita !== false;
    var g = giornoSett(s);
    var festa = usaFest && senzaRaccolta(cfg, s);
    var base = festa ? [] : frazioniDaRegole(cfg, s);
    var nota = (festa && frazioniDaRegole(cfg, s).length) ? 'Festivo: niente ritiro' : '';
    if (usaFest && g === 6) {
      var recuperati = [];
      [2, 3, 4].forEach(function (k) { var f = addGiorni(s, k); if (senzaRaccolta(cfg, f)) recuperati.push(f); });
      [-2, -1].forEach(function (k) { var f = addGiorni(s, k); if (senzaRaccolta(cfg, f)) recuperati.push(f); });
      recuperati.forEach(function (f) {
        var fr = frazioniDaRegole(cfg, f).filter(function (x) {
          // troppo vicino a un'altra raccolta dello stesso rifiuto (il giorno prima o dopo il sabato)?
          return [-1, 1].every(function (k) { var d = addGiorni(s, k); return d === f || senzaRaccolta(cfg, d) || frazioniDaRegole(cfg, d).indexOf(x) < 0; });
        });
        if (fr.length) {
          fr.forEach(function (x) { if (base.indexOf(x) < 0) base.push(x); });
          nota = 'Recupero festività di ' + GIORNI_LUNGHI[giornoSett(f)] + ' ' + parse(f).getDate();
        }
      });
    }
    return { frazioni: base, nota: nota };
  }
  // Elenco ritiri tra due date (incluse)
  function calendarioRifiuti(cfg, da, a) {
    var out = [];
    for (var s = da; s <= a; s = addGiorni(s, 1)) {
      var r = ritiri(cfg, s);
      if (r.frazioni.length) out.push({ data: s, frazioni: r.frazioni, nota: r.nota });
    }
    return out;
  }

  // ---------- voci (appuntamenti, pagamenti, scadenze, promemoria) ----------
  function occorrenze(item, da, a) {
    if (!item || item.eliminato || !item.data) return [];
    var ric = RICORRENZE[item.ricorrenza || ''] || RICORRENZE[''];
    var fine = item.fine || '9999-12-31';
    var out = [];
    if (!ric.mesi && !ric.giorni) {
      if (item.data >= da && item.data <= a) out.push(item.data);
      return out;
    }
    var s = item.data, n = 0, g0 = parse(item.data).getDate();
    // salto veloce per ricorrenze a giorni
    if (ric.giorni && s < da) { var salti = Math.floor(diffGiorni(s, da) / ric.giorni); s = addGiorni(s, salti * ric.giorni); }
    while (s <= a && s <= fine && n < 2000) {
      if (s >= da) out.push(s);
      n++;
      s = ric.giorni ? addGiorni(s, ric.giorni) : addMesi(item.data, ric.mesi * n, g0);
    }
    return out;
  }
  function fatto(item, data) { return (item.fatti || []).indexOf(data) >= 0; }
  function chiudibile(item) { return item.tipo === 'pagamento' || item.tipo === 'scadenza' || item.tipo === 'promemoria'; }

  // Agenda unificata: [{data, ora, tipo, item, fatto, scaduto}] + rifiuti come tipo 'rifiuti'
  function agenda(items, cfgRifiuti, da, a, rif) {
    var r = rif || oggi(), out = [];
    (items || []).forEach(function (it) {
      occorrenze(it, da, a).forEach(function (d) {
        var f = fatto(it, d);
        out.push({ data: d, ora: it.ora || '', tipo: it.tipo, item: it, fatto: f, scaduto: !f && chiudibile(it) && d < r });
      });
    });
    if (cfgRifiuti && cfgRifiuti.attivo !== false) {
      calendarioRifiuti(cfgRifiuti, da, a).forEach(function (x) {
        out.push({ data: x.data, ora: '', tipo: 'rifiuti', frazioni: x.frazioni, nota: x.nota });
      });
    }
    out.sort(function (x, y) {
      if (x.data !== y.data) return x.data < y.data ? -1 : 1;
      if (x.tipo === 'rifiuti') return -1; if (y.tipo === 'rifiuti') return 1;
      return (x.ora || '99') < (y.ora || '99') ? -1 : 1;
    });
    return out;
  }

  // Cose arretrate non chiuse (pagamenti/scadenze negli ultimi 'giorni' giorni)
  function arretrati(items, rif, giorni) {
    var r = rif || oggi();
    return agenda(items, null, addGiorni(r, -(giorni || 90)), addGiorni(r, -1), r).filter(function (x) { return x.scaduto; });
  }

  function nomiFrazioni(lista) { return lista.map(function (f) { return (FRAZIONI[f] || { nome: f }).nome; }).join(' + '); }

  // Promemoria da programmare (notifiche app e bot Telegram)
  // opz = { oraRifiuti:'20:00', oraMattino:'09:00', anticipoAppuntamento:60 }
  function promemoria(items, cfgRifiuti, da, a, opz) {
    opz = opz || {};
    var oraR = (cfgRifiuti && cfgRifiuti.oraAvviso) || opz.oraRifiuti || '20:00';
    var oraM = opz.oraMattino || '09:00';
    var out = [];
    agenda(items, cfgRifiuti, da, addGiorni(a, 1)).forEach(function (x) {
      if (x.tipo === 'rifiuti') {
        var sera = addGiorni(x.data, -1);
        if (sera >= da && sera <= a) out.push({ quando: sera + 'T' + oraR, titolo: 'Stasera fuori: ' + nomiFrazioni(x.frazioni), testo: 'Ritiro di ' + GIORNI_LUNGHI[giornoSett(x.data)] + (x.nota ? ' · ' + x.nota : ''), chiave: 'r' + x.data });
        return;
      }
      if (x.fatto) return;
      var it = x.item;
      if (x.tipo === 'appuntamento' && x.ora) {
        var ant = it.avviso !== undefined && it.avviso !== '' ? +it.avviso : (opz.anticipoAppuntamento || 60);
        var t = new Date(parse(x.data).getFullYear(), parse(x.data).getMonth(), parse(x.data).getDate(), +x.ora.slice(0, 2), +x.ora.slice(3, 5));
        t = new Date(t.getTime() - ant * 60000);
        var q = iso(t) + 'T' + pad(t.getHours()) + ':' + pad(t.getMinutes());
        if (q.slice(0, 10) >= da && q.slice(0, 10) <= a) out.push({ quando: q, titolo: it.titolo, testo: 'Alle ' + x.ora + (it.note ? ' · ' + it.note : ''), chiave: 'a' + it.id + x.data });
        return;
      }
      var pre = (x.tipo === 'pagamento' || x.tipo === 'scadenza') ? (it.avviso !== undefined && it.avviso !== '' ? Math.round(+it.avviso / 1440) : 2) : 0;
      var importo = it.importo ? ' · € ' + Number(it.importo).toFixed(2).replace('.', ',') : '';
      if (pre > 0) {
        var dpre = addGiorni(x.data, -pre);
        if (dpre >= da && dpre <= a) out.push({ quando: dpre + 'T' + oraM, titolo: it.titolo + ' tra ' + pre + (pre === 1 ? ' giorno' : ' giorni'), testo: TIPI[x.tipo].nome + importo, chiave: 'p' + it.id + x.data + 'pre' });
      }
      if (x.data >= da && x.data <= a) out.push({ quando: x.data + 'T' + (x.ora || oraM), titolo: it.titolo + (x.tipo === 'promemoria' ? '' : ' scade oggi'), testo: TIPI[x.tipo].nome + importo, chiave: 'p' + it.id + x.data });
    });
    out.sort(function (p, q) { return p.quando < q.quando ? -1 : 1; });
    return out;
  }

  function hashInt(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h) % 2000000000 + 1; }
  function nuovoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function euro(n) { return '€ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  return {
    GIORNI: GIORNI, GIORNI_LUNGHI: GIORNI_LUNGHI, MESI: MESI, FRAZIONI: FRAZIONI, TIPI: TIPI, RICORRENZE: RICORRENZE,
    iso: iso, parse: parse, oggi: oggi, addGiorni: addGiorni, addMesi: addMesi, diffGiorni: diffGiorni,
    giornoSett: giornoSett, settimanaDelMese: settimanaDelMese, etichettaGiorno: etichettaGiorno, dataBreve: dataBreve,
    pasqua: pasqua, eFestivo: eFestivo, senzaRaccolta: senzaRaccolta, FESTIVI_ALEA: FESTIVI_ALEA, ritiri: ritiri, calendarioRifiuti: calendarioRifiuti,
    occorrenze: occorrenze, fatto: fatto, chiudibile: chiudibile, agenda: agenda, arretrati: arretrati,
    promemoria: promemoria, nomiFrazioni: nomiFrazioni, hashInt: hashInt, nuovoId: nuovoId, euro: euro, pad: pad
  };
})();
if (typeof module !== 'undefined') module.exports = Casa;
