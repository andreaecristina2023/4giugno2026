/* A&C — album foto. Le foto stanno su Google Drive (cartella "A&C Album") tramite lo script;
   qui teniamo una copia delle miniature sul telefono per vederle anche senza rete. */
var Album = (function () {
  'use strict';
  var C = Casa;
  var ui = null; // { esc, toast, foglio, ridisegna }
  var foto = [];          // elenco dal foglio
  var mini = {};          // id → objectURL miniatura
  var stato = { carico: false, errore: '', caricamenti: 0, totale: 0 };
  var LISTA = 'aec.album.lista';

  // ---------- cache IndexedDB ----------
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('no idb'));
      var r = indexedDB.open('aec-album', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('mini'); r.result.createObjectStore('grande'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
    return dbP;
  }
  function leggiCache(store, id) {
    return db().then(function (d) {
      return new Promise(function (ok) { var q = d.transaction(store).objectStore(store).get(id); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; });
    }).catch(function () { return null; });
  }
  function scriviCache(store, id, blob) {
    return db().then(function (d) {
      return new Promise(function (ok) { var t = d.transaction(store, 'readwrite'); t.objectStore(store).put(blob, id); t.oncomplete = ok; t.onerror = ok; });
    }).catch(function () {});
  }
  function b64aBlob(b64) {
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: 'image/jpeg' });
  }

  // ---------- caricamento elenco e miniature ----------
  try { foto = JSON.parse(localStorage.getItem(LISTA) || '[]'); } catch (e) { foto = []; }

  function aggiorna() {
    if (!Store.configurato()) { stato.errore = ''; return Promise.resolve(); }
    stato.carico = true;
    return Store.chiama('foto_lista').then(function (r) {
      foto = (r.foto || []).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : b.aggiornato - a.aggiornato; });
      try { localStorage.setItem(LISTA, JSON.stringify(foto)); } catch (e) { /* pieno */ }
      stato.errore = '';
      return caricaMini();
    }).catch(function (e) { stato.errore = e.message === 'Failed to fetch' ? 'Senza rete: vedi le foto già scaricate.' : e.message; })
      .then(function () { stato.carico = false; ui.ridisegna(); });
  }

  function caricaMini() {
    var mancanti = [];
    return Promise.all(foto.map(function (f) {
      if (mini[f.id]) return null;
      return leggiCache('mini', f.id).then(function (b) { if (b) mini[f.id] = URL.createObjectURL(b); else mancanti.push(f.id); });
    })).then(function () {
      if (mancanti.length) ui.ridisegna();
      var lotti = [];
      for (var i = 0; i < mancanti.length; i += 20) lotti.push(mancanti.slice(i, i + 20));
      return lotti.reduce(function (p, lotto) {
        return p.then(function () {
          return Store.chiama('foto_mini', { ids: lotto }).then(function (r) {
            Object.keys(r.mini || {}).forEach(function (id) { var b = b64aBlob(r.mini[id]); scriviCache('mini', id, b); mini[id] = URL.createObjectURL(b); });
            ui.ridisegna();
          });
        });
      }, Promise.resolve());
    });
  }

  // ---------- ridimensionamento sul telefono ----------
  function caricaImmagine(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (ok, ko) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { ok(im); }; im.onerror = ko; im.src = u; });
  }
  function riduci(img, lato, qualita) {
    var w = img.width, h = img.height, k = Math.min(1, lato / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL('image/jpeg', qualita).split(',')[1], w: c.width, h: c.height };
  }

  function carica(files) {
    files = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name); });
    if (!files.length) return;
    if (!Store.configurato()) { ui.toast('Per l\'album serve il collegamento al foglio (sezione Altro)'); return; }
    stato.totale += files.length;
    ui.ridisegna();
    return files.reduce(function (p, file) {
      return p.then(function () {
        return caricaImmagine(file).then(function (img) {
          var g = riduci(img, 2048, 0.82), m = riduci(img, 420, 0.72);
          var data = C.iso(new Date(file.lastModified || Date.now()));
          return Store.chiama('foto_carica', { dati: g.b64, mini: m.b64, data: data, larghezza: g.w, altezza: g.h, didascalia: '' }).then(function (r) {
            var bm = b64aBlob(m.b64);
            scriviCache('mini', r.foto.id, bm); scriviCache('grande', r.foto.id, b64aBlob(g.b64));
            mini[r.foto.id] = URL.createObjectURL(bm);
            foto.unshift(r.foto);
            foto.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
            try { localStorage.setItem(LISTA, JSON.stringify(foto)); } catch (e) { /* pieno */ }
          });
        }).catch(function (e) { ui.toast('Foto non caricata: ' + (e && e.message === 'Failed to fetch' ? 'nessuna connessione' : (e && e.message) || file.name)); })
          .then(function () { stato.caricamenti++; ui.ridisegna(); });
      });
    }, Promise.resolve()).then(function () {
      ui.toast(stato.caricamenti === 1 ? 'Foto caricata' : stato.caricamenti + ' foto caricate');
      stato.caricamenti = 0; stato.totale = 0; ui.ridisegna();
    });
  }

  // ---------- vista ----------
  function html() {
    var esc = ui.esc;
    var h = '';
    if (!Store.configurato()) return h + '<div class="vuoto">L\'album usa il Google Drive del foglio di casa: collega prima il foglio in <a href="#altro">Altro</a>.</div>';
    h += '<div class="azioni" style="margin-bottom:6px"><label class="btn">Aggiungi foto<input type="file" accept="image/*" multiple data-album="file" class="sr"></label></div>';
    if (stato.totale) h += '<p class="testo-muto">Caricamento ' + Math.min(stato.caricamenti + 1, stato.totale) + ' di ' + stato.totale + '…</p>';
    if (stato.errore) h += '<p class="testo-muto" style="color:var(--sangiovese)">' + esc(stato.errore) + '</p>';
    if (!foto.length) return h + (stato.carico ? '<p class="testo-muto">Carico l\'album…</p>' : '<div class="vuoto">Nessuna foto ancora. Le foto restano nel vostro Google Drive, nella cartella "A&amp;C Album".</div>');
    var gruppi = {}, ordine = [];
    foto.forEach(function (f) { var k = (f.data || '').slice(0, 7); if (!gruppi[k]) { gruppi[k] = []; ordine.push(k); } gruppi[k].push(f); });
    ordine.forEach(function (k) {
      var m = +k.slice(5, 7) - 1;
      h += '<h2>' + (C.MESI[m] ? C.MESI[m].charAt(0).toUpperCase() + C.MESI[m].slice(1) + ' ' + k.slice(0, 4) : 'Senza data') + ' <small>' + gruppi[k].length + '</small></h2><div class="galleria">';
      gruppi[k].forEach(function (f) {
        h += '<button type="button" class="scatto" data-foto="' + esc(f.id) + '" aria-label="' + esc(f.didascalia || 'Foto del ' + f.data) + '">' +
          (mini[f.id] ? '<img src="' + mini[f.id] + '" alt="" loading="lazy">' : '<span class="segnaposto"></span>') + '</button>';
      });
      h += '</div>';
    });
    return h;
  }

  function apri(id) {
    var i = foto.findIndex(function (f) { return f.id === id; }); if (i < 0) return;
    var f = foto[i], esc = ui.esc, fg = ui.foglio;
    fg.classList.add('visore');
    fg.innerHTML = '<div class="visore-corpo"><div class="visore-barra"><button class="btn icona chiaro" type="button" data-v="chiudi" aria-label="Chiudi">✕</button>' +
      '<span>' + esc(C.etichettaGiorno(f.data)) + (f.caricataDa ? ' · ' + esc(f.caricataDa) : '') + '</span>' +
      '<button class="btn icona chiaro" type="button" data-v="elimina" aria-label="Elimina foto">🗑</button></div>' +
      '<div class="visore-img">' + (mini[id] ? '<img src="' + mini[id] + '" alt="" id="img-visore">' : '<img alt="" id="img-visore">') +
      (i > 0 ? '<button class="freccia sx" type="button" data-v="prec" aria-label="Foto precedente">‹</button>' : '') +
      (i < foto.length - 1 ? '<button class="freccia dx" type="button" data-v="succ" aria-label="Foto successiva">›</button>' : '') + '</div>' +
      '<form class="visore-didascalia" data-v="form"><input type="text" name="didascalia" maxlength="300" placeholder="Aggiungi una didascalia" value="' + esc(f.didascalia || '') + '"><button class="btn piccolo" type="submit">Salva</button></form></div>';
    if (!fg.open) fg.showModal();
    // foto grande: dalla cache o dallo script
    leggiCache('grande', id).then(function (b) {
      if (b) return b;
      return Store.chiama('foto_grande', { id: id }).then(function (r) { if (!r.grande) return null; var bl = b64aBlob(r.grande); scriviCache('grande', id, bl); return bl; });
    }).then(function (b) { var im = document.getElementById('img-visore'); if (b && im && fg.open) im.src = URL.createObjectURL(b); }).catch(function () {});
    fg.onclick = function (e) {
      var t = e.target.closest('[data-v]'); if (!t) return;
      var v = t.dataset.v;
      if (v === 'chiudi') chiudi();
      else if (v === 'prec') apri(foto[i - 1].id);
      else if (v === 'succ') apri(foto[i + 1].id);
      else if (v === 'elimina') {
        if (!window.confirm('Eliminare questa foto? Finisce nel cestino di Google Drive.')) return;
        Store.chiama('foto_elimina', { id: id }).then(function () {
          foto = foto.filter(function (x) { return x.id !== id; });
          try { localStorage.setItem(LISTA, JSON.stringify(foto)); } catch (e) { /* pieno */ }
          chiudi(); ui.toast('Foto eliminata');
        }).catch(function (e) { ui.toast('Non eliminata: ' + e.message); });
      }
    };
    fg.querySelector('form').onsubmit = function (e) {
      e.preventDefault();
      var d = e.target.didascalia.value.trim();
      Store.chiama('foto_modifica', { id: id, didascalia: d }).then(function () { f.didascalia = d; try { localStorage.setItem(LISTA, JSON.stringify(foto)); } catch (x) { /* pieno */ } ui.toast('Didascalia salvata'); })
        .catch(function (x) { ui.toast('Non salvata: ' + x.message); });
    };
    // scorrimento con il dito
    var x0 = null, box = fg.querySelector('.visore-img');
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx > 60 && i > 0) apri(foto[i - 1].id); else if (dx < -60 && i < foto.length - 1) apri(foto[i + 1].id);
    }, { passive: true });
  }
  function chiudi() { var fg = ui.foglio; fg.close(); fg.classList.remove('visore'); fg.onclick = null; ui.ridisegna(); }

  return {
    init: function (u) { ui = u; ui.foglio.addEventListener('close', function () { ui.foglio.classList.remove('visore'); }); },
    html: html, aggiorna: aggiorna, carica: carica, apri: apri,
    numero: function () { return foto.length; }
  };
})();
