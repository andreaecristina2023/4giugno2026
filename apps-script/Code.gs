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

// ---------------- installazione ----------------
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_VOCI);
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
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_VOCI);
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
  var v = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_IMP).getRange('B2').getValue();
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function scriviImpostazioni(o) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_IMP).getRange('B2').setValue(JSON.stringify(o));
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
