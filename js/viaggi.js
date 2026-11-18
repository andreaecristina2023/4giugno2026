/* A&C — sezioni Viaggi e Concerti, con allegati (biglietti, eVisa, conferme) salvati su Google Drive
   tramite lo script e tenuti anche sul telefono per vederli senza rete. */
var Viaggi = (function () {
  'use strict';
  var C = Casa;
  var ui = null; // { esc, toast, foglio, ridisegna, colore }
  var MAX_MB = 15;

  // ---------- cache allegati (IndexedDB) ----------
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('no idb'));
      var r = indexedDB.open('aec-allegati', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('file'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
    return dbP;
  }
  function leggiCache(id) {
    return db().then(function (d) { return new Promise(function (ok) { var q = d.transaction('file').objectStore('file').get(id); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; });
  }
  function scriviCache(id, blob) {
    return db().then(function (d) { return new Promise(function (ok) { var t = d.transaction('file', 'readwrite'); t.objectStore('file').put(blob, id); t.oncomplete = ok; t.onerror = ok; }); }).catch(function () {});
  }
  function b64aBlob(b64, mime) {
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'application/octet-stream' });
  }
  function fileAB64(file) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = function () { ko(r.error); }; r.readAsDataURL(file); });
  }
  function peso(n) { n = +n || 0; return n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  // ---------- allegati: elenco, caricamento, apertura ----------
  // ctx = "id voce|sezione|id sottovoce" (sezione '' = allegati della voce stessa, es. biglietti del concerto)
  function trovaLista(item, ctx, crea) {
    var p = ctx.split('|'), sez = p[1], sub = p[2];
    if (!sez) { if (!item.biglietti && crea) item.biglietti = []; return item.biglietti || []; }
    var s = (item[sez] || []).filter(function (x) { return x.id === sub; })[0];
    if (!s) return [];
    if (!s.allegati && crea) s.allegati = [];
    return s.allegati || [];
  }
  function htmlAllegati(lista, ctx, etichetta) {
    var esc = ui.esc;
    return '<div class="allegati">' + (lista || []).map(function (a) {
      var icona = /^image\//.test(a.mime) ? '🖼' : /pdf/.test(a.mime) ? '📄' : '📎';
      return '<span class="allegato"><button type="button" data-apri-allegato="' + esc(a.id) + '" data-nome="' + esc(a.nome) + '" data-mime="' + esc(a.mime || '') + '">' + icona + ' ' + esc(a.nome) + ' <small>' + peso(a.dimensione) + '</small></button>' +
        '<button type="button" class="togli" data-togli-allegato="' + esc(ctx) + '|' + esc(a.id) + '" aria-label="Togli ' + esc(a.nome) + '">✕</button></span>';
    }).join('') +
      '<label class="allega">+ ' + esc(etichetta || 'Allega') + '<input type="file" accept="image/*,application/pdf" multiple data-allega="' + esc(ctx) + '" class="sr"></label></div>';
  }
  // carica i file e li aggiunge alla lista; item già in memoria (non ancora salvato se 'salva' è false)
  function allega(item, ctx, files, salva) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve();
    if (!Store.configurato()) { ui.toast('Per gli allegati serve il collegamento al foglio (Altro)'); return Promise.resolve(); }
    var troppo = files.filter(function (f) { return f.size > MAX_MB * 1048576; });
    if (troppo.length) { ui.toast('File troppo grande (massimo ' + MAX_MB + ' MB): ' + troppo[0].name); files = files.filter(function (f) { return troppo.indexOf(f) < 0; }); }
    ui.toast('Carico ' + (files.length === 1 ? 'l\'allegato' : files.length + ' allegati') + '…');
    return files.reduce(function (p, f) {
      return p.then(function () {
        return fileAB64(f).then(function (b64) {
          return Store.chiama('allegato_carica', { nome: f.name, mime: f.type || 'application/octet-stream', dati: b64 });
        }).then(function (r) {
          scriviCache(r.allegato.id, f);
          trovaLista(item, ctx, true).push(r.allegato);
        });
      });
    }, Promise.resolve()).then(function () {
      if (salva) Store.upsert(item);
      ui.toast('Allegato salvato');
    }).catch(function (e) {
      ui.toast('Allegato non caricato: ' + (e.message === 'Failed to fetch' ? 'nessuna connessione' : e.message));
    });
  }
  function togli(item, ctx, id, salva) {
    var lista = trovaLista(item, ctx, false), i = lista.findIndex(function (a) { return a.id === id; });
    if (i < 0) return;
    lista.splice(i, 1);
    if (salva) Store.upsert(item);
    Store.chiama('allegato_elimina', { id: id }).catch(function () {});
  }
  function blobAllegato(id, mime) {
    return leggiCache(id).then(function (b) {
      if (b) return b;
      return Store.chiama('allegato_scarica', { id: id }).then(function (r) { var bl = b64aBlob(r.dati, r.mime || mime); scriviCache(id, bl); return bl; });
    });
  }

  // visualizzatore a schermo intero: immagini e PDF (con pdf.js, anche offline)
  var pdfjs = null;
  function caricaPdfjs() {
    if (pdfjs) return pdfjs;
    var base = new URL('js/vendor/pdfjs/', location.href).href;
    pdfjs = import(base + 'pdf.min.mjs').then(function (m) { m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'; return m; });
    return pdfjs;
  }
  function apriAllegato(id, nome, mime) {
    var esc = ui.esc, fg = ui.foglio;
    fg.classList.add('visore');
    fg.innerHTML = '<div class="visore-corpo"><div class="visore-barra"><button class="btn icona chiaro" type="button" data-chiudi-allegato aria-label="Chiudi">✕</button>' +
      '<span class="titolo-allegato">' + esc(nome) + '</span><a class="btn icona chiaro" id="scarica-allegato" aria-label="Scarica" download="' + esc(nome) + '" style="visibility:hidden">⤓</a></div>' +
      '<div class="visore-doc" id="doc-allegato"><p class="testo-muto" style="color:#cfd6cc">Apro ' + esc(nome) + '…</p></div></div>';
    if (!fg.open) fg.showModal();
    fg.querySelector('[data-chiudi-allegato]').onclick = function () { fg.close(); fg.classList.remove('visore'); };
    var box = fg.querySelector('#doc-allegato');
    blobAllegato(id, mime).then(function (b) {
      if (!fg.open) return;
      var url = URL.createObjectURL(b), tipo = b.type || mime || '';
      var dl = fg.querySelector('#scarica-allegato'); if (dl && !(window.Native && Native.isApp)) { dl.href = url; dl.style.visibility = 'visible'; }
      if (/^image\//.test(tipo)) { box.innerHTML = '<img src="' + url + '" alt="' + esc(nome) + '">'; return; }
      if (/pdf/.test(tipo) || /\.pdf$/i.test(nome)) {
        return caricaPdfjs().then(function (lib) { return b.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); }).then(function (doc) {
          box.innerHTML = '';
          var largo = Math.min(1600, (box.clientWidth || 360) * (window.devicePixelRatio || 1));
          var catena = Promise.resolve();
          for (var n = 1; n <= Math.min(doc.numPages, 20); n++) (function (n) {
            catena = catena.then(function () { return doc.getPage(n); }).then(function (pag) {
              var v1 = pag.getViewport({ scale: 1 }), vp = pag.getViewport({ scale: largo / v1.width });
              var cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; box.appendChild(cv);
              return pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
            });
          })(n);
          return catena;
        });
      }
      box.innerHTML = '<p style="color:#cfd6cc">Questo tipo di file non si può mostrare qui.</p>';
    }).catch(function (e) {
      box.innerHTML = '<p style="color:#f0b4b4">Non riesco ad aprire l\'allegato: ' + esc(e.message === 'Failed to fetch' ? 'serve la connessione la prima volta' : e.message) + '</p>';
    });
  }

  // ---------- utilità date ----------
  function intervallo(da, a) {
    if (!da) return '';
    if (!a || a === da) return C.dataBreve(da);
    return C.dataBreve(da) + ' – ' + C.dataBreve(a) + ' ' + a.slice(0, 4);
  }
  function quanto(da, a) {
    var oggi = C.oggi();
    if (a && oggi > a) return { testo: 'Concluso', classe: 'passato' };
    if (da <= oggi) return { testo: 'In corso', classe: 'ora' };
    var n = C.diffGiorni(oggi, da);
    return { testo: n === 1 ? 'Domani' : 'Tra ' + n + ' giorni', classe: 'futuro' };
  }
  function viaggi() { return Store.lista().filter(function (v) { return v.tipo === 'viaggio'; }); }
  function concerti() { return Store.lista().filter(function (v) { return v.tipo === 'concerto'; }); }

  // documenti in scadenza: passaporto valido almeno 6 mesi dopo il rientro, gli altri almeno fino al rientro
  function avvisoDocumento(v, d) {
    if (!d.scadenza) return '';
    var fine = v.fine || v.data;
    if (d.scadenza < fine) return 'Scade prima del rientro';
    if (d.tipo === 'Passaporto' && d.scadenza < C.addMesi(fine, 6)) return 'Meno di 6 mesi di validità dopo il rientro';
    return '';
  }

  // ---------- VIAGGI: elenco ----------
  function htmlElenco() {
    var esc = ui.esc, oggi = C.oggi(), tutti = viaggi();
    var inCorso = tutti.filter(function (v) { return v.data <= oggi && (v.fine || v.data) >= oggi; });
    var futuri = tutti.filter(function (v) { return v.data > oggi; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    var passati = tutti.filter(function (v) { return (v.fine || v.data) < oggi; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    function card(v) {
      var q = quanto(v.data, v.fine), avvisi = (v.documenti || []).filter(function (d) { return avvisoDocumento(v, d); }).length;
      var conta = [(v.voli || []).length + ' vol' + ((v.voli || []).length === 1 ? 'o' : 'i'), (v.hotel || []).length + ' hotel', (v.documenti || []).length + ' document' + ((v.documenti || []).length === 1 ? 'o' : 'i')];
      return '<a class="card-viaggio" href="#viaggio/' + encodeURIComponent(v.id) + '"><span class="cv-alto"><span class="cv-titolo">' + esc(v.titolo) + '</span><span class="cv-quando ' + q.classe + '">' + q.testo + '</span></span>' +
        '<span class="cv-date">' + esc(intervallo(v.data, v.fine)) + (v.fine && v.fine !== v.data ? ' · ' + (C.diffGiorni(v.data, v.fine) + 1) + ' giorni' : '') + '</span>' +
        '<span class="cv-conta">' + conta.join(' · ') + (avvisi ? ' · <b class="cv-avviso">⚠ ' + avvisi + ' documento da controllare</b>' : '') + '</span></a>';
    }
    var h = '';
    if (!tutti.length) return '<div class="vuoto">Nessun viaggio salvato. Aggiungi il primo: poi dentro metti voli, hotel e documenti (eVisa, passaporto) con i file allegati.<br><button class="btn piccolo" type="button" data-nuovo-viaggio>Nuovo viaggio</button></div>';
    if (inCorso.length) h += '<h2>In corso</h2>' + inCorso.map(card).join('');
    if (futuri.length) h += '<h2>In programma</h2>' + futuri.map(card).join('');
    if (passati.length) h += '<details class="passati"><summary><h2>Passati <small>' + passati.length + '</small></h2></summary>' + passati.map(card).join('') + '</details>';
    return h;
  }

  // ---------- VIAGGI: dettaglio ----------
  var SEZIONI = {
    voli: { titolo: 'Voli', uno: 'volo', campi: [
      ['data', 'Data', 'date', true], ['ora', 'Partenza', 'time'], ['arrivo', 'Arrivo', 'time'],
      ['da', 'Da', 'text', 'Es. BLQ Bologna'], ['a', 'A', 'text', 'Es. NRT Tokyo'],
      ['compagnia', 'Compagnia', 'text'], ['numero', 'Numero volo', 'text', 'Es. LH291'],
      ['pnr', 'Codice prenotazione (PNR)', 'text'], ['posto', 'Posti', 'text', 'Es. 23A, 23B'], ['note', 'Note', 'textarea']] },
    hotel: { titolo: 'Hotel', uno: 'hotel', campi: [
      ['nome', 'Nome', 'text', true], ['indirizzo', 'Indirizzo', 'text'], ['checkin', 'Check-in', 'date'], ['checkout', 'Check-out', 'date'],
      ['conferma', 'Numero di conferma', 'text'], ['telefono', 'Telefono', 'tel'], ['note', 'Note', 'textarea']] },
    documenti: { titolo: 'Documenti', uno: 'documento', campi: [
      ['tipo', 'Tipo', 'select', ['eVisa', 'Passaporto', 'Carta d\'identità', 'Assicurazione viaggio', 'Patente internazionale', 'Vaccinazioni', 'ESTA / ETA', 'Altro']],
      ['persona', 'Di chi', 'persone'], ['numero', 'Numero', 'text'], ['scadenza', 'Scadenza', 'date'], ['note', 'Note', 'textarea']] }
  };
  function rigaSotto(v, sez, s) {
    var esc = ui.esc, ctx = v.id + '|' + sez + '|' + s.id, titolo = '', righe = [];
    if (sez === 'voli') {
      titolo = [s.compagnia, s.numero].filter(Boolean).join(' ') || 'Volo';
      if (s.da || s.a) titolo += ' · ' + [s.da, s.a].filter(Boolean).join(' → ');
      righe.push(C.etichettaGiorno(s.data) + (s.ora ? ', ' + s.ora : '') + (s.arrivo ? ' → ' + s.arrivo : ''));
      if (s.pnr) righe.push('PNR ' + s.pnr); if (s.posto) righe.push('Posti ' + s.posto);
    } else if (sez === 'hotel') {
      titolo = s.nome || 'Hotel';
      if (s.checkin) righe.push(intervallo(s.checkin, s.checkout) + (s.checkout && s.checkin ? ' · ' + C.diffGiorni(s.checkin, s.checkout) + ' notti' : ''));
      if (s.conferma) righe.push('Conferma ' + s.conferma);
    } else {
      titolo = (s.tipo || 'Documento') + (s.persona ? ' · ' + s.persona : '');
      if (s.numero) righe.push('N. ' + s.numero);
      if (s.scadenza) righe.push('Scade ' + C.dataBreve(s.scadenza) + ' ' + s.scadenza.slice(0, 4));
    }
    var avv = sez === 'documenti' ? avvisoDocumento(v, s) : '';
    return '<div class="sotto-card"><button type="button" class="sc-corpo" data-modifica-sotto="' + esc(sez) + '|' + esc(s.id) + '"><span class="sc-titolo">' + esc(titolo) + '</span>' +
      righe.map(function (r) { return '<span class="sc-riga">' + esc(r) + '</span>'; }).join('') +
      (avv ? '<span class="sc-avviso">⚠ ' + esc(avv) + '</span>' : '') + (s.note ? '<span class="sc-riga testo-muto">' + esc(s.note) + '</span>' : '') + '</button>' +
      (sez === 'hotel' && s.indirizzo ? '<a class="sc-mappa" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.nome + ', ' + s.indirizzo) + '" target="_blank" rel="noopener">Mappa</a>' : '') +
      htmlAllegati(s.allegati, ctx, sez === 'documenti' ? 'Allega documento' : sez === 'voli' ? 'Allega carta d\'imbarco' : 'Allega conferma') + '</div>';
  }
  function htmlDettaglio(id) {
    var esc = ui.esc, v = Store.get(id);
    if (!v || v.eliminato) return '<a class="indietro" href="#viaggi">‹ Viaggi</a><div class="vuoto">Viaggio non trovato.</div>';
    var q = quanto(v.data, v.fine);
    var h = '<a class="indietro" href="#viaggi">‹ Viaggi</a>' +
      '<header class="testa-viaggio"><h1>' + esc(v.titolo) + '</h1><p>' + esc(intervallo(v.data, v.fine)) + ' · <span class="cv-quando ' + q.classe + '">' + q.testo + '</span>' + (v.chi ? ' · ' + esc(v.chi) : '') + '</p>' +
      '<div class="azioni"><button class="btn piccolo secondario" type="button" data-modifica-viaggio="' + esc(v.id) + '">Modifica</button></div></header>';
    Object.keys(SEZIONI).forEach(function (sez) {
      var lista = (v[sez] || []).slice().sort(function (a, b) { var x = a.data || a.checkin || a.scadenza || '', y = b.data || b.checkin || b.scadenza || ''; return x < y ? -1 : 1; });
      h += '<h2>' + SEZIONI[sez].titolo + ' <small>' + lista.length + '</small></h2>' + lista.map(function (s) { return rigaSotto(v, sez, s); }).join('') +
        '<button class="btn secondario piccolo aggiungi-sotto" type="button" data-nuovo-sotto="' + sez + '">Aggiungi ' + SEZIONI[sez].uno + '</button>';
    });
    if (v.note) h += '<h2>Note</h2><div class="sezione"><p style="white-space:pre-wrap;margin:0">' + esc(v.note) + '</p></div>';
    return h;
  }

  // ---------- moduli (foglio a scorrimento) ----------
  function campoHtml(c, val) {
    var esc = ui.esc, nome = c[0], et = c[1], tipo = c[2], extra = c[3];
    if (tipo === 'textarea') return '<label class="campo">' + et + '<textarea name="' + nome + '" maxlength="2000">' + esc(val || '') + '</textarea></label>';
    if (tipo === 'select' || tipo === 'persone') {
      var op = tipo === 'persone' ? [''].concat(Store.settings().persone) : extra;
      return '<label class="campo">' + et + '<select name="' + nome + '">' + op.map(function (o) { return '<option value="' + esc(o) + '"' + (o === (val || '') ? ' selected' : '') + '>' + (o ? esc(o) : 'Tutti e due') + '</option>'; }).join('') + '</select></label>';
    }
    var num = tipo === 'number' ? ' step="0.01" min="0" inputmode="decimal"' : '';
    return '<label class="campo">' + et + '<input type="' + tipo + '" name="' + nome + '" value="' + esc(val == null ? '' : val) + '"' + num + (extra === true ? ' required' : '') + (typeof extra === 'string' ? ' placeholder="' + esc(extra) + '"' : '') + '></label>';
  }
  function modulo(titolo, campi, dati, opz) {
    var fg = ui.foglio, esc = ui.esc;
    fg.classList.remove('visore');
    var corpo = '', i = 0;
    while (i < campi.length) {
      var c = campi[i], c2 = campi[i + 1];
      var corti = function (x) { return x && (x[2] === 'date' || x[2] === 'time' || x[2] === 'number'); };
      if (corti(c) && corti(c2)) { corpo += '<div class="due">' + campoHtml(c, dati[c[0]]) + campoHtml(c2, dati[c2[0]]) + '</div>'; i += 2; }
      else { corpo += campoHtml(c, dati[c[0]]); i += 1; }
    }
    fg.innerHTML = '<form method="dialog" id="form-viaggi"><div class="maniglia"></div><h3 id="foglio-titolo">' + esc(titolo) + '</h3><div class="campi">' + corpo + (opz.extraHtml || '') +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-annulla>Annulla</button>' +
      (opz.elimina ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
    var f = fg.querySelector('form');
    f.querySelector('[data-annulla]').onclick = function () { if (opz.annulla) opz.annulla(); fg.close(); };
    if (opz.elimina) f.querySelector('[data-elimina]').onclick = function () { if (window.confirm(opz.confermaElimina || 'Eliminare?')) { opz.elimina(); fg.close(); } };
    f.onsubmit = function (e) {
      e.preventDefault();
      var out = {};
      campi.forEach(function (c) { var el = f.elements[c[0]]; if (el) out[c[0]] = el.value.trim(); });
      if (opz.valida && !opz.valida(out, f)) return;
      opz.salva(out); fg.close();
    };
    if (!fg.open) fg.showModal();
    if (opz.dopo) opz.dopo(f);
    return f;
  }

  var CAMPI_VIAGGIO = [['titolo', 'Destinazione', 'text', true], ['data', 'Partenza', 'date', true], ['fine', 'Rientro', 'date'], ['chi', 'Chi parte', 'persone'], ['note', 'Note', 'textarea']];
  function apriViaggio(id) {
    var v = id ? JSON.parse(JSON.stringify(Store.get(id))) : { tipo: 'viaggio', titolo: '', data: C.oggi(), fine: '', voli: [], hotel: [], documenti: [] };
    modulo(id ? 'Modifica viaggio' : 'Nuovo viaggio', CAMPI_VIAGGIO, v, {
      valida: function (o, f) { if (!o.titolo) { f.titolo.focus(); return false; } if (o.fine && o.fine < o.data) { ui.toast('Il rientro è prima della partenza'); return false; } return true; },
      salva: function (o) {
        Object.keys(o).forEach(function (k) { v[k] = o[k]; });
        var nuovo = !v.id; Store.upsert(v);
        ui.toast(nuovo ? 'Viaggio creato: aggiungi voli, hotel e documenti' : 'Viaggio aggiornato');
        if (nuovo) location.hash = 'viaggio/' + encodeURIComponent(v.id);
      },
      elimina: id ? function () { Store.elimina(id); location.hash = 'viaggi'; ui.toast('Viaggio eliminato'); } : null,
      confermaElimina: 'Eliminare il viaggio con voli, hotel e documenti? (gli allegati restano su Drive)'
    });
  }
  function apriSotto(idViaggio, sez, idSotto) {
    var v = JSON.parse(JSON.stringify(Store.get(idViaggio))), def = SEZIONI[sez];
    var s = idSotto ? (v[sez] || []).filter(function (x) { return x.id === idSotto; })[0] : null;
    var dati = s || (sez === 'voli' ? { data: v.data } : sez === 'hotel' ? { checkin: v.data, checkout: v.fine } : { tipo: 'eVisa' });
    modulo((s ? 'Modifica ' : 'Nuovo ') + def.uno, def.campi, dati, {
      valida: function (o, f) { var obbl = def.campi.filter(function (c) { return c[3] === true; })[0]; if (obbl && !o[obbl[0]]) { f.elements[obbl[0]].focus(); return false; } return true; },
      salva: function (o) {
        if (!v[sez]) v[sez] = [];
        if (s) { var t = v[sez].filter(function (x) { return x.id === idSotto; })[0]; Object.keys(o).forEach(function (k) { t[k] = o[k]; }); }
        else { o.id = C.nuovoId(); o.allegati = []; v[sez].push(o); }
        if (sez === 'voli') v[sez].forEach(function (x) { if (x.da) x.da = x.da.toUpperCase().slice(0, 1) + x.da.slice(1); });
        Store.upsert(v); ui.toast(s ? 'Salvato' : def.uno.charAt(0).toUpperCase() + def.uno.slice(1) + ' aggiunto: puoi allegare i file');
      },
      elimina: s ? function () {
        (s.allegati || []).forEach(function (a) { Store.chiama('allegato_elimina', { id: a.id }).catch(function () {}); });
        v[sez] = v[sez].filter(function (x) { return x.id !== idSotto; }); Store.upsert(v); ui.toast('Eliminato');
      } : null,
      confermaElimina: 'Eliminare questo ' + def.uno + ' e i suoi allegati?'
    });
  }

  // ---------- CONCERTI ----------
  var CAMPI_CONCERTO = [['titolo', 'Cantante o band', 'text', true], ['data', 'Data', 'date', true], ['ora', 'Ora', 'time'], ['luogo', 'Luogo', 'text', 'Es. Autodromo di Imola'],
    ['importo', 'Prezzo totale €', 'number'], ['chi', 'Chi va', 'persone'], ['note', 'Note', 'textarea']];
  function apriConcerto(id) {
    var c = id ? JSON.parse(JSON.stringify(Store.get(id))) : { id: C.nuovoId(), tipo: 'concerto', titolo: '', data: C.oggi(), ora: '21:00', biglietti: [] };
    var nuovi = []; // allegati caricati in questa finestra (da cancellare se si annulla un concerto nuovo)
    function disegnaBiglietti(f) {
      var box = f.querySelector('#biglietti-concerto');
      box.innerHTML = '<span class="campo" style="display:block;margin-bottom:6px">Biglietti digitali</span>' + htmlAllegati(c.biglietti, c.id + '||', 'Allega biglietti');
    }
    modulo(id ? 'Modifica concerto' : 'Nuovo concerto', CAMPI_CONCERTO, c, {
      extraHtml: '<div id="biglietti-concerto"></div>',
      dopo: function (f) {
        disegnaBiglietti(f);
        f.addEventListener('change', function (e) {
          var t = e.target; if (!t.dataset || t.dataset.allega === undefined) return;
          var prima = (c.biglietti || []).length;
          allega(c, c.id + '||', t.files, false).then(function () { nuovi = nuovi.concat((c.biglietti || []).slice(prima).map(function (a) { return a.id; })); disegnaBiglietti(f); });
          t.value = '';
        });
        f.addEventListener('click', function (e) {
          var t = e.target.closest('[data-apri-allegato],[data-togli-allegato]'); if (!t) return;
          e.preventDefault(); e.stopPropagation();
          if (t.dataset.togliAllegato) { var p = t.dataset.togliAllegato.split('|'); togli(c, c.id + '||', p[3], false); disegnaBiglietti(f); }
          else ui.toast('Salva il concerto, poi apri il biglietto dalla lista');
        });
      },
      annulla: function () { if (!id) nuovi.forEach(function (a) { Store.chiama('allegato_elimina', { id: a }).catch(function () {}); }); },
      valida: function (o, f) { if (!o.titolo) { f.titolo.focus(); return false; } return true; },
      salva: function (o) {
        Object.keys(o).forEach(function (k) { c[k] = o[k]; });
        c.importo = o.importo === '' ? '' : Math.round(parseFloat(String(o.importo).replace(',', '.')) * 100) / 100;
        Store.upsert(c); ui.toast(id ? 'Concerto aggiornato' : 'Concerto aggiunto');
      },
      elimina: id ? function () { Store.elimina(id); ui.toast('Concerto eliminato'); } : null,
      confermaElimina: 'Eliminare il concerto? (i biglietti restano su Drive)'
    });
  }
  function htmlConcerti() {
    var esc = ui.esc, oggi = C.oggi(), tutti = concerti();
    var futuri = tutti.filter(function (c) { return c.data >= oggi; }).sort(function (a, b) { return (a.data + (a.ora || '')) < (b.data + (b.ora || '')) ? -1 : 1; });
    var passati = tutti.filter(function (c) { return c.data < oggi; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    function card(c) {
      var d = C.parse(c.data), n = (c.biglietti || []).length, q = quanto(c.data, c.data);
      return '<div class="card-concerto"><button type="button" class="cc-data" data-modifica-concerto="' + esc(c.id) + '"><b>' + d.getDate() + '</b><span>' + C.MESI[d.getMonth()].slice(0, 3) + '</span><small>' + d.getFullYear() + '</small></button>' +
        '<button type="button" class="cc-corpo" data-modifica-concerto="' + esc(c.id) + '"><span class="cc-artista">' + esc(c.titolo) + '</span>' +
        '<span class="cc-meta">' + esc([C.GIORNI_LUNGHI[d.getDay()], c.ora, c.luogo].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="cc-meta">' + (c.data >= oggi ? '<span class="cv-quando ' + q.classe + '">' + (c.data === oggi ? 'Stasera' : q.testo) + '</span>' : '') + (c.importo ? ' ' + C.euro(c.importo) : '') + (c.chi ? ' · ' + esc(c.chi) : '') + '</span></button>' +
        (n ? '<button type="button" class="cc-biglietti" data-apri-allegato="' + esc(c.biglietti[0].id) + '" data-nome="' + esc(c.biglietti[0].nome) + '" data-mime="' + esc(c.biglietti[0].mime || '') + '">🎟<small>' + n + '</small></button>' : '') + '</div>' +
        (n > 1 ? '<div class="cc-altri">' + htmlAllegati(c.biglietti, c.id + '||', 'Allega').replace(/<label class="allega">[\s\S]*<\/label>/, '') + '</div>' : '');
    }
    if (!tutti.length) return '<div class="vuoto">Nessun concerto. Aggiungine uno con data, cantante e biglietti digitali (PDF o foto): li apri qui anche senza rete.<br><button class="btn piccolo" type="button" data-nuovo-concerto>Nuovo concerto</button></div>';
    var h = futuri.length ? '<h2>In arrivo</h2>' + futuri.map(card).join('') : '<p class="testo-muto">Nessun concerto in programma.</p>';
    if (passati.length) h += '<details class="passati"><summary><h2>Già visti <small>' + passati.length + '</small></h2></summary>' + passati.map(card).join('') + '</details>';
    return h;
  }

  // ---------- eventi delle pagine ----------
  function click(e) {
    var t = e.target.closest('button, a'); if (!t) return false;
    var d = t.dataset;
    if (d.apriAllegato) { apriAllegato(d.apriAllegato, d.nome, d.mime); return true; }
    if (d.togliAllegato) {
      var p = d.togliAllegato.split('|'), item = Store.get(p[0]);
      if (item && window.confirm('Togliere l\'allegato? Il file va nel cestino di Drive.')) { item = JSON.parse(JSON.stringify(item)); togli(item, p[0] + '|' + p[1] + '|' + p[2], p[3], true); }
      return true;
    }
    if (d.nuovoViaggio !== undefined) { apriViaggio(null); return true; }
    if (d.modificaViaggio) { apriViaggio(d.modificaViaggio); return true; }
    if (d.nuovoSotto) { apriSotto(idCorrente(), d.nuovoSotto, null); return true; }
    if (d.modificaSotto) { var q = d.modificaSotto.split('|'); apriSotto(idCorrente(), q[0], q[1]); return true; }
    if (d.nuovoConcerto !== undefined) { apriConcerto(null); return true; }
    if (d.modificaConcerto) { apriConcerto(d.modificaConcerto); return true; }
    return false;
  }
  function change(e) {
    var t = e.target; if (!t.dataset || t.dataset.allega === undefined || !t.files) return false;
    var ctx = t.dataset.allega, item = Store.get(ctx.split('|')[0]);
    if (item) { item = JSON.parse(JSON.stringify(item)); allega(item, ctx, t.files, true); }
    t.value = '';
    return true;
  }
  function idCorrente() { var m = location.hash.match(/^#viaggio\/(.+)$/); return m ? decodeURIComponent(m[1]) : ''; }

  // prossimi eventi per la schermata Oggi
  function prossimi() {
    var oggi = C.oggi(), out = [];
    var v = viaggi().filter(function (x) { return (x.fine || x.data) >= oggi; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; })[0];
    if (v) out.push({ tipo: 'viaggio', item: v, quando: quanto(v.data, v.fine).testo, href: '#viaggio/' + encodeURIComponent(v.id) });
    var c = concerti().filter(function (x) { return x.data >= oggi; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; })[0];
    if (c) out.push({ tipo: 'concerto', item: c, quando: c.data === oggi ? 'Stasera' : quanto(c.data, c.data).testo, href: '#concerti' });
    return out;
  }

  return {
    init: function (u) { ui = u; },
    htmlElenco: htmlElenco, htmlDettaglio: htmlDettaglio, htmlConcerti: htmlConcerti,
    apriViaggio: apriViaggio, apriConcerto: apriConcerto, apriAllegato: apriAllegato,
    click: click, change: change, prossimi: prossimi, intervallo: intervallo
  };
})();
