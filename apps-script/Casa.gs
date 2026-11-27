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

var COLONNE = ['id', 'tipo', 'titolo', 'data', 'ora', 'ricorrenza', 'fine', 'importo', 'categoria', 'chi', 'avviso', 'note', 'fatti', 'creatoDa', 'aggiornato', 'eliminato', 'targa', 'extra'];
var COLONNE_FOTO = ['id', 'file', 'mini', 'didascalia', 'data', 'caricataDa', 'larghezza', 'altezza', 'aggiornato', 'eliminato'];
var FOGLIO_FOTO = 'Foto';
var FOGLIO_VOCI = 'Voci';
var FOGLIO_IMP = 'Impostazioni';
// Foglio "Casa" su Drive: usato quando lo script non è creato dentro il foglio
var ID_FOGLIO = '1QkPFNUH__sHU81sqVxK3ieL82WNRTdN4fb0MECGTV5M';
function foglio() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ID_FOGLIO); }

// ---------------- installazione ----------------
function setup() {
  // Con il consenso "granulare" di Google si possono spuntare solo alcuni permessi:
  // qui li chiedo tutti (fogli, Drive per le foto, connessioni esterne per Telegram)
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  var ss = foglio();
  var v = ss.getSheetByName(FOGLIO_VOCI) || ss.insertSheet(FOGLIO_VOCI);
  v.getRange(1, 1, 1, COLONNE.length).setValues([COLONNE]).setFontWeight('bold');
  v.setFrozenRows(1);
  v.getRange('A:R').setNumberFormat('@'); // tutto come testo: niente conversioni automatiche di date e ore
  var fo = ss.getSheetByName(FOGLIO_FOTO) || ss.insertSheet(FOGLIO_FOTO);
  fo.getRange(1, 1, 1, COLONNE_FOTO.length).setValues([COLONNE_FOTO]).setFontWeight('bold');
  fo.setFrozenRows(1);
  fo.getRange('A:J').setNumberFormat('@');
  try { cartellaAllegati(); } catch (e) { /* segnalato sotto con la cartella foto */ }
  foglioPrezzi();
  if (chiaveSerpApi() && !triggerPrezziAttivo()) installaPrezziVoli();
  var cartellaFoto = null, erroreCartella = '';
  try { cartellaFoto = cartellaAlbum(); } catch (e) { erroreCartella = e.message + ' — riesegui setup e spunta "Seleziona tutto" nei permessi'; } // crea la cartella delle foto su Drive (e chiede il permesso la prima volta)
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
  Logger.log(cartellaFoto ? 'Cartella foto: ' + cartellaFoto.getUrl() : '⚠ Cartella foto non creata: ' + erroreCartella);
  Logger.log('Ricorda: Esegui il deployment → Gestisci deployment → modifica → Nuova versione, altrimenti il sito usa ancora il codice vecchio.');
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
    else if (req.azione === 'foto_lista') out = { ok: true, foto: leggiFoto().filter(function (f) { return !f.eliminato; }), cartella: urlCartella() };
    else if (req.azione === 'foto_carica') out = caricaFoto(req);
    else if (req.azione === 'foto_mini') out = { ok: true, mini: datiFoto(req.ids || [], 'mini') };
    else if (req.azione === 'foto_grande') out = { ok: true, grande: datiFoto([req.id], 'file')[req.id] || null };
    else if (req.azione === 'foto_modifica') out = modificaFoto(req.id, { didascalia: req.didascalia, data: req.data });
    else if (req.azione === 'foto_elimina') out = modificaFoto(req.id, { eliminato: true });
    else if (req.azione === 'allegato_carica') out = caricaAllegato(req);
    else if (req.azione === 'allegato_scarica') out = scaricaAllegato(req.id);
    else if (req.azione === 'allegato_elimina') out = eliminaAllegato(req.id);
    else if (req.azione === 'allegato_rinomina') out = rinominaAllegato(req.id, req.nome);
    else if (req.azione === 'ocr') out = leggiTesto(req);
    else if (req.azione === 'voli_prezzi') out = voliPrezzi();
    else if (req.azione === 'voli_controlla') out = voliControlla(req);
    else if (req.azione === 'voli_imposta') out = voliImposta(req);
    else if (req.azione === 'luci_elenco') out = luciElenco();
    else if (req.azione === 'luce_comando') out = luceComando(req);
    else if (req.azione === 'luce_stato') out = { ok: true, luce: luceStato(req.id) };
    else if (req.azione === 'scena_avvia') out = scenaAvvia(req);
    else if (req.azione === 'tuya_imposta') out = tuyaImposta(req);
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
    ['titolo', 'ricorrenza', 'categoria', 'chi', 'note', 'creatoDa', 'targa'].forEach(function (k) { o[k] = testo(o[k]); });
    if (o.extra) { try { var ex = JSON.parse(o.extra); Object.keys(ex).forEach(function (k) { if (o[k] === undefined || o[k] === '') o[k] = ex[k]; }); } catch (e) { /* extra non valido */ } }
    delete o.extra;
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
      if (c === 'extra') { // campi futuri non previsti dalle colonne
        var ex = {}; Object.keys(o).forEach(function (k) { if (COLONNE.indexOf(k) < 0) ex[k] = o[k]; });
        return Object.keys(ex).length ? JSON.stringify(ex) : '';
      }
      return v === undefined || v === null ? '' : String(v);
    });
  });
  sh.getRange(1, 1, 1, COLONNE.length).setValues([COLONNE]);
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


// ---------------- album foto (Google Drive) ----------------
function cartellaAlbum() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARTELLA_FOTO');
  if (id) { try { var c = DriveApp.getFolderById(id); if (!c.isTrashed()) return c; } catch (e) { /* cartella sparita: la ricreo */ } }
  // la cartella va accanto al foglio "Casa" (se si può), altrimenti nel Drive principale di chi esegue lo script
  var padre = null;
  try { var it = DriveApp.getFileById(foglio().getId()).getParents(); if (it.hasNext()) padre = it.next(); } catch (e) { padre = null; }
  var esistenti = (padre || DriveApp.getRootFolder()).getFoldersByName('A&C Album');
  var cartella = esistenti.hasNext() ? esistenti.next() : (padre ? padre.createFolder('A&C Album') : DriveApp.createFolder('A&C Album'));
  props.setProperty('CARTELLA_FOTO', cartella.getId());
  return cartella;
}

// Da eseguire a mano se l'album non va: scrive nel registro dov'è la cartella delle foto (o perché non si crea)
function verificaAlbum() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  Logger.log('Script eseguito da: ' + Session.getEffectiveUser().getEmail());
  try {
    var c = cartellaAlbum();
    Logger.log('Cartella foto OK: ' + c.getUrl());
  } catch (e) {
    Logger.log('Cartella foto NON creata: ' + e.message + ' — esegui di nuovo setup e, nella schermata dei permessi, spunta "Seleziona tutto".');
  }
}

function urlCartella() { try { return cartellaAlbum().getUrl(); } catch (e) { return ''; } }

function foglioFoto() {
  var ss = foglio();
  var fo = ss.getSheetByName(FOGLIO_FOTO);
  if (!fo) {
    fo = ss.insertSheet(FOGLIO_FOTO);
    fo.getRange(1, 1, 1, COLONNE_FOTO.length).setValues([COLONNE_FOTO]).setFontWeight('bold');
    fo.setFrozenRows(1); fo.getRange('A:J').setNumberFormat('@');
  }
  return fo;
}

function leggiFoto() {
  var righe = foglioFoto().getDataRange().getValues();
  righe.shift();
  return righe.filter(function (r) { return r[0]; }).map(function (r) {
    var o = {};
    COLONNE_FOTO.forEach(function (c, i) { o[c] = r[i]; });
    o.data = testo(o.data, 'data'); o.didascalia = testo(o.didascalia); o.caricataDa = testo(o.caricataDa);
    o.larghezza = +o.larghezza || 0; o.altezza = +o.altezza || 0; o.aggiornato = +o.aggiornato || 0;
    o.eliminato = o.eliminato === 'sì' || o.eliminato === true;
    return o;
  });
}

function caricaFoto(req) {
  if (!req.dati || !req.mini) throw new Error('Foto mancante');
  var cartella = cartellaAlbum();
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var nome = (req.data || Casa.oggi()) + '_' + id;
  var grande = cartella.createFile(Utilities.newBlob(Utilities.base64Decode(req.dati), 'image/jpeg', nome + '.jpg'));
  var mini = cartella.createFile(Utilities.newBlob(Utilities.base64Decode(req.mini), 'image/jpeg', nome + '_mini.jpg'));
  var o = { id: id, file: grande.getId(), mini: mini.getId(), didascalia: String(req.didascalia || '').slice(0, 300), data: req.data || Casa.oggi(),
    caricataDa: String(req.chi || ''), larghezza: +req.larghezza || 0, altezza: +req.altezza || 0, aggiornato: Date.now(), eliminato: false };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { foglioFoto().appendRow(COLONNE_FOTO.map(function (c) { return c === 'eliminato' ? '' : String(o[c]); })); }
  finally { lock.releaseLock(); }
  return { ok: true, foto: o };
}

function datiFoto(ids, campo) {
  var perId = {}; leggiFoto().forEach(function (f) { perId[f.id] = f; });
  var out = {};
  ids.slice(0, 30).forEach(function (id) {
    var f = perId[id]; if (!f || f.eliminato) return;
    try { out[id] = Utilities.base64Encode(DriveApp.getFileById(f[campo]).getBlob().getBytes()); } catch (e) { /* file non trovato */ }
  });
  return out;
}

function modificaFoto(id, cambi) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = foglioFoto(), righe = sh.getDataRange().getValues();
    for (var i = 1; i < righe.length; i++) {
      if (righe[i][0] !== id) continue;
      var riga = i + 1;
      if (cambi.didascalia !== undefined) sh.getRange(riga, COLONNE_FOTO.indexOf('didascalia') + 1).setValue(String(cambi.didascalia).slice(0, 300));
      if (cambi.data) sh.getRange(riga, COLONNE_FOTO.indexOf('data') + 1).setValue(cambi.data);
      if (cambi.eliminato) {
        sh.getRange(riga, COLONNE_FOTO.indexOf('eliminato') + 1).setValue('sì');
        [righe[i][1], righe[i][2]].forEach(function (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (e) { /* già eliminata */ } });
      }
      sh.getRange(riga, COLONNE_FOTO.indexOf('aggiornato') + 1).setValue(String(Date.now()));
      return { ok: true };
    }
    throw new Error('Foto non trovata');
  } finally { lock.releaseLock(); }
}


// ---------------- allegati (biglietti, eVisa, conferme) su Google Drive ----------------
function cartellaAllegati() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CARTELLA_ALLEGATI');
  if (id) { try { var c = DriveApp.getFolderById(id); if (!c.isTrashed()) return c; } catch (e) { /* la ricreo */ } }
  var padre = null;
  try { var it = DriveApp.getFileById(foglio().getId()).getParents(); if (it.hasNext()) padre = it.next(); } catch (e) { padre = null; }
  var esistenti = (padre || DriveApp.getRootFolder()).getFoldersByName('A&C Allegati');
  var cartella = esistenti.hasNext() ? esistenti.next() : (padre ? padre.createFolder('A&C Allegati') : DriveApp.createFolder('A&C Allegati'));
  props.setProperty('CARTELLA_ALLEGATI', cartella.getId());
  return cartella;
}

function allegatoNellaCartella(id) {
  var f = DriveApp.getFileById(id), dir = cartellaAllegati().getId(), it = f.getParents();
  while (it.hasNext()) if (it.next().getId() === dir) return f;
  throw new Error('Allegato non trovato');
}

function caricaAllegato(req) {
  if (!req.dati) throw new Error('File mancante');
  var nome = String(req.nome || 'allegato').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  var blob = Utilities.newBlob(Utilities.base64Decode(req.dati), req.mime || 'application/octet-stream', nome);
  var f = cartellaAllegati().createFile(blob);
  return { ok: true, allegato: { id: f.getId(), nome: f.getName(), mime: req.mime || blob.getContentType(), dimensione: f.getSize() } };
}

function scaricaAllegato(id) {
  var f = allegatoNellaCartella(id);
  return { ok: true, dati: Utilities.base64Encode(f.getBlob().getBytes()), mime: f.getMimeType(), nome: f.getName() };
}

function eliminaAllegato(id) {
  try { allegatoNellaCartella(id).setTrashed(true); } catch (e) { /* già eliminato */ }
  return { ok: true };
}

// Legge il testo di una foto (OCR di Google Drive). Richiede il servizio avanzato «Drive API» attivo nello script.
function leggiTesto(req) {
  if (!req.dati) throw new Error('Foto mancante');
  var blob = Utilities.newBlob(Utilities.base64Decode(req.dati), 'image/jpeg', 'documento.jpg');
  var tmp = Drive.Files.create({ name: 'ocr-' + Date.now(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'it' });
  var testo = '';
  try { testo = DriveApp.getFileById(tmp.id).getAs('text/plain').getDataAsString(); }
  finally { try { DriveApp.getFileById(tmp.id).setTrashed(true); } catch (e) { /* già eliminato */ } }
  return { ok: true, testo: testo };
}

function rinominaAllegato(id, nome) {
  if (!id || !nome) throw new Error('Nome o id mancante');
  var nuovo = String(nome).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  allegatoNellaCartella(id).setName(nuovo);
  return { ok: true, nome: nuovo };
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


// ---------------- Prezzi dei voli (Google Flights tramite SerpApi) ----------------
// La chiave SerpApi (serpapi.com, piano gratuito: 250 ricerche al mese) si salva dall'app
// (Viaggi → Monitora prezzi → ⚙) oppure a mano nella proprietà script SERPAPI_KEY.
// Ogni mattina verso le 7 lo script controlla le tratte attive: una ricerca per tratta,
// anche con le date flessibili ±3 giorni (calendario prezzi di Google Flights).
var FOGLIO_PREZZI = 'PrezziVoli';
var COLONNE_PREZZI = ['quando', 'id', 'prezzo', 'andata', 'ritorno', 'compagnia', 'dettagli'];

function foglioPrezzi() {
  var ss = foglio(), sh = ss.getSheetByName(FOGLIO_PREZZI);
  if (!sh) {
    sh = ss.insertSheet(FOGLIO_PREZZI);
    sh.getRange(1, 1, 1, COLONNE_PREZZI.length).setValues([COLONNE_PREZZI]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:G').setNumberFormat('@');
  }
  return sh;
}
function leggiPrezzi() {
  var sh = foglioPrezzi(), righe = sh.getDataRange().getValues(), out = {};
  righe.shift();
  righe.forEach(function (r) {
    if (!r[1]) return;
    var d = {}; try { d = r[6] ? JSON.parse(r[6]) : {}; } catch (e) { d = {}; }
    (out[r[1]] = out[r[1]] || []).push({ quando: testo(r[0]), prezzo: r[2] === '' ? null : Number(r[2]), andata: testo(r[3], 'data'), ritorno: testo(r[4], 'data'), compagnia: testo(r[5]), dettagli: d });
  });
  Object.keys(out).forEach(function (k) { out[k] = out[k].slice(-90); });
  return out;
}
function chiaveSerpApi() { return PropertiesService.getScriptProperties().getProperty('SERPAPI_KEY') || ''; }
function serpApi(param) {
  var key = chiaveSerpApi();
  if (!key) throw new Error('Manca la chiave SerpApi: inseriscila in Viaggi → Monitora prezzi → ⚙');
  param.api_key = key;
  var q = Object.keys(param).filter(function (k) { return param[k] !== '' && param[k] != null; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(param[k]); }).join('&');
  var r = UrlFetchApp.fetch('https://serpapi.com/search.json?' + q, { muteHttpExceptions: true });
  var j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Risposta non valida da SerpApi (' + r.getResponseCode() + ')'); }
  if (j.error && !/hasn't returned any results/i.test(j.error)) throw new Error('SerpApi: ' + j.error);
  return j;
}
function ricercheRimaste() {
  var key = chiaveSerpApi(); if (!key) return null;
  try {
    var j = JSON.parse(UrlFetchApp.fetch('https://serpapi.com/account.json?api_key=' + encodeURIComponent(key), { muteHttpExceptions: true }).getContentText());
    return j.total_searches_left != null ? j.total_searches_left : (j.plan_searches_left != null ? j.plan_searches_left : null);
  } catch (e) { return null; }
}
function giorniTra(a, b) { return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000); }
function piuGiorni(d, n) { var t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 86400000); return Utilities.formatDate(t, 'UTC', 'yyyy-MM-dd'); }
function aeroporti(s) { return String(s || '').toUpperCase().replace(/[^A-Z,]/g, '').split(',').filter(function (x) { return x.length === 3; }).join(','); }

// controlla una tratta: { id, da, a, andata, ritorno, flex, adulti, scali } → riga di prezzo
function cercaPrezzo(m) {
  var oggi = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  var da = aeroporti(m.da), a = aeroporti(m.a), flex = +m.flex || 0;
  if (!da || !a) throw new Error('Aeroporti non validi (servono i codici di 3 lettere, es. BLQ)');
  if (!m.andata) throw new Error('Manca la data di andata');
  var base = { currency: 'EUR', hl: 'it', gl: 'it', adults: +m.adulti || 1, stops: m.scali || '' , departure_id: da, arrival_id: a };
  var andataTra = m.ritorno ? m.ritorno : '';
  if (flex > 0) {
    var inizio = piuGiorni(m.andata, -flex); if (inizio < oggi) inizio = oggi;
    var fine = piuGiorni(m.andata, flex);
    if (fine < oggi) throw new Error('Le date sono già passate');
    var p = Object.assign({ engine: 'google_flights_calendar', type: m.ritorno ? 1 : 2, date_range_start: inizio, date_range_end: fine }, base);
    if (m.ritorno) p.round_trip_days = Math.max(1, giorniTra(m.andata, m.ritorno));
    var j = serpApi(p);
    var prezzi = (j.prices || []).filter(function (x) { return x.price != null && x.outbound_date >= inizio && x.outbound_date <= fine; });
    if (!prezzi.length) return { prezzo: null, andata: m.andata, ritorno: andataTra, compagnia: '', dettagli: { nota: 'Nessun volo trovato nella finestra ±' + flex + ' giorni' } };
    var min = prezzi.reduce(function (x, y) { return y.price < x.price ? y : x; });
    return { prezzo: min.price, andata: min.outbound_date, ritorno: min.return_date || '', compagnia: '', dettagli: { flex: flex, giorni: prezzi.map(function (x) { return [x.outbound_date, x.return_date || '', x.price]; }) } };
  }
  if (m.andata < oggi) throw new Error('La data di andata è già passata');
  var q = Object.assign({ engine: 'google_flights', type: m.ritorno ? 1 : 2, outbound_date: m.andata, return_date: m.ritorno || '', sort_by: 2 }, base);
  var r = serpApi(q);
  var voli = (r.best_flights || []).concat(r.other_flights || []).filter(function (x) { return x.price != null; });
  var pi = r.price_insights || {};
  var url = (r.search_metadata || {}).google_flights_url || '';
  if (!voli.length) return { prezzo: null, andata: m.andata, ritorno: andataTra, compagnia: '', dettagli: { nota: 'Nessun volo trovato', url: url } };
  var best = voli.reduce(function (x, y) { return y.price < x.price ? y : x; });
  var tratte = best.flights || [], primo = tratte[0] || {}, ultimo = tratte[tratte.length - 1] || {};
  var compagnie = tratte.map(function (t) { return t.airline; }).filter(function (x, i, l) { return x && l.indexOf(x) === i; });
  return { prezzo: best.price, andata: m.andata, ritorno: andataTra, compagnia: compagnie.join(' + '), dettagli: {
    partenza: (primo.departure_airport || {}).time || '', arrivo: (ultimo.arrival_airport || {}).time || '',
    voli: tratte.map(function (t) { return t.flight_number; }).filter(Boolean).join(', '),
    scali: Math.max(0, tratte.length - 1), durata: best.total_duration || null,
    livello: pi.price_level || '', tipico: pi.typical_price_range || null, minimoGoogle: pi.lowest_price || null,
    storicoGoogle: (pi.price_history || []).slice(-60), url: url
  } };
}
function scriviPrezzo(id, r, errore) {
  var d = r ? r.dettagli || {} : {};
  if (errore) d = { errore: errore };
  foglioPrezzi().appendRow([Utilities.formatDate(new Date(), 'Europe/Rome', "yyyy-MM-dd'T'HH:mm"), id, r && r.prezzo != null ? String(r.prezzo) : '', r ? r.andata : '', r ? r.ritorno : '', r ? r.compagnia : '', JSON.stringify(d)]);
}
function tratteAttive() {
  var m = leggiVoci().mappa, oggi = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  return Object.keys(m).map(function (k) { return m[k]; }).filter(function (v) {
    return v.tipo === 'prezzovolo' && !v.eliminato && v.attivo !== false && v.attivo !== 'false' && v.andata && piuGiorni(v.andata, +v.flex || 0) >= oggi;
  });
}
function euroT(n) { return n == null ? '—' : Math.round(n) + ' €'; }
// avviso se il prezzo scende sotto la soglia o cala di almeno il 10% rispetto al controllo precedente
function avvisoPrezzo(m, prima, r) {
  if (!r || r.prezzo == null) return '';
  var soglia = m.soglia === '' || m.soglia == null ? null : Number(m.soglia);
  var prec = null; for (var i = (prima || []).length - 1; i >= 0; i--) if (prima[i].prezzo != null) { prec = prima[i].prezzo; break; }
  var sotto = soglia != null && r.prezzo <= soglia && (prec == null || prec > soglia);
  var calo = prec != null && r.prezzo <= prec * 0.9;
  if (!sotto && !calo) return '';
  return '✈️ <b>' + h(m.titolo || (m.da + ' → ' + m.a)) + ': ' + euroT(r.prezzo) + '</b>' +
    (prec != null ? ' (prima ' + euroT(prec) + ')' : '') + (sotto ? '\nSotto la soglia di ' + euroT(soglia) : '') +
    '\n' + Casa.dataBreve(r.andata) + (r.ritorno ? ' – ' + Casa.dataBreve(r.ritorno) : '') + (r.compagnia ? ' · ' + h(r.compagnia) : '');
}
function controllaPrezziVoli() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (!chiaveSerpApi()) { Logger.log('Manca SERPAPI_KEY'); return; }
    var storico = leggiPrezzi(), msg = [], oggi = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
    tratteAttive().slice(0, 15).forEach(function (m) {
      var gia = (storico[m.id] || []).some(function (x) { return String(x.quando).slice(0, 10) === oggi && !x.dettagli.errore; });
      if (gia) return; // già controllata oggi (anche a mano dall'app)
      try { var r = cercaPrezzo(m); scriviPrezzo(m.id, r); var a = avvisoPrezzo(m, storico[m.id], r); if (a) msg.push(a); }
      catch (e) { scriviPrezzo(m.id, null, String(e.message || e)); }
    });
    if (msg.length) inviaTelegram(msg.join('\n\n'));
  } finally { lock.releaseLock(); }
}
function installaPrezziVoli() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'controllaPrezziVoli') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('controllaPrezziVoli').timeBased().everyDays(1).atHour(7).nearMinute(0).inTimezone('Europe/Rome').create();
  Logger.log('Controllo prezzi dei voli attivo: ogni mattina verso le 7.');
}
function triggerPrezziAttivo() { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'controllaPrezziVoli'; }); }
// azioni dall'app
function voliPrezzi() { return { ok: true, storico: leggiPrezzi(), chiave: !!chiaveSerpApi(), automatico: triggerPrezziAttivo() }; }
function voliControlla(req) {
  var m = req.monitor; if (!m || !m.id) throw new Error('Tratta mancante');
  var storico = leggiPrezzi(), r = null, err = '';
  try { r = cercaPrezzo(m); } catch (e) { err = String(e.message || e); }
  scriviPrezzo(m.id, r, err);
  var out = voliPrezzi(); out.rimaste = ricercheRimaste(); out.errore = err; out.avviso = err ? '' : avvisoPrezzo(m, storico[m.id], r);
  if (out.avviso) inviaTelegram(out.avviso);
  return out;
}
function voliImposta(req) {
  var p = PropertiesService.getScriptProperties();
  if (req.serpapi !== undefined) { if (req.serpapi) p.setProperty('SERPAPI_KEY', String(req.serpapi).trim()); else p.deleteProperty('SERPAPI_KEY'); }
  if (chiaveSerpApi() && !triggerPrezziAttivo()) installaPrezziVoli();
  var rimaste = ricercheRimaste();
  if (chiaveSerpApi() && rimaste === null) throw new Error('La chiave SerpApi non funziona: controllala su serpapi.com/manage-api-key');
  return { ok: true, chiave: !!chiaveSerpApi(), automatico: triggerPrezziAttivo(), rimaste: rimaste };
}


// ---------------- Luci Tuya / Smart Life (cloud Tuya) ----------------
// Le chiavi del progetto cloud (iot.tuya.com → Cloud → il tuo progetto → Overview: Access ID e Access Secret)
// si salvano dall'app (💡 Luci → ⚙) oppure a mano nelle proprietà script TUYA_ID, TUYA_SECRET, TUYA_REGIONE.
// Non tornano mai al telefono. Per provare: esegui verificaTuya() e guarda il registro.
var TUYA_REGIONI = {
  'eu': 'https://openapi.tuyaeu.com',          // Europa centrale (Italia)
  'weu': 'https://openapi-weaz.tuyaeu.com',    // Europa occidentale
  'us': 'https://openapi.tuyaus.com',          // America occidentale
  'ueaz': 'https://openapi-ueaz.tuyaus.com',   // America orientale
  'in': 'https://openapi.tuyain.com',          // India
  'cn': 'https://openapi.tuyacn.com'           // Cina
};
var TUYA_CATEGORIE_LUCI = ['dj', 'dd', 'xdd', 'fwd', 'dc', 'tgq', 'tgkg', 'kg', 'cz', 'pc', 'sxd', 'tyndj', 'gyd', 'fsd', 'mbd', 'ykq', 'ty'];

function tuyaConf() {
  var p = PropertiesService.getScriptProperties();
  var reg = p.getProperty('TUYA_REGIONE') || 'eu';
  return { id: (p.getProperty('TUYA_ID') || '').trim(), secret: (p.getProperty('TUYA_SECRET') || '').trim(), regione: reg, base: (TUYA_REGIONI[reg] || reg).replace(/\/+$/, '') };
}
function tuyaConfigurato() { var c = tuyaConf(); return !!(c.id && c.secret); }

function tuyaImposta(req) {
  var p = PropertiesService.getScriptProperties();
  if (req.id !== undefined) { if (req.id) p.setProperty('TUYA_ID', String(req.id).trim()); else p.deleteProperty('TUYA_ID'); }
  if (req.secret !== undefined && req.secret !== '••••') { if (req.secret) p.setProperty('TUYA_SECRET', String(req.secret).trim()); else p.deleteProperty('TUYA_SECRET'); }
  if (req.regione) p.setProperty('TUYA_REGIONE', String(req.regione));
  CacheService.getScriptCache().remove('tuya_token');
  if (!tuyaConfigurato()) return { ok: true, configurato: false };
  tuyaToken(true); // prova subito le chiavi: se sono sbagliate l'errore arriva all'app
  return { ok: true, configurato: true, regione: tuyaConf().regione };
}

function tuyaHex(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
function tuyaSha256(testo) { return tuyaHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, testo || '', Utilities.Charset.UTF_8)); }
function tuyaHmac(testo, chiave) { return tuyaHex(Utilities.computeHmacSha256Signature(testo, chiave, Utilities.Charset.UTF_8)).toUpperCase(); }

// firma Tuya: HMAC-SHA256(client_id + access_token + t + nonce + stringToSign, secret) in maiuscolo,
// stringToSign = METODO \n sha256(corpo) \n (intestazioni firmate: nessuna) \n url con la query in ordine alfabetico
function tuyaFirma(c, token, t, metodo, url, corpo) {
  var sts = metodo + '\n' + tuyaSha256(corpo) + '\n\n' + url;
  return tuyaHmac(c.id + (token || '') + t + sts, c.secret);
}

function tuyaErrore(j) {
  var codice = j && j.code, msg = (j && j.msg) || 'errore sconosciuto';
  var spiegazioni = {
    1004: 'Firma non valida: controlla l\'Access Secret',
    1010: 'Token scaduto, riprova',
    1011: 'Token non valido, riprova',
    1106: 'Permesso negato: collega l\'account Smart Life/Tuya Smart al progetto (Devices → Link App Account) e controlla il data center',
    1108: 'Data center sbagliato: scegli quello del tuo account (per l\'Italia di solito Europa centrale)',
    2009: 'Il progetto non può usare questa funzione: aggiungi il servizio "IoT Core" (Service API)',
    2017: 'Scena non trovata',
    2008: 'Comando non supportato da questo dispositivo',
    28841101: 'Il periodo di prova di Tuya è scaduto: rinnovalo su iot.tuya.com → Cloud → Cloud Services → IoT Core → Extend Trial Period',
    28841105: 'Il progetto non è autorizzato: aggiungi il servizio "IoT Core" oppure rinnova la prova',
    28841002: 'Il periodo di prova di Tuya è scaduto: rinnovalo su iot.tuya.com'
  };
  return (spiegazioni[codice] ? spiegazioni[codice] + ' (' : 'Tuya: ' + msg + ' (') + 'codice ' + codice + ')';
}

function tuyaToken(forza) {
  var cache = CacheService.getScriptCache();
  if (!forza) { var t0 = cache.get('tuya_token'); if (t0) return t0; }
  var r = tuyaChiama('GET', '/v1.0/token', { grant_type: 1 }, null, true);
  var durata = Math.max(60, Math.min(21600, (r.expire_time || 7200) - 120));
  cache.put('tuya_token', r.access_token, durata);
  return r.access_token;
}

function tuyaChiama(metodo, percorso, query, corpo, perToken, giaRiprovato) {
  var c = tuyaConf();
  if (!c.id || !c.secret) throw new Error('TUYA_NON_CONFIGURATO');
  var q = query ? Object.keys(query).sort().filter(function (k) { return query[k] !== '' && query[k] != null; }).map(function (k) { return k + '=' + query[k]; }).join('&') : '';
  var url = percorso + (q ? '?' + q : '');
  var body = corpo ? JSON.stringify(corpo) : '';
  var token = perToken ? '' : tuyaToken();
  var t = String(Date.now());
  var intest = { client_id: c.id, sign: tuyaFirma(c, token, t, metodo, url, body), t: t, sign_method: 'HMAC-SHA256', lang: 'it' };
  if (token) intest.access_token = token;
  var opz = { method: metodo.toLowerCase(), headers: intest, muteHttpExceptions: true, contentType: 'application/json' };
  if (body) opz.payload = body;
  var risp = UrlFetchApp.fetch(c.base + url, opz), j;
  try { j = JSON.parse(risp.getContentText()); } catch (e) { throw new Error('Risposta non valida da Tuya (' + risp.getResponseCode() + ')'); }
  if (!j.success) {
    if (!perToken && !giaRiprovato && (j.code === 1010 || j.code === 1011)) { CacheService.getScriptCache().remove('tuya_token'); return tuyaChiama(metodo, percorso, query, corpo, false, true); }
    throw new Error(tuyaErrore(j));
  }
  return j.result;
}

// specifiche di un dispositivo (funzioni e intervalli dei valori), tenute in cache 6 ore
function tuyaSpec(id) {
  var cache = CacheService.getScriptCache(), k = 'tuya_spec_' + id, v = cache.get(k);
  if (v) return JSON.parse(v);
  var r = {};
  try { r = tuyaChiama('GET', '/v1.0/iot-03/devices/' + id + '/specification') || {}; } catch (e) { r = {}; }
  var fun = {};
  (r.functions || []).concat(r.status || []).forEach(function (f) {
    if (fun[f.code]) return;
    var val = {}; try { val = typeof f.values === 'string' ? JSON.parse(f.values) : (f.values || {}); } catch (e) { val = {}; }
    fun[f.code] = { tipo: f.type, valori: val };
  });
  cache.put(k, JSON.stringify(fun), 21600);
  return fun;
}
function tuyaPrimo(spec, stato, codici) { for (var i = 0; i < codici.length; i++) if (spec[codici[i]] || (stato && codici[i] in stato)) return codici[i]; return ''; }
function tuyaIntervallo(spec, codice, min, max) { var v = (spec[codice] || {}).valori || {}; return { min: v.min != null ? +v.min : min, max: v.max != null ? +v.max : max }; }
function tuyaPct(v, r) { return Math.max(0, Math.min(100, Math.round((+v - r.min) * 100 / ((r.max - r.min) || 1)))); }
function tuyaDaPct(p, r) { return Math.round(r.min + (Math.max(0, Math.min(100, +p)) / 100) * (r.max - r.min)); }

// trasforma stato e specifiche Tuya in una luce semplice per l'app (percentuali)
function tuyaLuce(dev, statoLista) {
  var stato = {};
  (statoLista || dev.status || []).forEach(function (x) { stato[x.code] = x.value; });
  var spec = tuyaSpec(dev.id);
  var sw = tuyaPrimo(spec, stato, ['switch_led', 'switch_1', 'switch']);
  var br = tuyaPrimo(spec, stato, ['bright_value_v2', 'bright_value', 'bright_value_1']);
  var tp = tuyaPrimo(spec, stato, ['temp_value_v2', 'temp_value']);
  var co = tuyaPrimo(spec, stato, ['colour_data_v2', 'colour_data']);
  var rBr = tuyaIntervallo(spec, br, br === 'bright_value' ? 25 : 10, br === 'bright_value' ? 255 : 1000);
  var rTp = tuyaIntervallo(spec, tp, 0, tp === 'temp_value' ? 255 : 1000);
  var maxCol = co === 'colour_data' ? 255 : 1000, col = null;
  if (co && stato[co]) { try { col = typeof stato[co] === 'string' ? JSON.parse(stato[co]) : stato[co]; } catch (e) { col = null; } }
  var modo = stato.work_mode || 'white';
  var luce = {
    id: dev.id, nome: dev.name || 'Luce', categoria: dev.category || '', online: dev.online !== false,
    acceso: sw ? !!stato[sw] : null, modo: modo,
    ha: { interruttore: !!sw, luminosita: !!br, temperatura: !!tp, colore: !!co },
    luminosita: br && stato[br] != null ? tuyaPct(stato[br], rBr) : null,
    temperatura: tp && stato[tp] != null ? tuyaPct(stato[tp], rTp) : null,
    colore: col ? { h: +col.h || 0, s: Math.round((+col.s || 0) * 100 / maxCol), v: Math.round((+col.v || 0) * 100 / maxCol) } : null,
    uid: dev.uid || ''
  };
  if (modo === 'colour' && luce.colore) luce.luminosita = luce.colore.v;
  return luce;
}

function tuyaDispositivi() {
  var out = [], chiave = '', giri = 0;
  do {
    var r = tuyaChiama('GET', '/v1.0/iot-01/associated-users/devices', { last_row_key: chiave, size: 100 }) || {};
    out = out.concat(r.devices || r.list || []);
    chiave = r.last_row_key || '';
    if (!r.has_more) break;
  } while (chiave && ++giri < 10);
  return out;
}
function eLuce(dev) {
  if (TUYA_CATEGORIE_LUCI.indexOf(dev.category) >= 0) return true;
  return (dev.status || []).some(function (x) { return /^(switch_led|bright_value|colour_data)/.test(x.code); });
}

function tuyaScene(uid) {
  var scene = [];
  if (!uid) return scene;
  var case_ = [];
  try { case_ = tuyaChiama('GET', '/v1.0/users/' + uid + '/homes') || []; } catch (e) { return scene; }
  case_.forEach(function (h) {
    var idCasa = h.home_id || h.id;
    var l = [];
    try { l = tuyaChiama('GET', '/v1.1/homes/' + idCasa + '/scenes') || []; } catch (e) { l = []; }
    l.forEach(function (sc) { scene.push({ id: sc.scene_id || sc.id, nome: sc.name || 'Scena', casa: String(idCasa), nomeCasa: h.name || '' }); });
  });
  return scene;
}

function luciElenco() {
  if (!tuyaConfigurato()) return { ok: true, configurato: false, regione: tuyaConf().regione };
  var dev = tuyaDispositivi();
  var luci = dev.filter(eLuce).map(function (d) { return tuyaLuce(d); });
  var uid = (dev[0] || {}).uid || '';
  return { ok: true, configurato: true, regione: tuyaConf().regione, luci: luci, altri: dev.length - luci.length, scene: tuyaScene(uid) };
}

function luceStato(id) {
  var info = tuyaChiama('GET', '/v1.0/iot-03/devices/' + id) || { id: id };
  var st = tuyaChiama('GET', '/v1.0/iot-03/devices/' + id + '/status') || [];
  return tuyaLuce({ id: id, name: info.name, category: info.category, online: info.online, uid: info.uid }, st);
}

// req: { id, acceso?, luminosita? (0-100), temperatura? (0-100), colore? { h 0-360, s 0-100 } }
function luceComando(req) {
  if (!req.id) throw new Error('Manca la luce');
  var attuale = luceStato(req.id), spec = tuyaSpec(req.id), cmd = [];
  var stato = {};
  var sw = tuyaPrimo(spec, null, ['switch_led', 'switch_1', 'switch']);
  var br = tuyaPrimo(spec, null, ['bright_value_v2', 'bright_value', 'bright_value_1']);
  var tp = tuyaPrimo(spec, null, ['temp_value_v2', 'temp_value']);
  var co = tuyaPrimo(spec, null, ['colour_data_v2', 'colour_data']);
  var maxCol = co === 'colour_data' ? 255 : 1000;
  if (req.acceso !== undefined && sw) cmd.push({ code: sw, value: !!req.acceso });
  if (req.colore && co) {
    var v = attuale.colore && attuale.colore.v ? attuale.colore.v : (attuale.luminosita || 100);
    if (req.luminosita != null) v = +req.luminosita;
    cmd.push({ code: 'work_mode', value: 'colour' });
    cmd.push({ code: co, value: { h: Math.round(+req.colore.h) % 361, s: Math.round(+req.colore.s * maxCol / 100), v: Math.max(Math.round(maxCol / 100), Math.round(v * maxCol / 100)) } });
    if (sw && req.acceso === undefined) cmd.push({ code: sw, value: true });
  } else {
    if (req.temperatura != null && tp) {
      if (spec.work_mode) cmd.push({ code: 'work_mode', value: 'white' });
      cmd.push({ code: tp, value: tuyaDaPct(req.temperatura, tuyaIntervallo(spec, tp, 0, tp === 'temp_value' ? 255 : 1000)) });
    }
    if (req.luminosita != null) {
      if (attuale.modo === 'colour' && co && attuale.colore && req.temperatura == null) {
        cmd.push({ code: co, value: { h: attuale.colore.h, s: Math.round(attuale.colore.s * maxCol / 100), v: Math.max(Math.round(maxCol / 100), Math.round(+req.luminosita * maxCol / 100)) } });
      } else if (br) {
        cmd.push({ code: br, value: tuyaDaPct(Math.max(1, +req.luminosita), tuyaIntervallo(spec, br, br === 'bright_value' ? 25 : 10, br === 'bright_value' ? 255 : 1000)) });
      }
    }
    if ((req.temperatura != null || req.luminosita != null) && sw && req.acceso === undefined) cmd.push({ code: sw, value: true });
  }
  if (!cmd.length) throw new Error('Questa luce non supporta il comando');
  tuyaChiama('POST', '/v1.0/iot-03/devices/' + req.id + '/commands', null, { commands: cmd });
  Utilities.sleep(700);
  var dopo; try { dopo = luceStato(req.id); } catch (e) { dopo = attuale; }
  return { ok: true, luce: dopo };
}

function scenaAvvia(req) {
  if (!req.casa || !req.scena) throw new Error('Manca la scena');
  tuyaChiama('POST', '/v1.0/homes/' + req.casa + '/scenes/' + req.scena + '/trigger', null, {});
  return { ok: true };
}

// Da eseguire a mano nell'editor: dice se le chiavi funzionano e cosa vede
function verificaTuya() {
  var c = tuyaConf();
  if (!c.id || !c.secret) { Logger.log('❌ Mancano le chiavi: aggiungi TUYA_ID e TUYA_SECRET (Access ID e Access Secret del progetto cloud) nelle proprietà script, oppure inseriscile dall\'app (💡 Luci → ⚙).'); return; }
  Logger.log('Data center: ' + c.regione + ' (' + c.base + ')');
  try { tuyaToken(true); Logger.log('✅ Chiavi valide: token ottenuto'); }
  catch (e) { Logger.log('❌ Chiavi non valide o data center sbagliato: ' + e.message); return; }
  var dev;
  try { dev = tuyaDispositivi(); }
  catch (e) { Logger.log('❌ Elenco dispositivi non disponibile: ' + e.message + '\n   Controlla: servizio "IoT Core" attivo, account Smart Life/Tuya Smart collegato (Devices → Link App Account), periodo di prova non scaduto.'); return; }
  if (!dev.length) { Logger.log('⚠ Nessun dispositivo: collega l\'account dell\'app al progetto (Devices → Link App Account → inquadra il QR con Smart Life o Tuya Smart) e controlla che il data center del progetto sia quello dell\'account.'); return; }
  var luci = dev.filter(eLuce);
  Logger.log('✅ ' + dev.length + ' dispositivi, di cui ' + luci.length + ' luci/prese:');
  luci.forEach(function (d) { var l = tuyaLuce(d); Logger.log('  💡 ' + l.nome + ' [' + l.categoria + '] ' + (l.online ? 'online' : 'OFFLINE') + ' · ' + (l.acceso ? 'accesa' : 'spenta') + (l.luminosita != null ? ' · ' + l.luminosita + '%' : '')); });
  var sc = tuyaScene((dev[0] || {}).uid);
  Logger.log(sc.length ? '✅ Scene Tap-to-Run: ' + sc.map(function (x) { return x.nome; }).join(', ') : 'ℹ Nessuna scena Tap-to-Run trovata (o non accessibile).');
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
    spesa:        { nome: 'Spesa',        plurale: 'Spesa' },
    nota:         { nome: 'Nota',         plurale: 'Note' },
    carta:        { nome: 'Carta',        plurale: 'Carte' },
    pagamento:    { nome: 'Pagamento',    plurale: 'Pagamenti' },
    scadenza:     { nome: 'Scadenza',     plurale: 'Scadenze' },
    promemoria:   { nome: 'Promemoria',   plurale: 'Promemoria' },
    viaggio:      { nome: 'Viaggio',      plurale: 'Viaggi' },
    concerto:     { nome: 'Concerto',     plurale: 'Concerti' }
  };
  var TIPI_BASE = ['appuntamento', 'pagamento', 'scadenza', 'promemoria'];

  // Unità di misura per ripetizioni e avvisi. Valori salvati come testo "N unità" (es. "2 mesi").
  var UNITA = {
    minuti:    { uno: 'minuto',    piu: 'minuti',    min: 1 },
    ore:       { uno: 'ora',       piu: 'ore',       min: 60 },
    giorni:    { uno: 'giorno',    piu: 'giorni',    min: 1440 },
    settimane: { uno: 'settimana', piu: 'settimane', min: 10080 },
    mesi:      { uno: 'mese',      piu: 'mesi',      min: 43200 },
    anni:      { uno: 'anno',      piu: 'anni',      min: 525600 }
  };
  var UNITA_RIPETI = ['giorni', 'settimane', 'mesi', 'anni'];
  var UNITA_AVVISO = ['minuti', 'ore', 'giorni', 'settimane', 'mesi', 'anni'];
  // vecchi valori (prima versione) ancora leggibili
  var RIC_VECCHIE = { settimanale: '1 settimane', quindicinale: '2 settimane', mensile: '1 mesi', bimestrale: '2 mesi', trimestrale: '3 mesi', semestrale: '6 mesi', annuale: '1 anni' };

  function leggiDurata(v) {
    if (v === undefined || v === null || v === '') return null;
    v = String(v).trim().toLowerCase();
    if (RIC_VECCHIE[v]) v = RIC_VECCHIE[v];
    var m = v.match(/^(\d+)\s*([a-z]+)$/);
    if (m && UNITA[m[2]]) return { n: +m[1], u: m[2] };
    if (/^\d+$/.test(v)) { // vecchio avviso in minuti
      var x = +v;
      var u = ['anni', 'mesi', 'settimane', 'giorni', 'ore'].filter(function (k) { return x && x % UNITA[k].min === 0; })[0] || 'minuti';
      return { n: x / UNITA[u].min, u: u };
    }
    return null;
  }
  function testoDurata(d) { return d ? d.n + ' ' + (d.n === 1 ? UNITA[d.u].uno : UNITA[d.u].piu) : ''; }
  function minutiDurata(d) { return d ? d.n * UNITA[d.u].min : 0; }
  function nomeRipeti(item) {
    var d = leggiDurata(item && item.ricorrenza);
    if (!d || d.n < 1) return 'Una volta';
    return 'Ogni ' + (d.n === 1 ? UNITA[d.u].uno : d.n + ' ' + UNITA[d.u].piu);
  }
  function volteAnno(item) {
    var d = leggiDurata(item && item.ricorrenza);
    if (!d || d.n < 1) return 0;
    return { giorni: 365, settimane: 52.18, mesi: 12, anni: 1 }[d.u] / d.n;
  }
  function anticipoMinuti(item) {
    var d = leggiDurata(item.avviso);
    if (d) return minutiDurata(d);
    return { appuntamento: 60, pagamento: 2880, scadenza: 2880, promemoria: 0, concerto: 1440, viaggio: 1440 }[item.tipo] || 0;
  }

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

  // ---------- turnario VVF (12/24 - 12/48) ----------
  // Stessa sequenza a 32 giorni di FireOps (fireops-core.js, SEQUENZA_TURNI): per ogni giorno tre fasce
  // [notte uscente 00-08, diurno 08-20, notte 20-08]; la sigla è squadra + saltoturno (es. "B6").
  // Riferimento: 26/01/2026 = inizio ciclo.
  var SEQUENZA_TURNI = ["A4", "C4", "B4", "B4", "D4", "C4", "C4", "A5", "D4", "D4", "B5", "A5", "A5", "C5", "B5", "B5", "D5", "C5", "C5", "A6", "D5", "D5", "B6", "A6", "A6", "C6", "B6", "B6", "D6", "C6", "C6", "A7", "D6", "D6", "B7", "A7", "A7", "C7", "B7", "B7", "D7", "C7", "C7", "A8", "D7", "D7", "B8", "A8", "A8", "C8", "B8", "B8", "D8", "C8", "C8", "A1", "D8", "D8", "B1", "A1", "A1", "C1", "B1", "B1", "D1", "C1", "C1", "A2", "D1", "D1", "B2", "A2", "A2", "C2", "B2", "B2", "D2", "C2", "C2", "A3", "D2", "D2", "B3", "A3", "A3", "C3", "B3", "B3", "D3", "C3", "C3", "A4", "D3", "D3", "B4", "A4"];
  var RIF_CICLO = '2026-01-26';
  // cfg = { attivo, persona, turno:'A'..'D', saltoturno:1..8 ('' = non indicato), diurno:'08:00-20:00', notte:'20:00-08:00', eccezioni:[{data, stato, nota, orario}] }
  var STATI_TURNO = {
    diurno:        { nome: 'Diurno',        breve: 'G', colore: '#C98A12', lavoro: true },
    notte:         { nome: 'Notte',         breve: 'N', colore: '#2C3E73', lavoro: true },
    smonto:        { nome: 'Smonto',        breve: 'S', colore: '#8C96A8', lavoro: false },
    riposo:        { nome: 'Riposo',        breve: 'R', colore: '#9AA59C', lavoro: false },
    salto:         { nome: 'Salto turno',   breve: 'X', colore: '#C2338F', lavoro: false },
    ferie:         { nome: 'Ferie',         breve: 'F', colore: '#4BA3C7', lavoro: false, assenza: true },
    permesso:      { nome: 'Permesso',      breve: 'P', colore: '#5B8FB9', lavoro: false, assenza: true },
    malattia:      { nome: 'Malattia',      breve: 'MAL', colore: '#B0413E', lavoro: false, assenza: true },
    recupero:      { nome: 'Recupero',      breve: 'REC', colore: '#7FA37A', lavoro: false, assenza: true },
    congedo:       { nome: 'Congedo',       breve: 'CON', colore: '#8E7CC3', lavoro: false, assenza: true },
    straordinario: { nome: 'Straordinario', breve: '+', colore: '#B5452F', lavoro: true },
    addestramento: { nome: 'Addestramento', breve: 'ADD', colore: '#5E8C31', lavoro: true },
    corso:         { nome: 'Corso',         breve: 'CRS', colore: '#7D4FA8', lavoro: true },
    presidio:      { nome: 'Presidio rurale', breve: 'PR', colore: '#9C5B2E', lavoro: true },
    boschiva:      { nome: 'Boschiva (AIB)', breve: 'AIB', colore: '#2F6B3A', lavoro: true },
    altro:         { nome: 'Altro',         breve: '•', colore: '#7A6F9B', lavoro: false }
  };
  function turniDelGiorno(s) {
    var k = ((diffGiorni(RIF_CICLO, s) % 32) + 32) % 32;
    return { uscente: SEQUENZA_TURNI[3 * k], giorno: SEQUENZA_TURNI[3 * k + 1], notte: SEQUENZA_TURNI[3 * k + 2] };
  }
  function turnoBase(cfg, s) {
    var L = String(cfg.turno || '').toUpperCase(), t = turniDelGiorno(s), salto = String(cfg.saltoturno || '');
    var mio = function (sig) { return sig.charAt(0) === L; };
    var eSalto = function (sig) { return salto && sig.slice(1) === salto; };
    // sigle in servizio nel giorno (tutti i turni), come nel turnario di FireOps
    if (mio(t.giorno)) return { stato: eSalto(t.giorno) ? 'salto' : 'diurno', sigla: t.giorno, fascia: 'diurno' };
    if (mio(t.notte)) return { stato: eSalto(t.notte) ? 'salto' : 'notte', sigla: t.notte, fascia: 'notte' };
    var ieri = turniDelGiorno(addGiorni(s, -1));
    if (mio(ieri.notte)) return { stato: eSalto(ieri.notte) ? 'riposo' : 'smonto', sigla: '' };
    return { stato: 'riposo', sigla: '' };
  }
  function servizioDel(s) { var t = turniDelGiorno(s); return t.giorno + ' / ' + t.notte.toLowerCase(); }
  function turnoDel(cfg, s) {
    if (!cfg || !cfg.attivo || !cfg.turno) return null;
    var b = turnoBase(cfg, s), out = { data: s, stato: b.stato, base: b.stato, sigla: b.sigla, fascia: b.fascia || '', nota: b.stato === 'salto' ? 'Saltoturno ' + cfg.saltoturno : '' };
    var ecc = (cfg.eccezioni || []).filter(function (e) { return e.data === s; })[0];
    if (ecc) { out.stato = ecc.stato; out.nota = ecc.nota || ''; out.modificato = true; }
    var orari = { diurno: cfg.diurno || '08:00-20:00', notte: cfg.notte || '20:00-08:00' };
    out.orario = (ecc && ecc.orario) || orari[out.stato] || '';
    return out;
  }
  function oreBrevi(o) { return String(o || '').split('-').map(function (x) { var p = x.split(':'); return +p[0] + (p[1] && p[1] !== '00' ? ':' + p[1] : ''); }).join('–'); }
  function testoTurno(t) {
    if (!t) return '';
    var st = STATI_TURNO[t.stato] || STATI_TURNO.altro;
    return st.nome + (t.orario ? ' ' + oreBrevi(t.orario) : '');
  }

  // ---------- voci (appuntamenti, pagamenti, scadenze, promemoria) ----------
  function occorrenze(item, da, a) {
    if (!item || item.eliminato || !item.data) return [];
    var d = leggiDurata(item.ricorrenza);
    var fine = item.fine || '9999-12-31';
    var out = [];
    if (!d || d.n < 1 || !(d.u in { giorni: 1, settimane: 1, mesi: 1, anni: 1 })) {
      if (item.data >= da && item.data <= a) out.push(item.data);
      return out;
    }
    var passoG = d.u === 'giorni' ? d.n : d.u === 'settimane' ? d.n * 7 : 0;
    var passoM = d.u === 'mesi' ? d.n : d.u === 'anni' ? d.n * 12 : 0;
    var s = item.data, n = 0, g0 = parse(item.data).getDate();
    if (passoG && s < da) { var salti = Math.floor(diffGiorni(s, da) / passoG); s = addGiorni(s, salti * passoG); }
    while (s <= a && s <= fine && n < 5000) {
      if (s >= da) out.push(s);
      n++;
      s = passoG ? addGiorni(s, passoG) : addMesi(item.data, passoM * n, g0);
    }
    return out;
  }
  function fatto(item, data) { return (item.fatti || []).indexOf(data) >= 0; }
  function chiudibile(item) { return item.tipo === 'pagamento' || item.tipo === 'scadenza' || item.tipo === 'promemoria'; }

  // Agenda unificata: [{data, ora, tipo, item, fatto, scaduto}] + rifiuti come tipo 'rifiuti'
  function agenda(items, cfgRifiuti, da, a, rif) {
    var r = rif || oggi(), out = [];
    (items || []).forEach(function (it) {
      if (it.tipo === 'viaggio' && !it.eliminato) {
        if (it.data >= da && it.data <= a) out.push({ data: it.data, ora: '', tipo: 'viaggio', ruolo: 'partenza', item: it, fatto: false, scaduto: false });
        if (it.fine && it.fine !== it.data && it.fine >= da && it.fine <= a) out.push({ data: it.fine, ora: '', tipo: 'viaggio', ruolo: 'rientro', item: it, fatto: false, scaduto: false });
        (it.voli || []).forEach(function (v) { if (v.data && v.data >= da && v.data <= a) out.push({ data: v.data, ora: v.ora || '', tipo: 'volo', volo: v, item: it, fatto: false, scaduto: false }); });
        (it.hotel || []).forEach(function (h) { if (h.checkin && h.checkin >= da && h.checkin <= a) out.push({ data: h.checkin, ora: h.oraCheckin || '', tipo: 'hotel', hotel: h, item: it, fatto: false, scaduto: false }); });
        return;
      }
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

  function menoMinuti(data, ora, minuti) {
    var p = parse(data);
    var t = new Date(p.getFullYear(), p.getMonth(), p.getDate(), +ora.slice(0, 2), +ora.slice(3, 5));
    t = new Date(t.getTime() - minuti * 60000);
    return iso(t) + 'T' + pad(t.getHours()) + ':' + pad(t.getMinutes());
  }

  // Promemoria da programmare (notifiche app)
  // opz = { oraRifiuti:'20:00', oraMattino:'09:00' }
  function promemoria(items, cfgRifiuti, da, a, opz) {
    opz = opz || {};
    var oraR = (cfgRifiuti && cfgRifiuti.oraAvviso) || opz.oraRifiuti || '20:00';
    var oraM = opz.oraMattino || '09:00';
    var out = [];
    function dentro(q) { var g = q.slice(0, 10); return g >= da && g <= a; }
    calendarioRifiuti(cfgRifiuti && cfgRifiuti.attivo !== false ? cfgRifiuti : null, da, addGiorni(a, 1)).forEach(function (x) {
      var sera = addGiorni(x.data, -1);
      if (sera >= da && sera <= a) out.push({ quando: sera + 'T' + oraR, titolo: 'Stasera fuori: ' + nomiFrazioni(x.frazioni), testo: 'Ritiro di ' + GIORNI_LUNGHI[giornoSett(x.data)] + (x.nota ? ' · ' + x.nota : ''), chiave: 'r' + x.data });
    });
    // le voci con avviso lungo (es. 1 anno prima) vanno cercate più avanti nel tempo
    agenda(items, null, da, addGiorni(a, 400)).forEach(function (x) {
      if (x.fatto) return;
      var it = x.item, ant = anticipoMinuti(it), d = leggiDurata(it.avviso);
      if (x.tipo === 'volo') {
        var v = x.volo, qv = menoMinuti(x.data, v.ora || '09:00', 180);
        if (dentro(qv)) out.push({ quando: qv, titolo: 'Volo ' + [v.compagnia, v.numero].filter(Boolean).join(' ') + ' alle ' + (v.ora || '?'), testo: [[v.da, v.a].filter(Boolean).join(' → '), v.pnr ? 'PNR ' + v.pnr : ''].filter(Boolean).join(' · '), chiave: 'v' + it.id + (v.id || v.data + v.ora) });
        return;
      }
      if (x.tipo === 'hotel' || (x.tipo === 'viaggio' && x.ruolo !== 'partenza')) return;
      if (x.tipo === 'viaggio') {
        var qp0 = menoMinuti(x.data, '09:00', ant);
        if (dentro(qp0)) out.push({ quando: qp0, titolo: 'Si parte: ' + it.titolo, testo: 'Controlla documenti e biglietti nella sezione Viaggi', chiave: 'vi' + it.id });
        return;
      }
      if (x.tipo === 'concerto') {
        var qc = menoMinuti(x.data, x.ora || '21:00', ant);
        if (dentro(qc)) out.push({ quando: qc, titolo: 'Concerto: ' + it.titolo, testo: etichettaGiorno(x.data) + (x.ora ? ' alle ' + x.ora : '') + (it.luogo ? ' · ' + it.luogo : ''), chiave: 'c' + it.id });
        return;
      }
      var dett = [];
      if (it.importo) dett.push(euro(it.importo));
      if (it.targa) dett.push(it.targa);
      if (x.tipo === 'appuntamento') {
        var q = menoMinuti(x.data, x.ora || oraM, ant);
        if (dentro(q)) out.push({ quando: q, titolo: it.titolo, testo: (x.ora ? 'Alle ' + x.ora : etichettaGiorno(x.data)) + (it.note ? ' · ' + it.note : ''), chiave: 'a' + it.id + x.data });
        return;
      }
      var base = x.ora || oraM;
      if (ant > 0) {
        var qp = menoMinuti(x.data, base, ant);
        if (dentro(qp)) out.push({ quando: qp, titolo: it.titolo + ' tra ' + (d ? testoDurata(d) : '2 giorni'), testo: [TIPI[x.tipo].nome].concat(dett).join(' · '), chiave: 'p' + it.id + x.data + 'pre' });
      }
      var q0 = x.data + 'T' + base;
      if (dentro(q0)) out.push({ quando: q0, titolo: it.titolo + (x.tipo === 'promemoria' ? '' : ' scade oggi'), testo: [TIPI[x.tipo].nome].concat(dett).join(' · '), chiave: 'p' + it.id + x.data });
    });
    // promemoria individuali: ogni nota con un momento preciso diventa un avviso
    items.forEach(function (it) {
      if (it.eliminato || !it.annotazioni) return;
      it.annotazioni.forEach(function (nota, i) {
        if (!nota.testo || !nota.quando) return;
        var g = nota.quando.slice(0, 10);
        if (g >= da && g <= a) out.push({ quando: nota.quando, titolo: it.titolo, testo: nota.testo, chiave: 'n' + it.id + i + nota.quando });
      });
    });
    out.sort(function (p, q) { return p.quando < q.quando ? -1 : 1; });
    return out;
  }

  function hashInt(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h) % 2000000000 + 1; }
  function nuovoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function euro(n) { return '€ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  // opzioni di un menu a tendina: la lista, il valore salvato (anche se personalizzato) e la voce «Personalizzato»
  function opzioni(lista, selezionato, vuota) {
    var l = (lista || []).slice(), h = vuota != null ? '<option value="">' + escHtml(vuota) + '</option>' : '';
    if (selezionato === '__pers__') selezionato = '';
    if (selezionato && l.indexOf(selezionato) < 0) l.push(selezionato);
    h += l.map(function (x) { return '<option value="' + escHtml(x) + '"' + (x === selezionato ? ' selected' : '') + '>' + escHtml(x) + '</option>'; }).join('');
    return h + '<option value="__pers__">Personalizzato</option>';
  }
  function escHtml(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  return {
    opzioni: opzioni,
    GIORNI: GIORNI, GIORNI_LUNGHI: GIORNI_LUNGHI, MESI: MESI, FRAZIONI: FRAZIONI, TIPI: TIPI, TIPI_BASE: TIPI_BASE, UNITA: UNITA, UNITA_RIPETI: UNITA_RIPETI, UNITA_AVVISO: UNITA_AVVISO,
    STATI_TURNO: STATI_TURNO, turnoDel: turnoDel, testoTurno: testoTurno, turniDelGiorno: turniDelGiorno, servizioDel: servizioDel,
    leggiDurata: leggiDurata, testoDurata: testoDurata, nomeRipeti: nomeRipeti, volteAnno: volteAnno, anticipoMinuti: anticipoMinuti,
    iso: iso, parse: parse, oggi: oggi, addGiorni: addGiorni, addMesi: addMesi, diffGiorni: diffGiorni,
    giornoSett: giornoSett, settimanaDelMese: settimanaDelMese, etichettaGiorno: etichettaGiorno, dataBreve: dataBreve,
    pasqua: pasqua, eFestivo: eFestivo, senzaRaccolta: senzaRaccolta, FESTIVI_ALEA: FESTIVI_ALEA, ritiri: ritiri, calendarioRifiuti: calendarioRifiuti,
    occorrenze: occorrenze, fatto: fatto, chiudibile: chiudibile, agenda: agenda, arretrati: arretrati,
    promemoria: promemoria, nomiFrazioni: nomiFrazioni, hashInt: hashInt, nuovoId: nuovoId, euro: euro, pad: pad
  };
})();
if (typeof module !== 'undefined') module.exports = Casa;
