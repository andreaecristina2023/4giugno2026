/* Casa — interfaccia */
(function () {
  'use strict';
  var C = Casa;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var vista = $('#vista'), foglio = $('#foglio');
  var REPO = 'https://github.com/andreaecristina2023/4giugno2026';
  var COLORE_TIPO = { appuntamento: 'var(--ardesia)', pagamento: 'var(--sangiovese)', scadenza: 'var(--albana)', promemoria: 'var(--muschio)', viaggio: '#1E7F8C', volo: '#1E7F8C', hotel: '#1E7F8C', concerto: '#A3307A' };
  var COLORI_VOCE = ['#2F6DB5', '#2E8B57', '#E3B505', '#D7263D', '#8A5A2B', '#7D4FA8', '#C2338F', '#1E7F8C'];
  function colVoce(it) { return it.colore || COLORE_TIPO[it.tipo]; }
  var ZONE = {
    'centro': { nome: 'Centro', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_centro.pdf' },
    'cintura': { nome: 'Cintura urbana', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_cintura.pdf' },
    'sparse-a': { nome: 'Case sparse A', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_case-sparse-A.pdf' },
    'sparse-b': { nome: 'Case sparse B', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_case-sparse-B.pdf' }
  };
  var ui = { meseCal: C.oggi().slice(0, 7), giornoCal: C.oggi(), filtroConti: 'dapagare' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rifiuti() { return Store.settings().rifiuti; }
  function voci() { return Store.lista().filter(function (v) { return v.tipo !== 'spesa' && v.tipo !== 'nota' && v.tipo !== 'carta' && v.tipo !== 'bolletta' && v.tipo !== 'iban' && v.tipo !== 'prodotto'; }); }
  // nomi per il suggerimento della lista della spesa: catalogo + prodotti salvati dall'utente (senza doppioni)
  function nomiCatalogoSpesa() {
    var visti = {}, out = [];
    CATALOGO_SPESA.concat(Store.lista().filter(function (v) { return v.tipo === 'prodotto'; }).map(function (v) { return v.titolo; })).forEach(function (n) {
      var k = String(n || '').trim().toLowerCase();
      if (k && !visti[k]) { visti[k] = true; out.push(String(n).trim()); }
    });
    return out;
  }

  // «Personalizzato» in tutti i menu a tendina (classe sel-pers): compare un campo per scrivere il valore
  document.addEventListener('change', function (e) {
    var s = e.target;
    if (!s || s.tagName !== 'SELECT' || !s.classList.contains('sel-pers')) return;
    var campo = s.nextElementSibling && s.nextElementSibling.classList.contains('pers-testo') ? s.nextElementSibling : null;
    if (s.value === '__pers__') {
      var op = s.querySelector('option[data-pers]');
      if (!op) { op = document.createElement('option'); op.setAttribute('data-pers', ''); s.insertBefore(op, s.querySelector('option[value="__pers__"]')); }
      op.value = ''; op.textContent = 'Personalizzato'; op.selected = true;
      if (!campo) { campo = document.createElement('input'); campo.type = 'text'; campo.className = 'pers-testo'; campo.maxLength = 60; campo.placeholder = 'Scrivi il valore'; campo.setAttribute('aria-label', 'Valore personalizzato'); s.insertAdjacentElement('afterend', campo); }
      campo.focus();
    } else if (campo) campo.remove();
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('pers-testo')) return;
    var s = t.previousElementSibling;
    if (!s || s.tagName !== 'SELECT') return;
    var v = t.value.trim(), op = s.querySelector('option[data-pers]');
    if (!op) return;
    op.value = v; op.textContent = v || 'Personalizzato'; op.selected = true;
  });

  function toast(testo, azione, fn) {
    var z = $('#toast-zona');
    z.innerHTML = '<div class="toast"><span>' + esc(testo) + '</span>' + (azione ? '<button type="button">' + esc(azione) + '</button>' : '') + '</div>';
    if (azione) $('button', z).onclick = function () { fn(); z.innerHTML = ''; };
    clearTimeout(toast.t); toast.t = setTimeout(function () { z.innerHTML = ''; }, 4500);
  }

  // ---------- pezzi riutilizzabili ----------
  function bidoni(frazioni, piccoli) {
    return '<div class="bidoni' + (piccoli ? ' piccoli' : '') + '">' + frazioni.map(function (f) {
      var fr = C.FRAZIONI[f] || { nome: f, colore: '#888' };
      return '<div class="bidone" style="--c:' + fr.colore + '"><div class="corpo"></div>' + (piccoli ? '' : '<span>' + esc(fr.nome) + '</span>') + '</div>';
    }).join('') + '</div>';
  }

  // ---------- navigazione: destinazione trovata in un testo libero (note) ----------
  // coordinate (link Google Maps, decimali con almeno 4 cifre, gradi °), link di Maps senza coordinate, oppure un indirizzo "Via…"
  var RE_INDIRIZZO = /^[ \t]*(?:indirizzo\s*:\s*)?((?:via|viale|v\.le|piazza|p\.zza|piazzale|corso|c\.so|largo|vicolo|strada|località|loc\.|contrada|borgo|frazione|fraz\.)\s+[^\n]{3,})$/im;
  function destinazioneTesto(t) {
    t = String(t || '');
    var m = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || t.match(/[?&](?:q|ll|query|destination|daddr)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) || t.match(/(?:^|[^\d.])(-?\d{1,2}\.\d{4,})\s*[,;\s]\s*(-?\d{1,3}\.\d{4,})(?![\d.])/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lon: +m[2] };
    if (/°/.test(t)) { var c = Viaggi.cercaCoordinata(t); if (c) return { lat: c.lat, lon: c.lon }; }
    var link = t.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)[^\s]*/i);
    if (link) return { url: link[0] };
    var ind = t.match(RE_INDIRIZZO);
    if (ind) return { q: ind[1].trim().replace(/[.;]+$/, '') };
    return null;
  }
  function tastoNaviga(d, testo, classe, aria) {
    if (!d) return '';
    if (d.url) return '<a class="' + esc(classe || 'naviga') + '" href="' + esc(d.url) + '" target="_blank" rel="noopener" aria-label="Apri in Google Maps">' + (testo || '🧭 Naviga') + '</a>';
    return Native.linkNaviga(d, testo, classe, aria);
  }

  // numero da chiamare: solo cifre e + (es. +39 0543 460039 → +390543460039)
  function numeroChiamata(t) { return String(t || '').replace(/[^0-9+]/g, ''); }
  function rigaVoce(x) {
    var it = x.item, cls = 'riga' + (x.fatto ? ' fatta' : '') + (x.scaduto ? ' scaduta' : '');
    var meta = [];
    if (x.scaduto) meta.push('Scaduto ' + C.dataBreve(x.data));
    if (x.ora) meta.push(x.ora);
    meta.push(C.TIPI[it.tipo].nome);
    if (C.leggiDurata(it.ricorrenza)) meta.push(C.nomeRipeti(it).toLowerCase());
    if (it.targa) meta.push(it.targa);
    else if (it.categoria) meta.push(it.categoria);
    if (it.chi) meta.push(it.chi);
    var destra = '';
    if (it.importo) destra += '<span class="importo">' + C.euro(it.importo) + '</span>';
    if (C.chiudibile(it)) destra += '<button class="spunta" type="button" data-fatto="' + esc(it.id) + '" data-data="' + x.data + '" aria-pressed="' + x.fatto + '" aria-label="' + (x.fatto ? 'Segna come da fare: ' : 'Segna come fatto: ') + esc(it.titolo) + '"></button>';
    var contatti = '';
    if (it.telefono) contatti += '<a class="contatto" href="tel:' + esc(numeroChiamata(it.telefono)) + '" aria-label="Chiama ' + esc(it.telefono) + '">📞</a>';
    if (it.email) contatti += '<a class="contatto" href="mailto:' + esc(it.email) + '" aria-label="Scrivi a ' + esc(it.email) + '">✉️</a>';
    if (it.lat != null && it.lon != null) contatti += Native.linkNaviga({ lat: it.lat, lon: it.lon }, '🧭', 'contatto', 'Naviga al punto segnato');
    else if (it.indirizzo) contatti += Native.linkNaviga({ q: it.indirizzo }, '🧭', 'contatto', 'Naviga a ' + it.indirizzo);
    else contatti += tastoNaviga(destinazioneTesto(it.note), '🧭', 'contatto', 'Naviga all\'indirizzo nelle note');
    return '<li class="' + cls + '" style="--c:' + colVoce(it) + '"><span class="barra"></span>' +
      '<button class="corpo-riga" type="button" data-apri="' + esc(it.id) + '"><span class="titolo">' + esc(it.titolo) + '</span><span class="meta">' + esc(meta.join(' · ')) + '</span></button>' +
      '<span class="destra">' + contatti + destra + '</span></li>';
  }
  function rigaRifiuti(x) {
    return '<li class="riga" style="--c:' + C.FRAZIONI[x.frazioni[0]].colore + '"><span class="barra"></span>' +
      '<a class="corpo-riga" href="#rifiuti" style="text-decoration:none;color:inherit"><span class="titolo">Ritiro ' + esc(C.nomiFrazioni(x.frazioni)) + '</span><span class="meta">Fuori la sera prima' + (x.nota ? ' · ' + esc(x.nota) : '') + '</span></a>' +
      '<span class="destra">' + bidoni(x.frazioni, true) + '</span></li>';
  }
  function rigaSpeciale(x) {
    var it = x.item, titolo = '', meta = [], href = '#viaggio/' + encodeURIComponent(it.id), destra = '';
    if (x.tipo === 'viaggio') { titolo = (x.ruolo === 'rientro' ? 'Rientro: ' : 'Partenza: ') + it.titolo; meta.push(Viaggi.intervallo(it.data, it.fine)); }
    else if (x.tipo === 'volo') {
      var v = x.volo; titolo = 'Volo ' + [v.compagnia, v.numero].filter(Boolean).join(' ') + (v.da || v.a ? ' · ' + [v.da, v.a].filter(Boolean).join(' → ') : '');
      if (v.ora) meta.push(v.ora + (v.arrivo ? ' → ' + v.arrivo : '')); if (v.pnr) meta.push('PNR ' + v.pnr); meta.push(it.titolo);
    } else if (x.tipo === 'hotel') {
      titolo = 'Check-in: ' + (x.hotel.nome || 'hotel'); if (x.hotel.indirizzo) meta.push(x.hotel.indirizzo); meta.push(it.titolo);
      destra = Native.linkNaviga(x.hotel.lat != null && x.hotel.lon != null ? { lat: x.hotel.lat, lon: x.hotel.lon } : (x.hotel.indirizzo ? { q: (x.hotel.nome ? x.hotel.nome + ', ' : '') + x.hotel.indirizzo } : null), '🧭', 'contatto', 'Naviga all\'hotel');
    }
    else if (x.tipo === 'concerto') {
      titolo = it.titolo; if (x.ora) meta.push(x.ora); if (it.luogo) meta.push(it.luogo); href = '';
      if (it.luogo) destra += Native.linkNaviga({ q: it.luogo }, '🧭', 'contatto', 'Naviga a ' + it.luogo);
      var n = (it.biglietti || []).length;
      if (n) destra += '<button type="button" class="spunta biglietto" data-apri-allegato="' + esc(it.biglietti[0].id) + '" data-nome="' + esc(it.biglietti[0].nome) + '" data-mime="' + esc(it.biglietti[0].mime || '') + '" aria-label="Apri il biglietto">🎟</button>';
      meta.push('Concerto');
    }
    var corpo = '<span class="titolo">' + esc(titolo) + '</span><span class="meta">' + esc(meta.join(' · ')) + '</span>';
    return '<li class="riga" style="--c:' + (it.colore || COLORE_TIPO[x.tipo]) + '"><span class="barra"></span>' +
      (href ? '<a class="corpo-riga" href="' + href + '" style="text-decoration:none;color:inherit">' + corpo + '</a>' : '<button class="corpo-riga" type="button" data-modifica-concerto="' + esc(it.id) + '">' + corpo + '</button>') +
      '<span class="destra">' + destra + '</span></li>';
  }
  function riga(x) { return x.tipo === 'rifiuti' ? rigaRifiuti(x) : (x.tipo === 'viaggio' || x.tipo === 'volo' || x.tipo === 'hotel' || x.tipo === 'concerto') ? rigaSpeciale(x) : rigaVoce(x); }
  function elencoPerGiorno(lista, oggi) {
    var gruppi = {}, ordine = [];
    lista.forEach(function (x) { if (!gruppi[x.data]) { gruppi[x.data] = []; ordine.push(x.data); } gruppi[x.data].push(x); });
    return ordine.map(function (d) {
      return '<section class="giorno' + (d === oggi ? ' oggi' : '') + '"><h3 class="etichetta"><span>' + esc(C.etichettaGiorno(d, oggi)) + '</span></h3><ul class="righe">' +
        gruppi[d].map(riga).join('') + '</ul></section>';
    }).join('');
  }
  function testata(titolo, sotto) {
    var st = Store.stato(), s = Store.configurato() ? st.sync : 'locale';
    var lab = { ok: 'Sincronizzato', 'in corso': 'Sincronizzo…', errore: 'Non sincronizzato', locale: 'Solo su questo telefono', idle: 'Collegato' }[s] || s;
    var pend = Store.pendenti();
    if (s === 'errore' && pend) lab = pend + ' modifiche in attesa';
    return '<header class="testata"><div><h1>' + esc(titolo) + '</h1>' + (sotto ? '<div class="sotto">' + esc(sotto) + '</div>' : '') + '</div>' +
      '<span class="testata-destra"><button class="sync" type="button" data-s="' + esc(s) + '" data-azione="sync" title="' + esc(st.errore || '') + '">' + esc(lab) + '</button>' +
      (Native.isApp ? tastoModi() : '') +
      (rotta() !== 'altro' ? '<a class="ingranaggio" href="#altro" aria-label="Impostazioni"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></a>' : '') + '</span></header>';
  }

  // ---------- OGGI ----------
  function vistaOggi() {
    var oggi = C.oggi(), ora = new Date().getHours();
    var cfg = rifiuti();
    var domani = C.addGiorni(oggi, 1);
    var ritDomani = C.ritiri(cfg, domani), ritOggi = C.ritiri(cfg, oggi);
    var tOggi = C.turnoDel(turni(), oggi), sotto = C.etichettaGiorno(oggi, '1900-01-01');
    if (tOggi) {
      sotto += ' · ' + (turni().persona ? turni().persona + ': ' : '') + C.testoTurno(tOggi).toLowerCase();
      var tDom = C.turnoDel(turni(), C.addGiorni(oggi, 1));
      if (tDom && C.STATI_TURNO[tDom.stato].lavoro) sotto += ', domani ' + C.testoTurno(tDom).toLowerCase();
      sotto += ' · in servizio ' + C.servizioDel(oggi);
    }
    var h = testata('A&C', sotto);

    h += '<section class="stasera" aria-labelledby="stasera-t">';
    if (!cfg.regole.length) {
      h += '<p class="domanda" id="stasera-t">Imposta il calendario rifiuti</p><p class="dettaglio">Inserisci i giorni di ritiro della tua zona Alea e qui vedrai ogni sera quali bidoni portare fuori.</p><div class="azioni"><a class="btn" href="#rifiuti">Imposta i giorni</a></div>';
    } else if (ora < 5 && ritOggi.frazioni.length) {
      h += '<p class="domanda" id="stasera-t">Fuori adesso</p><p class="dettaglio">Ritiro entro le 4:30 di stamattina' + (ritOggi.nota ? ' · ' + esc(ritOggi.nota) : '') + '</p>' + bidoni(ritOggi.frazioni);
    } else if (ritDomani.frazioni.length) {
      h += '<p class="domanda" id="stasera-t">Stasera fuori</p><p class="dettaglio">Dalle 21:30, ritiro ' + esc(C.etichettaGiorno(domani, oggi).toLowerCase()) + ' mattina' + (ritDomani.nota ? ' · ' + esc(ritDomani.nota) : '') + '</p>' + bidoni(ritDomani.frazioni);
    } else {
      var prossimo = C.calendarioRifiuti(cfg, C.addGiorni(oggi, 2), C.addGiorni(oggi, 21))[0];
      h += '<p class="domanda" id="stasera-t">Stasera niente bidoni</p>';
      if (prossimo) h += '<div class="niente">' + bidoni(prossimo.frazioni, true) + '<p class="dettaglio">Prossima volta: ' + esc(C.etichettaGiorno(C.addGiorni(prossimo.data, -1), oggi).toLowerCase()) + ' sera, ' + esc(C.nomiFrazioni(prossimo.frazioni)) + '</p></div>';
    }
    h += '</section>';

    var pross = Viaggi.prossimi();
    if (pross.length) h += '<div class="in-arrivo">' + pross.map(function (p) {
      return '<a class="ia-card" href="' + p.href + '" style="--c:' + COLORE_TIPO[p.tipo] + '"><span class="ia-tipo">' + (p.tipo === 'viaggio' ? '✈ Prossimo viaggio' : '🎤 Prossimo concerto') + '</span><span class="ia-titolo">' + esc(p.item.titolo) + '</span><span class="ia-quando">' + esc(p.quando) + '</span></a>';
    }).join('') + '</div>';

    var arr = C.arretrati(voci(), oggi, 120);
    if (arr.length) {
      var tot = arr.reduce(function (s, x) { return s + (+x.item.importo || 0); }, 0);
      h += '<button class="avviso-scaduti" type="button" data-vai="conti" data-filtro="scaduti"><b>' + arr.length + '</b><span>' + (arr.length === 1 ? 'voce scaduta' : 'voci scadute') + ' da sistemare' + (tot ? ' · ' + C.euro(tot) : '') + '</span></button>';
    }

    var lista = C.agenda(voci(), cfg, oggi, C.addGiorni(oggi, 7), oggi).filter(function (x) { return x.tipo !== 'rifiuti' || x.data > oggi; });
    h += '<h2>Prossimi 7 giorni</h2>';
    h += lista.length ? elencoPerGiorno(lista, oggi) : '<div class="vuoto">Settimana libera: niente appuntamenti né pagamenti.<br><button class="btn piccolo" type="button" data-azione="nuovo">Aggiungi una voce</button></div>';
    vista.innerHTML = h;
  }

  // ---------- CALENDARIO ----------
  function turni() { return Store.settings().turni; }
  // sigle dei turni in servizio nel giorno (diurno sopra, notte sotto); il proprio turno sottolineato
  function servizioCella(tcfg, d) {
    if (!tcfg || !tcfg.attivo) return '';
    var sv = C.turniDelGiorno(d), L = String(tcfg.turno || '').toUpperCase();
    return '<span class="servizio"><b' + (sv.giorno.charAt(0) === L ? ' class="mio"' : '') + '>' + esc(sv.giorno) + '</b>/<i' + (sv.notte.charAt(0) === L ? ' class="mio"' : '') + '>' + esc(sv.notte.toLowerCase()) + '</i></span>';
  }
  function vistaCalendario() {
    if (ui.calModo === 'turni') return vistaTurni();
    var oggi = C.oggi(), cfg = rifiuti(), tcfg = turni();
    var m0 = C.parse(ui.meseCal + '-01');
    var primo = ui.meseCal + '-01';
    var inizio = C.addGiorni(primo, -((m0.getDay() + 6) % 7));
    var fine = C.addGiorni(inizio, 41);
    var ag = C.agenda(voci(), cfg, inizio, fine, oggi);
    var perGiorno = {};
    ag.forEach(function (x) { (perGiorno[x.data] = perGiorno[x.data] || []).push(x); });

    var h = testata('Calendario');
    h += schedeCalendario();
    h += '<div class="mese-nav"><button class="btn icona" type="button" data-mese="-1" aria-label="Mese precedente">‹</button><h2>' + C.MESI[m0.getMonth()] + ' ' + m0.getFullYear() + '</h2><button class="btn icona" type="button" data-mese="1" aria-label="Mese successivo">›</button></div>';
    h += '<div class="griglia" role="grid">' + ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (g) { return '<div class="intest">' + g + '</div>'; }).join('');
    for (var d = inizio; d <= fine; d = C.addGiorni(d, 1)) {
      var cls = 'cella' + (d.slice(0, 7) !== ui.meseCal ? ' fuori' : '') + (d === oggi ? ' oggi' : '') + (d === ui.giornoCal ? ' scelta' : '') + (C.eFestivo(d) || C.giornoSett(d) === 0 ? ' festa' : '');
      var punti = (perGiorno[d] || []).slice(0, 4).map(function (x) {
        var col = x.tipo === 'rifiuti' ? C.FRAZIONI[x.frazioni[0]].colore : (x.item ? colVoce(x.item) : COLORE_TIPO[x.tipo]);
        return '<i style="--c:' + col + '"></i>';
      }).join('');
      var tt = C.turnoDel(tcfg, d), tinta = '';
      if (tt && C.STATI_TURNO[tt.stato] && (C.STATI_TURNO[tt.stato].lavoro || tt.stato === 'salto' || tt.stato === 'ferie')) { cls += ' tinta-turno'; tinta = ' style="--t:' + C.STATI_TURNO[tt.stato].colore + '"'; }
      h += '<button class="' + cls + '"' + tinta + ' type="button" data-giorno="' + d + '" aria-label="' + esc(C.etichettaGiorno(d, oggi)) + (tt ? ', ' + esc(C.testoTurno(tt)) : '') + ((perGiorno[d] || []).length ? ', ' + perGiorno[d].length + ' voci' : '') + '"><span class="n">' + C.parse(d).getDate() + '</span>' + servizioCella(tcfg, d) + '<span class="punti">' + punti + '</span></button>';
    }
    h += '</div>';
    var sel = perGiorno[ui.giornoCal] || [];
    var tSel = C.turnoDel(tcfg, ui.giornoCal);
    h += '<h2>' + esc(C.etichettaGiorno(ui.giornoCal, oggi)) + (C.eFestivo(ui.giornoCal) ? ' <small>festivo</small>' : '') + (tSel ? ' <small>' + esc(tcfg.persona || '') + ': ' + esc(C.testoTurno(tSel).toLowerCase()) + '</small>' : '') + '</h2>';
    h += sel.length ? '<ul class="righe">' + sel.map(riga).join('') + '</ul>'
      : '<div class="vuoto">Niente in programma.<br><button class="btn piccolo" type="button" data-azione="nuovo" data-data="' + ui.giornoCal + '">Aggiungi in questo giorno</button></div>';
    vista.innerHTML = h;
  }

  function schedeCalendario() {
    return '<div class="schede" role="group" aria-label="Vista calendario" style="margin:0 0 14px">' +
      '<button type="button" data-cal-modo="impegni" aria-pressed="' + (ui.calModo !== 'turni') + '">Impegni</button>' +
      '<button type="button" data-cal-modo="turni" aria-pressed="' + (ui.calModo === 'turni') + '">Turni VVF</button></div>';
  }

  // ---------- TURNI VVF ----------
  function vistaTurni() {
    var oggi = C.oggi(), t = turni();
    var h = testata('Calendario') + schedeCalendario();
    if (!t.attivo) {
      h += '<div class="sezione campi"><p style="margin:0">Turnario 12/24 – 12/48 calcolato con la stessa sequenza a 32 giorni di FireOps: scegli turno e saltoturno.</p>' +
        '<form id="form-turni" class="campi">' + campiTurni(t) + '<div class="azioni"><button class="btn" type="submit">Attiva il turnario</button></div></form></div>';
      vista.innerHTML = h; return;
    }
    var m0 = C.parse(ui.meseCal + '-01'), primo = ui.meseCal + '-01';
    var inizio = C.addGiorni(primo, -((m0.getDay() + 6) % 7)), fine = C.addGiorni(inizio, 41);
    var ultimo = C.addGiorni(C.addMesi(primo, 1), -1);
    var conta = {}, ore = 0;
    for (var g = primo; g <= ultimo; g = C.addGiorni(g, 1)) {
      var tg = C.turnoDel(t, g); conta[tg.stato] = (conta[tg.stato] || 0) + 1;
      if (tg.orario) { var p = tg.orario.split('-'); var a = +p[0].slice(0, 2) + +p[0].slice(3) / 60, b = +p[1].slice(0, 2) + +p[1].slice(3) / 60; ore += (b > a ? b - a : b + 24 - a); }
    }
    h += '<div class="mese-nav"><button class="btn icona" type="button" data-mese="-1" aria-label="Mese precedente">‹</button><h2>' + C.MESI[m0.getMonth()] + ' ' + m0.getFullYear() + '</h2><button class="btn icona" type="button" data-mese="1" aria-label="Mese successivo">›</button></div>';
    h += '<div class="griglia turni" role="grid">' + ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (x) { return '<div class="intest">' + x + '</div>'; }).join('');
    for (var d = inizio; d <= fine; d = C.addGiorni(d, 1)) {
      var tt = C.turnoDel(t, d), st = C.STATI_TURNO[tt.stato] || C.STATI_TURNO.altro;
      var cls = 'cella' + (d.slice(0, 7) !== ui.meseCal ? ' fuori' : '') + (d === oggi ? ' oggi' : '') + (st.lavoro || tt.stato === 'salto' || tt.stato === 'ferie' ? ' piena' : '') + (tt.modificato ? ' modificata' : '');
      var sv = C.turniDelGiorno(d);
      var badgeE = (tt.modificato || tt.stato === 'salto') ? '<span class="badge-turno" style="--c:' + st.colore + '">' + esc(st.breve) + '</span>' : '';
      h += '<button class="' + cls + '" type="button" data-turno-giorno="' + d + '" style="--c:' + st.colore + '" aria-label="' + esc(C.etichettaGiorno(d, oggi) + ': ' + C.testoTurno(tt) + '. In servizio diurno ' + sv.giorno + ', notte ' + sv.notte) + '">' + badgeE + '<span class="n">' + C.parse(d).getDate() + '</span>' + servizioCella(t, d) + '</button>';
    }
    h += '</div>';
    var tg0 = C.turniDelGiorno(oggi);
    h += '<p class="testo-muto" style="margin:10px 0 0">Oggi in servizio: diurno <b>' + esc(tg0.giorno) + '</b>, notte <b>' + esc(tg0.notte.toLowerCase()) + '</b> (come FireOps). In ogni giorno: diurno/notte; il tuo turno è sottolineato.</p>';
    h += '<div class="legenda">' + ['diurno', 'notte', 'smonto', 'riposo', 'salto', 'ferie', 'addestramento', 'corso', 'presidio', 'boschiva'].map(function (k) { return '<span><i style="--c:' + C.STATI_TURNO[k].colore + '"></i>' + C.STATI_TURNO[k].nome + '</span>'; }).join('') + '</div>';
    h += '<div class="totali" style="margin-top:14px"><div class="totale"><div class="valore">' + (conta.diurno || 0) + ' + ' + (conta.notte || 0) + '</div><div class="cosa">Diurni + notti a ' + C.MESI[m0.getMonth()] + '</div></div>' +
      '<div class="totale"><div class="valore">' + Math.round(ore) + ' h</div><div class="cosa">Ore di servizio' + ['salto', 'ferie', 'addestramento', 'corso', 'presidio', 'boschiva', 'straordinario'].filter(function (k) { return conta[k]; }).map(function (k) { return ' · ' + conta[k] + ' ' + C.STATI_TURNO[k].nome.toLowerCase(); }).join('') + '</div></div></div>';
    var prossimi = [];
    for (var q = oggi; prossimi.length < 4 && q <= C.addGiorni(oggi, 40); q = C.addGiorni(q, 1)) { var tq = C.turnoDel(t, q); if (C.STATI_TURNO[tq.stato].lavoro) prossimi.push(tq); }
    h += '<h2>Prossimi turni <small>turno ' + esc(t.turno) + (t.saltoturno ? ', saltoturno ' + esc(t.saltoturno) : '') + '</small></h2><ul class="righe">' + prossimi.map(function (x) {
      return '<li class="riga" style="--c:' + C.STATI_TURNO[x.stato].colore + '"><span class="barra"></span><button class="corpo-riga" type="button" data-turno-giorno="' + x.data + '"><span class="titolo">' + esc(C.testoTurno(x)) + '</span><span class="meta">' + esc(C.etichettaGiorno(x.data, oggi)) + (x.nota ? ' · ' + esc(x.nota) : '') + '</span></button><span class="destra"></span></li>';
    }).join('') + '</ul>';
    h += '<details class="sezione" style="margin-top:18px"><summary style="cursor:pointer;font-weight:700">Impostazioni del turno</summary><form id="form-turni" class="campi" style="margin-top:12px">' + campiTurni(t) +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-azione="turni-off">Nascondi il turnario</button></div></form></details>';
    vista.innerHTML = h;
  }
  function campiTurni(t) {
    var s = Store.settings();
    return '<div class="campo">Il tuo turno<div class="riga-reg" style="display:flex;gap:8px">' + ['A', 'B', 'C', 'D'].map(function (x) { return '<label class="chip"><input type="radio" name="turno" value="' + x + '"' + (t.turno === x ? ' checked' : '') + ' class="sr">' + x + '</label>'; }).join('') + '</div></div>' +
      '<label class="campo">Saltoturno<span class="aiuto">Il numero del tuo gruppo di salto (1–8): quei turni vengono segnati come salto.</span><select name="saltoturno"><option value="">Non indicato</option>' + [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return '<option value="' + n + '"' + (String(t.saltoturno || '') === String(n) ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      '<div class="due"><label class="campo">Diurno<input type="text" name="diurno" value="' + esc(t.diurno || '08:00-20:00') + '" placeholder="08:00-20:00"></label><label class="campo">Notte<input type="text" name="notte" value="' + esc(t.notte || '20:00-08:00') + '" placeholder="20:00-08:00"></label></div>' +
      '<label class="campo">Di chi è il turno<select class="sel-pers" name="persona">' + C.opzioni(s.persone, t.persona) + '</select></label>';
  }
  function apriGiornoTurno(data) {
    var t = turni(), tt = C.turnoDel(t, data), ecc = (t.eccezioni || []).filter(function (e) { return e.data === data; })[0];
    var scelte = [['', 'Come da turno (' + C.STATI_TURNO[tt.base].nome.toLowerCase() + (tt.sigla ? ' ' + (tt.fascia === 'notte' ? tt.sigla.toLowerCase() : tt.sigla) : '') + ')'], ['ferie', 'Ferie'], ['salto', 'Salto'], ['straordinario', 'Straordinario'], ['addestramento', 'Addestramento'], ['corso', 'Corso'], ['presidio', 'Presidio rurale'], ['boschiva', 'Boschiva (AIB)'], ['diurno', 'Diurno (cambio)'], ['notte', 'Notte (cambio)'], ['riposo', 'Riposo (cambio)'], ['altro', 'Altro']];
    var tg = C.turniDelGiorno(data);
    foglio.innerHTML = '<form method="dialog" id="form-giorno-turno"><div class="maniglia"></div><h3 id="foglio-titolo">' + esc(C.etichettaGiorno(data)) + ' · ' + esc(C.testoTurno(tt)) + '</h3><div class="campi">' +
      '<p class="testo-muto" style="margin:0">In servizio: notte uscente ' + esc(tg.uscente.toLowerCase()) + ', diurno <b>' + esc(tg.giorno) + '</b>, notte <b>' + esc(tg.notte.toLowerCase()) + '</b></p>' +
      '<div class="campo">Cambia questo giorno<div style="display:flex;flex-wrap:wrap;gap:8px">' + scelte.map(function (c) { return '<label class="chip"><input type="radio" name="stato" value="' + c[0] + '"' + (((ecc && ecc.stato) || '') === c[0] ? ' checked' : '') + ' class="sr">' + c[1] + '</label>'; }).join('') + '</div></div>' +
      '<div id="ferie-extra" class="campo" style="display:' + ((ecc && ecc.stato === 'ferie') ? '' : 'none') + '"><span>Ferie</span><span class="aiuto">Segna i turni di servizio (diurni e notturni) dalla data indicata; i giorni di riposo restano liberi.</span><div class="due"><label class="campo">Dal<input type="date" name="dal" value="' + esc(data) + '"></label><label class="campo">Quanti turni<input type="number" name="quanti" min="1" max="60" inputmode="numeric" value="1"></label></div></div>' +
      '<label class="campo">Orario<span class="aiuto">Facoltativo, es. 08:00-14:00 (per straordinario, addestramento, corso, presidio, boschiva)</span><input type="text" name="orario" value="' + esc((ecc && ecc.orario) || '') + '"></label>' +
      '<label class="campo">Nota<input type="text" name="nota" maxlength="120" value="' + esc((ecc && ecc.nota) || '') + '" placeholder="Es. cambio con Marco"></label>' +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button></div></div></form>';
    var f = $('#form-giorno-turno', foglio);
    $('[data-chiudi]', f).onclick = function () { foglio.close(); };
    f.querySelectorAll('input[name=stato]').forEach(function (r) { r.onchange = function () { $('#ferie-extra', f).style.display = (r.value === 'ferie' && r.checked) ? '' : 'none'; }; });
    f.onsubmit = function (e) {
      e.preventDefault();
      var stato = (f.querySelector('input[name=stato]:checked') || {}).value || '';
      var cfg = JSON.parse(JSON.stringify(turni()));
      cfg.eccezioni = (cfg.eccezioni || []).filter(function (x) { return x.data !== data; });
      if (stato === 'ferie') {
        // ferie: conta i turni di servizio (diurni e notturni) a partire dalla data indicata
        var dal = f.dal.value || data, n = Math.max(1, Math.min(60, parseInt(f.quanti.value, 10) || 1)), giorni = [];
        for (var i = 0; giorni.length < n && i < 400; i++) {
          var g = C.addGiorni(dal, i), tg2 = C.turnoDel(cfg, g);
          if (tg2 && C.STATI_TURNO[tg2.base] && C.STATI_TURNO[tg2.base].lavoro) giorni.push(g);
        }
        cfg.eccezioni = cfg.eccezioni.filter(function (x) { return giorni.indexOf(x.data) < 0; });
        giorni.forEach(function (g) { cfg.eccezioni.push({ data: g, stato: 'ferie', nota: f.nota.value.trim(), orario: '' }); });
      } else if (stato) cfg.eccezioni.push({ data: data, stato: stato, nota: f.nota.value.trim(), orario: f.orario.value.trim() });
      cfg.eccezioni = cfg.eccezioni.filter(function (x) { return x.data >= C.addGiorni(C.oggi(), -400); });
      Store.setSettings({ turni: cfg }); foglio.close(); toast(stato ? 'Giorno modificato' : 'Torna come da turno');
    };
    foglio.showModal();
  }

  // ---------- CONTI ----------
  function vistaConti() {
    var oggi = C.oggi(), mese = oggi.slice(0, 7);
    var tutti = voci().filter(function (v) { return v.tipo === 'pagamento' || v.tipo === 'scadenza'; });
    var questoMese = C.agenda(tutti, null, mese + '-01', C.addGiorni(C.addMesi(mese + '-01', 1), -1), oggi);
    var daPagareMese = questoMese.filter(function (x) { return !x.fatto; }).reduce(function (s, x) { return s + (+x.item.importo || 0); }, 0);
    var pagatoMese = questoMese.filter(function (x) { return x.fatto; }).reduce(function (s, x) { return s + (+x.item.importo || 0); }, 0);

    var h = testata('Conti', 'Pagamenti e scadenze');
    h += '<div class="totali"><div class="totale forte"><div class="valore">' + C.euro(daPagareMese) + '</div><div class="cosa">Ancora da pagare a ' + C.MESI[+mese.slice(5) - 1] + '</div></div>' +
      '<div class="totale"><div class="valore">' + C.euro(pagatoMese) + '</div><div class="cosa">Già pagato questo mese</div></div></div>';
    var filtri = [['dapagare', 'Da pagare'], ['scaduti', 'Scaduti'], ['pagati', 'Pagati'], ['ricorrenti', 'Ricorrenti']];
    h += '<div class="schede" role="group" aria-label="Filtro">' + filtri.map(function (f) { return '<button type="button" data-filtro-conti="' + f[0] + '" aria-pressed="' + (ui.filtroConti === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>';

    var lista;
    if (ui.filtroConti === 'scaduti') {
      lista = C.arretrati(voci(), oggi, 365);
      h += lista.length ? elencoPerGiorno(lista, oggi) : '<div class="vuoto" style="margin-top:14px">Nessuna voce scaduta. Tutto in ordine.</div>';
    } else if (ui.filtroConti === 'pagati') {
      lista = C.agenda(tutti, null, C.addGiorni(oggi, -90), C.addGiorni(oggi, 60), oggi).filter(function (x) { return x.fatto; }).reverse();
      h += lista.length ? elencoPerGiorno(lista, oggi) : '<div class="vuoto" style="margin-top:14px">Qui compaiono i pagamenti degli ultimi 3 mesi che hai spuntato.</div>';
    } else if (ui.filtroConti === 'ricorrenti') {
      var ric = tutti.filter(function (v) { return C.volteAnno(v) > 0; }).sort(function (a, b) { return a.titolo.localeCompare(b.titolo); });
      var annuo = ric.reduce(function (s, v) { return s + (+v.importo || 0) * C.volteAnno(v); }, 0);
      h += ric.length ? '<p class="testo-muto" style="margin:14px 0 8px">Stima annua delle spese fisse: <b>' + C.euro(annuo) + '</b> (' + C.euro(annuo / 12) + ' al mese)</p><ul class="righe">' + ric.map(function (v) {
        var pross = C.occorrenze(v, oggi, C.addGiorni(oggi, 400))[0];
        return rigaVoce({ data: pross || v.data, ora: v.ora, tipo: v.tipo, item: v, fatto: false, scaduto: false }).replace('</span></button>', ' · prossima ' + (pross ? esc(C.dataBreve(pross)) : 'terminata') + '</span></button>');
      }).join('') + '</ul>' : '<div class="vuoto" style="margin-top:14px">Aggiungi bollette, affitto o rate con "Ripeti" e qui vedi quanto spendete ogni anno.</div>';
    } else {
      lista = C.arretrati(voci(), oggi, 365).filter(function (x) { return x.tipo === 'pagamento' || x.tipo === 'scadenza'; })
        .concat(C.agenda(tutti, null, oggi, C.addGiorni(oggi, 60), oggi).filter(function (x) { return !x.fatto; }));
      h += lista.length ? elencoPerGiorno(lista, oggi) : '<div class="vuoto" style="margin-top:14px">Nessun pagamento nei prossimi 60 giorni.<br><button class="btn piccolo" type="button" data-azione="nuovo" data-tipo="pagamento">Aggiungi un pagamento</button></div>';
    }
    h += htmlBolletteIban();
    vista.innerHTML = h;
  }

  // ---------- BOLLETTE E IBAN (in Pagamenti) ----------
  var SERVIZI_BOLLETTA = ['Luce', 'Gas', 'Acqua', 'Internet', 'Telefono', 'Rifiuti', 'Altro'];
  function htmlBolletteIban() {
    var tutti = Store.lista(), bollette = tutti.filter(function (v) { return v.tipo === 'bolletta'; }), ibans = tutti.filter(function (v) { return v.tipo === 'iban'; });
    var h = '<h2>Bollette <small>' + bollette.length + '</small></h2><div class="sezione">' + (bollette.length ? bollette.map(function (b) {
      return '<button type="button" class="sotto-card doc-riga" data-bolletta-apri="' + esc(b.id) + '"><span class="sc-titolo">' + esc((b.fornitore || 'Fornitore') + ' · ' + (b.servizio || 'Utenza')) + '</span>' +
        (b.codice || b.numeroCliente ? '<span class="sc-riga">' + (b.codice ? 'POD/PDR ' + esc(b.codice) : '') + (b.codice && b.numeroCliente ? ' · ' : '') + (b.numeroCliente ? 'Cliente ' + esc(b.numeroCliente) : '') + '</span>' : '') + '</button>';
    }).join('') : '<p class="testo-muto">Nessuna bolletta. Salva luce e gas con fornitore, POD o PDR e numero cliente.</p>') +
      '<button type="button" class="btn secondario piccolo" data-bolletta-nuova>+ Nuova bolletta</button></div>';
    h += '<h2>IBAN <small>' + ibans.length + '</small></h2><div class="sezione">' + (ibans.length ? ibans.map(function (c) {
      return '<button type="button" class="sotto-card doc-riga" data-iban-apri="' + esc(c.id) + '"><span class="sc-titolo">' + esc(c.titolo || c.banca || 'Conto') + '</span>' +
        (c.intestatario ? '<span class="sc-riga">' + esc(c.intestatario) + '</span>' : '') + (c.iban ? '<span class="sc-riga">' + esc(c.iban) + '</span>' : '') + '</button>';
    }).join('') : '<p class="testo-muto">Nessun IBAN salvato.</p>') +
      '<button type="button" class="btn secondario piccolo" data-iban-nuovo>+ Nuovo IBAN</button></div>';
    return h;
  }
  function apriSchedaConti(tipo, id) {
    var orig = id ? Store.get(id) : null, PERS = ['Andrea', 'Cristina'];
    var d = orig ? JSON.parse(JSON.stringify(orig)) : { id: C.nuovoId(), tipo: tipo, persona: 'Andrea' };
    var campi = tipo === 'bolletta' ? [
      ['servizio', 'Tipo di utenza', 'sel', SERVIZI_BOLLETTA],
      ['fornitore', 'Fornitore', 'text', ''],
      ['codice', 'POD (luce) o PDR (gas)', 'text', ''],
      ['numeroCliente', 'Numero cliente', 'text', ''],
      ['persona', 'Intestata a', 'sel', PERS],
      ['titolo', 'Nome (facoltativo)', 'text', ''],
      ['note', 'Note', 'area', '']
    ] : [
      ['titolo', 'Nome del conto', 'text', ''],
      ['intestatario', 'Intestatario', 'sel', PERS],
      ['banca', 'Banca', 'text', ''],
      ['iban', 'IBAN', 'text', 'IT + 25 caratteri'],
      ['note', 'Note', 'area', '']
    ];
    foglio.classList.remove('visore');
    var corpo = campi.map(function (c) {
      var k = c[0], v = d[k] == null ? '' : d[k];
      if (c[2] === 'sel') return '<label class="campo">' + esc(c[1]) + '<select class="sel-pers" name="' + k + '">' + C.opzioni(c[3], v, k === 'persona' || k === 'intestatario' ? null : '') + '</select></label>';
      if (c[2] === 'area') return '<label class="campo">' + esc(c[1]) + '<textarea name="' + k + '" rows="2" maxlength="500">' + esc(v) + '</textarea></label>';
      return '<label class="campo">' + esc(c[1]) + '<input type="text" name="' + k + '" maxlength="120" value="' + esc(v) + '"' + (c[3] ? ' placeholder="' + esc(c[3]) + '"' : '') + (k === 'iban' ? ' autocapitalize="characters"' : '') + '></label>';
    }).join('');
    foglio.innerHTML = '<form method="dialog" id="form-conti"><div class="maniglia"></div><h3 id="foglio-titolo">' + (tipo === 'bolletta' ? (id ? 'Modifica bolletta' : 'Nuova bolletta') : (id ? 'Modifica IBAN' : 'Nuovo IBAN')) + '</h3><div class="campi">' + corpo +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
    var form = $('#form-conti', foglio);
    $('[data-chiudi]', form).onclick = function () { foglio.close(); };
    if (id) $('[data-elimina]', form).onclick = function () {
      if (!window.confirm('Eliminare questa voce?')) return;
      Store.elimina(id); foglio.close(); toast('Eliminato');
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      campi.forEach(function (c) { d[c[0]] = form.elements[c[0]] ? form.elements[c[0]].value.trim() : ''; });
      d.tipo = tipo;
      Store.upsert(d); foglio.close(); toast(id ? 'Salvato' : 'Aggiunto');
    };
    foglio.showModal();
  }

  // ---------- RIFIUTI ----------
  function vistaRifiuti() {
    var oggi = C.oggi(), cfg = rifiuti();
    var h = testata('Rifiuti', 'Porta a porta Alea · Bertinoro');
    if (cfg.regole.length) {
      h += '<h2>Prossime due settimane <small>giorno del ritiro</small></h2><div class="striscia">';
      for (var i = 0; i < 14; i++) {
        var d = C.addGiorni(oggi, i), r = C.ritiri(cfg, d), p = C.parse(d);
        h += '<div class="giornata"><div class="g">' + C.GIORNI[p.getDay()] + '<b>' + p.getDate() + '</b></div>' +
          (r.frazioni.length ? bidoni(r.frazioni, true) + '<div class="fr">' + esc(r.frazioni.map(function (f) { return C.FRAZIONI[f].nome.split(' ')[0]; }).join(', ')) + '</div>' : '<div class="fr testo-muto">—</div>') +
          (r.nota ? '<div class="nota">' + esc(r.nota) + '</div>' : '') + '</div>';
      }
      h += '</div>';
    }

    h += '<h2>La tua zona</h2><div class="sezione campi">';
    h += '<label class="campo">Zona Alea<span class="aiuto">La trovi sulla bolletta Alea o sull\'Eco-Calendario consegnato a casa.</span><select data-rif="zona"><option value="">Scegli…</option>' +
      Object.keys(ZONE).map(function (k) { return '<option value="' + k + '"' + (cfg.zona === k ? ' selected' : '') + '>' + ZONE[k].nome + '</option>'; }).join('') + '</select></label>';
    if (cfg.zona && ZONE[cfg.zona]) h += '<p class="testo-muto" style="margin:0">Calendario ufficiale: <a href="' + ZONE[cfg.zona].pdf + '" target="_blank" rel="noopener">Eco-Calendario ' + esc(ZONE[cfg.zona].nome) + ' (PDF)</a>. Copia qui sotto i giorni della "settimana tipo".</p>';
    h += '<div class="due"><label class="campo">Promemoria la sera prima<input type="time" data-rif="oraAvviso" value="' + esc(cfg.oraAvviso || '20:00') + '"></label>' +
      '<label class="campo">Festività<select data-rif="festivita"><option value="1"' + (cfg.festivita !== false ? ' selected' : '') + '>Regole Alea</option><option value="0"' + (cfg.festivita === false ? ' selected' : '') + '>Ignora</option></select></label></div>';
    var fest = (cfg.festivi && cfg.festivi.length ? cfg.festivi : C.FESTIVI_ALEA).map(function (md) { return +md.slice(3) + '/' + +md.slice(0, 2); }).join(', ');
    h += '<label class="campo">Giorni senza raccolta<span class="aiuto">Giorno/mese separati da virgola, come sull\'Eco-Calendario. Pasquetta è calcolata in automatico.</span><input type="text" data-rif="festivi" value="' + esc(fest) + '"></label>';
    h += '<p class="testo-muto" style="margin:0">Un ritiro che cade in questi giorni si recupera il sabato prima (lun–mer) o dopo (gio–ven), solo se il sabato è ad almeno 2 giorni da un\'altra raccolta dello stesso rifiuto; di sabato non si recupera.</p></div>';

    h += '<h2>Giorni di ritiro</h2>';
    if (!cfg.regole.length) h += '<p class="testo-muto">Aggiungi un giorno per ogni riga della settimana tipo. Esempio: lunedì → Umido + Carta; mercoledì 1ª e 3ª settimana → Secco.</p>';
    cfg.regole.forEach(function (r, i) {
      h += '<div class="regola"><div class="riga-reg"><select data-reg="' + i + '" data-campo="giorno" aria-label="Giorno" style="width:auto;flex:1">' +
        [1, 2, 3, 4, 5, 6].map(function (g) { return '<option value="' + g + '"' + (+r.giorno === g ? ' selected' : '') + '>' + C.GIORNI_LUNGHI[g] + '</option>'; }).join('') +
        '</select><button class="btn icona" type="button" data-togli-reg="' + i + '" aria-label="Togli questo giorno">✕</button></div>' +
        '<div class="riga-reg">' + Object.keys(C.FRAZIONI).map(function (f) { return '<button type="button" class="chip frazione" style="--c:' + C.FRAZIONI[f].colore + '" data-reg="' + i + '" data-fraz="' + f + '" aria-pressed="' + ((r.frazioni || []).indexOf(f) >= 0) + '">' + C.FRAZIONI[f].nome.split(' ')[0] + '</button>'; }).join('') + '</div>' +
        '<div class="riga-reg"><span class="testo-muto">Settimane del mese:</span>' + [1, 2, 3, 4, 5].map(function (w) { return '<button type="button" class="chip" data-reg="' + i + '" data-sett="' + w + '" aria-pressed="' + ((r.settimane || []).indexOf(w) >= 0) + '">' + w + 'ª</button>'; }).join('') +
        '<span class="testo-muto">' + ((r.settimane || []).length ? '' : 'tutte') + '</span></div>' +
        '<details class="mesi"' + ((r.mesi || []).length ? ' open' : '') + '><summary>' + ((r.mesi || []).length ? 'Solo alcuni mesi' : 'Tutto l\'anno') + ' <span class="testo-muto">· scegli i mesi (es. vegetale)</span></summary><div class="riga-reg">' + C.MESI.map(function (m, k) { return '<button type="button" class="chip" data-reg="' + i + '" data-mese-reg="' + (k + 1) + '" aria-pressed="' + ((r.mesi || []).indexOf(k + 1) >= 0) + '">' + m.slice(0, 3) + '</button>'; }).join('') + '</div></details></div>';
    });
    h += '<div class="azioni"><button class="btn secondario" type="button" data-azione="aggiungi-regola">Aggiungi un giorno di ritiro</button></div>';

    h += '<h2>Variazioni <small>avvisi Alea, recuperi</small></h2>';
    var ecc = (cfg.eccezioni || []).filter(function (e) { return e.data >= C.addGiorni(oggi, -7); }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (ecc.length) h += '<ul class="righe">' + ecc.map(function (e) {
      var idx = cfg.eccezioni.indexOf(e);
      return '<li class="riga" style="--c:var(--albana)"><span class="barra"></span><span class="corpo-riga"><span class="titolo">' + esc(C.etichettaGiorno(e.data, oggi)) + ': ' + (e.frazioni.length ? esc(C.nomiFrazioni(e.frazioni)) : 'nessun ritiro') + '</span><span class="meta">' + esc(e.nota || '') + '</span></span><span class="destra"><button class="btn icona" type="button" data-togli-ecc="' + idx + '" aria-label="Togli variazione">✕</button></span></li>';
    }).join('') + '</ul>';
    else h += '<p class="testo-muto">Se Alea annuncia un ritiro spostato, aggiungilo qui: vale solo per quel giorno.</p>';
    h += '<div class="azioni"><button class="btn secondario" type="button" data-azione="nuova-eccezione">Aggiungi una variazione</button><a class="btn secondario" href="https://www.alea-ambiente.it/" target="_blank" rel="noopener">Avvisi sul sito Alea</a></div>';
    vista.innerHTML = h;
  }

  function salvaRifiuti(mod) {
    var cfg = JSON.parse(JSON.stringify(rifiuti()));
    mod(cfg);
    Store.setSettings({ rifiuti: cfg });
  }
  function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); arr.sort(function (a, b) { return a > b ? 1 : -1; }); return arr; }

  // ---------- VIAGGI e CONCERTI ----------
  // ---------- lista della spesa e note ----------
  var COLORI_POSTIT = ['#FFE98A', '#BDE7FF', '#FFC9D6', '#C9F2C7'];
  // una nota è "nuova" per me se l'ha scritta o modificata qualcun altro dopo l'ultima volta che l'ho letta
  function notaNuova(n) {
    var me = Store.conf().chi, autore = n.modificatoDa || n.creatoDa || '';
    var quando = n.modificataIl || n.aggiornato || 0;
    return !!me && n.tipo === 'nota' && autore !== me && ((n.letti || {})[me] || 0) < quando;
  }
  function segnaLette(note) {
    var me = Store.conf().chi; if (!me) return;
    note.filter(notaNuova).forEach(function (n) {
      var l = Object.assign({}, n.letti || {}); l[me] = Date.now();
      Store.upsert(Object.assign({}, n, { letti: l }));
    });
  }
  function aggiornaPallino() {
    var nuove = Store.lista().filter(notaNuova).length, a = document.querySelector('nav.barra-nav a[data-r="lista"]');
    if (!a) return;
    a.classList.toggle('con-pallino', nuove > 0);
    a.setAttribute('aria-label', nuove ? 'Lista e note, ' + nuove + ' nuove' : 'Lista e note');
  }
  function vistaLista() {
    var tutte = Store.lista();
    var spese = tutte.filter(function (v) { return v.tipo === 'spesa'; });
    var daFare = spese.filter(function (x) { return !x.fatto; }), fatte = spese.filter(function (x) { return x.fatto; });
    var note = tutte.filter(function (v) { return v.tipo === 'nota'; }).sort(function (a, b) { return b.aggiornato - a.aggiornato; });
    segnaLette(note);
    var h = testata('Lista e note', daFare.length ? daFare.length + ' da comprare' : 'Tutto preso');
    h += '<h2>Lista della spesa</h2><form id="form-spesa" class="sezione" style="display:flex;gap:8px"><input type="text" name="voce" maxlength="80" placeholder="Aggiungi alla lista" aria-label="Aggiungi alla lista" list="catalogo-spesa" autocomplete="off" style="flex:1"><datalist id="catalogo-spesa">' + nomiCatalogoSpesa().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist><button class="btn" type="submit">Aggiungi</button></form>';
    h += '<div class="sezione lista-spesa">' + daFare.concat(fatte).map(function (x) {
      return '<div class="spesa-riga' + (x.fatto ? ' fatta' : '') + '"><button type="button" class="spunta" data-spunta-spesa="' + esc(x.id) + '" aria-pressed="' + (!!x.fatto) + '" aria-label="Segna ' + esc(x.titolo) + '">' + (x.fatto ? '✓' : '') + '</button>' +
        '<span class="spesa-testo">' + esc(x.titolo) + '</span><button type="button" class="togli" data-elimina-spesa="' + esc(x.id) + '" aria-label="Elimina ' + esc(x.titolo) + '">✕</button></div>';
    }).join('') + (spese.length ? '' : '<p class="vuoto">La lista è vuota.</p>') + '</div>';
    h += '<h2>Note</h2><div class="postit-griglia">' + note.map(function (n) {
      var dn = destinazioneTesto((n.titolo || '') + '\n' + (n.testo || ''));
      var pi = '<button type="button" class="postit" style="--p:' + esc(n.colore || COLORI_POSTIT[0]) + '" data-nota="' + esc(n.id) + '"><strong>' + esc(n.titolo || 'Nota') + '</strong><span>' + esc(n.testo || '') + '</span>' + (notaNuova(n) ? '<span class="pallino" aria-label="Non letta"></span>' : '') + '</button>';
      return dn ? '<div class="postit-con-naviga">' + pi + tastoNaviga(dn, '🧭 Naviga', 'postit-naviga', 'Naviga dalla nota ' + (n.titolo || '')) + '</div>' : pi;
    }).join('') + '<button type="button" class="postit nuovo" data-nota-nuova>+ Nuova nota</button></div>';
    vista.innerHTML = h;
  }
  function apriNota(id) {
    var orig = id ? Store.get(id) : null;
    var n = orig ? JSON.parse(JSON.stringify(orig)) : { titolo: '', testo: '', colore: COLORI_POSTIT[0] };
    if (orig) segnaLette([orig]);
    foglio.classList.remove('visore');
    foglio.innerHTML = '<form method="dialog" id="form-nota"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica nota' : 'Nuova nota') + '</h3><div class="campi">' +
      '<label class="campo">Titolo<input type="text" name="titolo" maxlength="60" value="' + esc(n.titolo) + '"></label>' +
      '<label class="campo">Testo<textarea name="testo" rows="6" maxlength="2000">' + esc(n.testo) + '</textarea></label>' +
      '<fieldset class="colore-campo"><legend>Colore</legend><div class="colori">' + COLORI_POSTIT.map(function (c) {
        return '<label><input type="radio" name="colore" value="' + c + '"' + (n.colore === c ? ' checked' : '') + ' class="sr"><span class="colore-pallino" style="--c:' + c + '"></span></label>';
      }).join('') + '</div></fieldset>' +
      (function () { var dn = destinazioneTesto((n.titolo || '') + '\n' + (n.testo || '')); return dn ? '<div class="azioni">' + tastoNaviga(dn, '🧭 Naviga in auto', 'btn secondario') + '</div>' : ''; })() +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
    var f = $('#form-nota', foglio);
    $('[data-chiudi]', f).onclick = function () { foglio.close(); };
    if (id) $('[data-elimina]', f).onclick = function () { if (confirm('Eliminare questa nota?')) { Store.elimina(id); foglio.close(); toast('Nota eliminata'); } };
    f.onsubmit = function (e) {
      e.preventDefault();
      var colore = (f.querySelector('input[name=colore]:checked') || {}).value || COLORI_POSTIT[0];
      Store.upsert(Object.assign(n, { tipo: 'nota', titolo: f.titolo.value.trim(), testo: f.testo.value, colore: colore, modificatoDa: Store.conf().chi || '', modificataIl: Date.now() }));
      foglio.close(); toast('Nota salvata');
    };
    foglio.showModal();
  }
  // ---------- wallet: carte fedeltà, check-in e pagamento ----------
  var CATEGORIE_CARTA = ['Fedeltà', 'Check-in', 'Pagamento'];
  var COLORI_CORNICE = ['', '#2F6DB5', '#2E8B57', '#E3B505', '#D7263D', '#8A5A2B', '#7D4FA8', '#1E7F8C'];
  // colore e bordo attorno al codice (foto) della carta; senza colore nessuna cornice
  // codice a barre del codice della carta (SVG): EAN-13/EAN-8 se il codice è numerico di quella lunghezza, altrimenti Code 128
  function barcodeCarta(codice, formato) {
    var valore = String(codice || '').trim();
    if (!valore || !window.JsBarcode) return '';
    var opz = { displayValue: true, fontSize: 14, margin: 6, height: 60, width: 2, background: '#ffffff', lineColor: '#000000' };
    var jsb = formato === 'EAN-13' ? 'EAN13' : formato === 'EAN-8' ? 'EAN8' : 'CODE128';
    try {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, valore, Object.assign({ format: jsb }, opz));
      return svg.outerHTML;
    } catch (e) {
      // il codice non rispetta il formato scelto (per esempio il controllo EAN): uso Code 128
      try {
        var svg2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        JsBarcode(svg2, valore, Object.assign({ format: 'CODE128' }, opz));
        return svg2.outerHTML;
      } catch (e2) { return ''; }
    }
  }
  function cornicStyle(col) { return col ? ' style="background:' + col + ';border:6px solid ' + col + ';border-radius:16px"' : ''; }
  function vistaWallet() {
    var carte = Store.lista().filter(function (v) { return v.tipo === 'carta'; });
    var h = testata('Wallet', carte.length ? carte.length + (carte.length === 1 ? ' carta' : ' carte') : 'Carte e biglietti');
    var catCarte = CATEGORIE_CARTA.concat(carte.map(function (c) { return c.categoria || 'Fedeltà'; }).filter(function (x, i, a) { return CATEGORIE_CARTA.indexOf(x) < 0 && a.indexOf(x) === i; }));
    catCarte.forEach(function (cat) {
      var gruppo = carte.filter(function (c) { return (c.categoria || 'Fedeltà') === cat; }).sort(function (a, b) { return (a.titolo || '').localeCompare(b.titolo || ''); });
      if (!gruppo.length) return;
      h += '<h2>' + cat + ' <small>' + gruppo.length + '</small></h2><div class="wallet-griglia">' + gruppo.map(function (c) {
        var pf = (c.allegati || []).filter(function (a) { return /^image\//.test(a.mime || ''); })[0];
        return '<button type="button" class="carta-wallet" data-carta-apri="' + esc(c.id) + '">' + (pf ? '<img class="carta-miniatura"' + cornicStyle(c.cornice) + ' data-anteprima="' + esc(pf.id) + '" data-mime="' + esc(pf.mime) + '" alt="" src="">' : (c.codice && cat !== 'Pagamento' ? '<span class="carta-qr-mini"' + cornicStyle(c.cornice) + '><span class="carta-qr-bianco">' + barcodeCarta(c.codice, c.formato) + '</span></span>' : '<span class="carta-vuota">' + (cat === 'Check-in' ? '🎫' : cat === 'Pagamento' ? '💳' : '🏷') + '</span>')) +
          '<strong>' + esc(c.titolo || 'Carta') + '</strong>' + (c.codice && cat !== 'Pagamento' ? '<small>' + esc(c.codice) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    });
    if (!carte.length) h += '<div class="vuoto">Nessuna carta. Aggiungi le carte fedeltà del supermercato con il codice a barre, i biglietti del check-in o le carte di pagamento (solo nome e banca).</div>';
    h += '<div class="azioni"><button class="btn" type="button" data-carta-nuova>+ Nuova carta o biglietto</button></div>';
    vista.innerHTML = h;
    Viaggi.anteprime(vista);
  }
  function apriCartaDettaglio(id) {
    var c = Store.get(id); if (!c) return;
    foglio.classList.remove('visore');
    var foto = (c.allegati || []).map(function (a) {
      return '<button type="button" class="carta-foto"' + cornicStyle(c.cornice) + ' data-apri-allegato="' + esc(a.id) + '" data-nome="' + esc(a.nome) + '" data-mime="' + esc(a.mime || '') + '">' + (/^image\//.test(a.mime || '') ? '<img class="anteprima" data-anteprima="' + esc(a.id) + '" data-mime="' + esc(a.mime || '') + '" alt="" src="">' : '📄 ' + esc(a.nome)) + '</button>';
    }).join('');
    foglio.innerHTML = '<div class="maniglia"></div><h3 id="foglio-titolo">' + esc(c.titolo || 'Carta') + '</h3><div class="campi">' +
      '<p class="testo-muto" style="margin:0">' + esc(c.categoria || 'Fedeltà') + '</p>' +
      (c.codice && c.categoria !== 'Pagamento' ? '<p class="carta-codice" aria-label="Codice">' + esc(c.codice) + '</p>' : '') +
      (c.codice && c.categoria !== 'Pagamento' ? '<div class="carta-qr-box"' + cornicStyle(c.cornice) + '><div class="carta-qr-bianco">' + barcodeCarta(c.codice, c.formato) + '</div></div>' : '') +
      (foto || '<p class="testo-muto">Nessuna foto.</p>') +
      (c.docRif && Viaggi.docPersonale(c.docRif) ? '<p class="testo-muto" style="margin:0">Documento: ' + esc(Viaggi.docPersonale(c.docRif).tipo || 'Documento') + ' · ' + esc(Viaggi.docPersonale(c.docRif).persona || '') + '</p>' + Viaggi.fotoPersonali(c.docRif) : '') +
      (c.note ? '<p style="white-space:pre-wrap;margin:0">' + esc(c.note) + '</p>' : '') +
      '<div class="azioni"><button class="btn" type="button" data-chiudi>Chiudi</button><button class="btn secondario" type="button" data-modifica-carta>Modifica</button></div></div>';
    Viaggi.anteprime(foglio);
    $('[data-chiudi]', foglio).onclick = function () { foglio.close(); };
    $('[data-modifica-carta]', foglio).onclick = function () { apriCarta(id); };
    foglio.querySelectorAll('[data-apri-allegato]').forEach(function (b) { b.onclick = function () { Viaggi.apriAllegato(b.dataset.apriAllegato, b.dataset.nome, b.dataset.mime); }; });
    foglio.showModal();
  }
  // tocco semplice sulla carta: codice a barre ingrandito a tutto schermo
  function apriCodiceGrande(id) {
    var c = Store.get(id); if (!c) return;
    if (!c.codice || c.categoria === 'Pagamento') return apriCartaDettaglio(id);
    foglio.classList.add('visore');
    foglio.innerHTML = '<div class="visore-corpo"><div class="visore-barra"><span>' + esc(c.titolo || 'Carta') + '</span><button class="btn secondario" type="button" data-chiudi>Chiudi</button></div>' +
      '<div class="codice-grande"><div class="codice-grande-cornice"' + cornicStyle(c.cornice) + '><div class="carta-qr-bianco">' + barcodeCarta(c.codice, c.formato) + '</div></div></div>' +
      '<div class="azioni"><button class="btn secondario" type="button" data-dettagli>Dettagli della carta</button></div></div>';
    $('[data-chiudi]', foglio).onclick = function () { foglio.close(); };
    $('[data-dettagli]', foglio).onclick = function () { foglio.close(); apriCartaDettaglio(id); };
    foglio.showModal();
  }
  function apriCarta(id) {
    var orig = id ? Store.get(id) : null;
    var c = orig ? JSON.parse(JSON.stringify(orig)) : { id: C.nuovoId(), tipo: 'carta', titolo: '', categoria: 'Fedeltà', codice: '', note: '', allegati: [] };
    c.allegati = c.allegati || [];
    var wrap = { carta: [c] }, ctx = 'wallet|carta|' + c.id, form = null;
    foglio.classList.remove('visore');
    function snap() { if (!form) return; c.titolo = form.titolo.value.trim(); c.categoria = form.categoria.value; c.codice = form.codice.value.trim(); c.note = form.note.value; c.docRif = form.docRif.value; c.cornice = form.cornice ? form.cornice.value : (c.cornice || ''); c.formato = form.formato ? form.formato.value : (c.formato || ''); }
    function disegna() {
      foglio.innerHTML = '<form method="dialog" id="form-carta"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica' : 'Nuova carta') + '</h3><div class="campi">' +
        '<label class="campo">Nome<input type="text" name="titolo" required maxlength="60" value="' + esc(c.titolo) + '" placeholder="Es. Esselunga, Imbarco Volo BLQ"></label>' +
        '<label class="campo">Tipo<select class="sel-pers" name="categoria">' + C.opzioni(CATEGORIE_CARTA, c.categoria) + '</select></label>' +
        (c.categoria === 'Pagamento' ? '<p class="aiuto" style="margin:0">Per le carte di pagamento salva solo nome e banca. Non inserire il numero della carta né il codice.</p>' :
          '<label class="campo">Codice<span class="aiuto">Il numero sotto il codice a barre, per leggerlo a mano.</span><input type="text" name="codice" maxlength="60" value="' + esc(c.codice) + '" inputmode="text"></label>' + (c.categoria === 'Pagamento' ? '' : '<label class="campo">Formato del codice a barre<span class="aiuto">Di solito Code 128: cambialo solo se la cassa non legge il codice.</span><select name="formato"><option value=""' + (!c.formato ? ' selected' : '') + '>Code 128</option><option value="EAN-13"' + (c.formato === 'EAN-13' ? ' selected' : '') + '>EAN-13</option><option value="EAN-8"' + (c.formato === 'EAN-8' ? ' selected' : '') + '>EAN-8</option></select></label>')) +
        '<label class="campo">Note<textarea name="note" rows="3" maxlength="500">' + esc(c.note) + '</textarea></label>' +
        '<label class="campo">Documento collegato<span class="aiuto">Un documento da «I miei dati»: le sue foto si vedono anche qui.</span><select name="docRif">' + Viaggi.opzioniDocumenti(c.docRif, 'Nessun documento') + '</select></label>' +
        '<fieldset class="campo colore-campo"><legend>Colore e bordo del codice</legend><div class="colori">' + COLORI_CORNICE.map(function (col) { return '<label class="colore-pallino" style="--c:' + (col || '#8A9A90') + '"><input type="radio" name="cornice" value="' + col + '"' + ((c.cornice || '') === col ? ' checked' : '') + '><span>' + (col ? '' : 'Nessuno') + '</span></label>'; }).join('') + '</div></fieldset>' +
        '<div class="campo"><span>Foto</span><span class="aiuto">Foto del codice a barre o del biglietto, da mostrare alla cassa o al gate.</span>' + Viaggi.htmlAllegati(c.allegati, ctx, 'Aggiungi foto') + '<div id="scelta-carta"></div></div>' +
        '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
      form = $('#form-carta', foglio);
      form.categoria.onchange = function () { snap(); disegna(); };
      $('[data-chiudi]', form).onclick = function () { foglio.close(); };
      if (id) $('[data-elimina]', form).onclick = function () {
        if (!window.confirm('Eliminare questa carta?')) return;
        if ((orig.allegati || []).length && !window.confirm('Conferma di nuovo: le foto andranno nel cestino di Drive.')) return;
        Store.elimina(id); foglio.close(); toast('Carta eliminata');
      };
      form.querySelectorAll('[data-apri-allegato]').forEach(function (b) { b.onclick = function () { Viaggi.apriAllegato(b.dataset.apriAllegato, b.dataset.nome, b.dataset.mime); }; });
      form.querySelectorAll('[data-togli-allegato]').forEach(function (b) { b.onclick = function () {
        var idAll = b.dataset.togliAllegato.split('|').pop();
        if (window.confirm('Togliere questa foto? Il file va nel cestino di Drive.')) { snap(); Viaggi.togli(wrap, ctx, idAll, false); disegna(); }
      }; });
      var inp = form.querySelector('[data-allega]');
      if (inp) inp.onchange = function () { snap(); Viaggi.allega(wrap, ctx, inp.files, false).then(disegna); };
      Viaggi.anteprime(foglio);
      form.onsubmit = function (e) {
        e.preventDefault(); snap();
        if (!c.titolo) { form.titolo.focus(); return; }
        Store.upsert({ id: c.id, tipo: 'carta', titolo: c.titolo, categoria: c.categoria, codice: c.categoria === 'Pagamento' ? '' : c.codice, note: c.note, allegati: c.allegati, docRif: c.docRif || '', cornice: c.cornice || '', formato: c.formato || '' });
        foglio.close(); toast(id ? 'Carta salvata' : 'Carta aggiunta');
      };
    }
    disegna();
    foglio.showModal();
  }
  function vistaViaggi() { var n = voci().filter(function (v) { return v.tipo === 'viaggio'; }).length; vista.innerHTML = testata('Viaggi', n ? n + (n === 1 ? ' viaggio' : ' viaggi') : 'Voli, hotel e documenti') + Viaggi.htmlElenco(); }
  function vistaViaggio() { var m = location.hash.match(/^#viaggio\/(.+)$/), id = m ? decodeURIComponent(m[1]) : ''; vista.innerHTML = Viaggi.htmlDettaglio(id); Viaggi.anteprime(vista); Viaggi.disegnaMappa(id); }
  function vistaConcerti() { vista.innerHTML = testata('Concerti', 'Date, cantanti e biglietti') + Viaggi.htmlConcerti(); Viaggi.anteprime(vista); }
  function vistaArchivio() { vista.innerHTML = testata('Archivio', 'Viaggi e concerti conclusi') + Viaggi.htmlArchivio(); Viaggi.anteprime(vista); }

  // ---------- ALBUM ----------
  var albumAggiornato = 0;
  function vistaAlbum() {
    vista.innerHTML = testata('Album', Album.numero() ? Album.numero() + ' foto' : 'Le vostre foto') + Album.html();
    Album.monta();
    if (Date.now() - albumAggiornato > 60000) { albumAggiornato = Date.now(); Album.aggiorna(); }
  }

  // ---------- ALTRO ----------
  var PREFISSI_DATI = ['+39', '+41', '+33', '+34', '+43', '+49', '+44', '+351', '+30', '+385', '+1', '+61', '+81'];
  var casaMappa = null, casaPosizione = null, TIPI_DOCUMENTO = ['Carta d\'identità', 'Patente', 'Passaporto', 'Tessera sanitaria', 'Codice fiscale', 'Permesso di soggiorno', 'Altro'];
  function casaDi(a) {
    var c = a.casa || {};
    if (!a.casa && a.indirizzo) c = { via: a.indirizzo };
    return c;
  }
  function salvaAnagrafica(patch) { Store.setSettings({ anagrafica: Object.assign({}, Store.settings().anagrafica || {}, patch) }); }
  function datiPersonali(s) {
    var a = (s.anagrafica) || {}, pp = a.persone || {}, casa = casaDi(a), docs = a.documenti || [];
    if (typeof docs === 'string') docs = [];
    function campo(nome, etic, val, tipo) { return '<label class="campo">' + etic + '<input type="' + (tipo || 'text') + '" name="' + nome + '" value="' + esc(val || '') + '"></label>'; }
    var h = '<h2>Casa</h2><form id="form-dati" class="sezione campi" style="display:grid;gap:12px">' +
      '<div class="campo"><span>Indirizzo di casa</span><div class="casa-righe"><label class="campo">Via<input type="text" name="via" value="' + esc(casa.via || '') + '"></label><label class="campo">Civico<input type="text" name="civico" value="' + esc(casa.civico || '') + '"></label></div>' +
      '<div class="casa-righe casa-righe-3"><label class="campo">Comune<input type="text" name="comune" value="' + esc(casa.comune || '') + '"></label><label class="campo">CAP<input type="text" name="cap" inputmode="numeric" maxlength="5" value="' + esc(casa.cap || '') + '"></label><label class="campo">Provincia<input type="text" name="provincia" maxlength="2" autocapitalize="characters" value="' + esc(casa.provincia || '') + '"></label></div>' +
      '<div class="posizione-azioni"><button type="button" class="btn secondario piccolo" id="loc-casa">📍 Localizza l\'indirizzo</button>' +
        Native.linkNaviga(casa.lat != null && casa.lon != null ? { lat: casa.lat, lon: casa.lon } : (casa.via ? { q: [[casa.via, casa.civico].filter(Boolean).join(' '), [casa.cap, casa.comune].filter(Boolean).join(' ')].filter(Boolean).join(', ') } : null), '🧭 Naviga verso casa', 'btn secondario piccolo') + '</div>' +
      '<div id="mappa-casa" class="mappa mappa-casa"></div><p id="casa-nota" class="testo-muto" style="margin:0;font-size:13px">Tocca la mappa per posizionare la casa, oppure usa «Localizza».</p></div>' +
      '<label class="campo">Altro<span class="aiuto">Quello che ti serve spesso: codici, numeri utili, note.</span><textarea name="altro" maxlength="2000">' + esc(a.altro || '') + '</textarea></label>' +
      '<div class="azioni"><button class="btn" type="submit">Salva i dati</button></div></form>';
    setTimeout(function () { initCasa(); Viaggi.anteprime(document); }, 0);
    return h;
  }
  // ---------- AREE PERSONALI (Andrea, Cristina): dati, documenti, file e PDF ----------
  var TIPI_FILE = ['Curriculum', 'Certificato', 'Attestato', 'Contratto', 'Busta paga', 'Referto', 'Ricevuta', 'Altro'];
  function campo(nome, etic, val, tipo) { return '<label class="campo">' + etic + '<input type="' + (tipo || 'text') + '" name="' + nome + '" value="' + esc(val || '') + '"></label>'; }
    function persona(nome) {
      var p = (((Store.settings().anagrafica || {}).persone) || {})[nome] || {};
      var telPredef = p.telefono || (nome === 'Andrea' ? '41460039' : '');
      var chiama = telPredef ? '<a class="contatto" href="tel:' + esc(numeroChiamata((p.prefisso || '+39') + telPredef)) + '" aria-label="Chiama ' + esc(nome) + '">📞 Chiama</a>' : '';
      return '<div class="campo"><span>' + esc(nome) + ' ' + chiama + '</span><div class="due"><label class="campo">Prefisso<select class="sel-pers" name="' + nome + '_prefisso">' + C.opzioni(PREFISSI_DATI, p.prefisso || '+39') + '</select></label>' +
        '<label class="campo">Telefono<input type="tel" name="' + nome + '_telefono" value="' + esc(telPredef) + '"></label></div>' +
        '<div class="due">' + campo(nome + '_nome', 'Nome e cognome', p.nomeCompleto) + '<label class="campo">Data di nascita<input type="date" name="' + nome + '_nascita" value="' + esc(p.nascita || '') + '"></label></div>' +
        '<div class="due">' + campo(nome + '_email', 'Email', p.email, 'email') + campo(nome + '_cf', 'Codice fiscale', p.cf) + '</div></div>';
    }
    function docRiga(d) {
      var pf = (d.allegati || []).filter(function (a) { return /^image\//.test(a.mime || ''); })[0];
      return '<button type="button" class="sotto-card doc-riga" data-doc-modifica="' + esc(d.id) + '">' + (pf ? '<img class="doc-miniatura" data-anteprima="' + esc(pf.id) + '" data-mime="' + esc(pf.mime) + '" alt="" src="">' : '') + '<span class="sc-titolo">' + esc(d.tipo || 'Documento') + (d.numero ? ' · ' + esc(d.numero) : '') + (d.allegati && d.allegati.length ? ' · 🖼 ' + d.allegati.length : '') + '</span>' +
        (d.scadenza ? '<span class="sc-riga">Scade ' + esc(d.scadenza) + (d.rilasciatoDa ? ' · ' + esc(d.rilasciatoDa) : '') + '</span>' : (d.rilasciatoDa ? '<span class="sc-riga">' + esc(d.rilasciatoDa) + '</span>' : '')) + '</button>';
    }
  function filePersonali() { var l = (Store.settings().anagrafica || {}).file; return Array.isArray(l) ? l : []; }
  function fileRiga(x) {
    var n = (x.allegati || []).length, pdf = (x.allegati || []).some(function (a) { return /pdf/.test(a.mime || ''); });
    return '<button type="button" class="sotto-card doc-riga" data-file-apri="' + esc(x.id) + '"><span class="sc-titolo">' + (pdf ? '📄 ' : '📎 ') + esc(x.titolo || x.tipo || 'File') + '</span>' +
      '<span class="sc-riga">' + esc([x.tipo, x.data ? C.dataBreve(x.data) : '', n ? n + (n === 1 ? ' file' : ' file') : 'nessun file'].filter(Boolean).join(' · ')) + '</span></button>';
  }
  function areaPersonale(nome) {
    var a = Store.settings().anagrafica || {}, docs = (Array.isArray(a.documenti) ? a.documenti : []).filter(function (d) { return (d.persona || 'Andrea') === nome; });
    docs.sort(function (x, y) { return String(x.tipo || '').localeCompare(String(y.tipo || '')); });
    var files = filePersonali().filter(function (x) { return x.persona === nome; }).sort(function (x, y) { return (y.data || '') < (x.data || '') ? -1 : 1; });
    return '<div class="area-personale">' +
      '<form id="form-persona" data-persona="' + esc(nome) + '" class="sezione campi" style="display:grid;gap:12px">' + persona(nome) + '<div class="azioni"><button class="btn" type="submit">Salva i dati di ' + esc(nome) + '</button></div></form>' +
      '<h3 class="area-titolo">🪪 Documenti <small>' + docs.length + '</small></h3><div class="sezione">' + docs.map(docRiga).join('') +
        '<button type="button" class="btn secondario piccolo" data-doc-nuovo data-persona="' + esc(nome) + '">+ Aggiungi documento</button></div>' +
      '<h3 class="area-titolo">📄 File e PDF <small>' + files.length + '</small></h3><div class="sezione">' + (files.length ? files.map(fileRiga).join('') : '<p class="testo-muto">Curriculum, certificati, attestati, contratti… in PDF o in foto.</p>') +
        '<button type="button" class="btn secondario piccolo" data-file-nuovo data-persona="' + esc(nome) + '">+ Aggiungi file (curriculum, PDF…)</button></div>' +
      '</div>';
  }
  function apriFilePersonale(id, nomePersona) {
    var lista = filePersonali(), orig = id ? lista.filter(function (x) { return x.id === id; })[0] : null;
    var d = orig ? JSON.parse(JSON.stringify(orig)) : { id: C.nuovoId(), persona: nomePersona || 'Andrea', titolo: '', tipo: 'Curriculum', data: C.oggi(), note: '', allegati: [] };
    d.allegati = d.allegati || [];
    var wrap = { file: [d] }, ctx = 'anag|file|' + d.id, form = null;
    foglio.classList.remove('visore');
    function snap() { if (!form) return; d.titolo = form.titolo.value.trim(); d.tipo = form.tipo.value; d.data = form.data.value; d.note = form.note.value; d.persona = form.persona.value; }
    // nome del file in Drive: tipo - nome e cognome - titolo
    function nomeFile(originale) {
      var per = ((Store.settings().anagrafica || {}).persone || {})[d.persona] || {};
      var ext = (String(originale).match(/\.[A-Za-z0-9]+$/) || [''])[0];
      return [d.tipo || 'File', per.nomeCompleto || d.persona, d.titolo].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ') + ext;
    }
    function disegna() {
      foglio.innerHTML = '<form method="dialog" id="form-file"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica file' : 'Nuovo file') + ' · ' + esc(d.persona) + '</h3><div class="campi">' +
        '<div class="due"><label class="campo">Tipo<select class="sel-pers" name="tipo">' + C.opzioni(TIPI_FILE, d.tipo) + '</select></label><label class="campo">Di<select name="persona">' + C.opzioni(['Andrea', 'Cristina'], d.persona) + '</select></label></div>' +
        '<label class="campo">Titolo<input type="text" name="titolo" maxlength="100" value="' + esc(d.titolo) + '" placeholder="Es. Curriculum 2026"></label>' +
        '<label class="campo">Data<input type="date" name="data" value="' + esc(d.data || '') + '"></label>' +
        '<div class="campo-modo"><b>File</b><span class="aiuto">PDF o foto, anche più d\'uno. Si salvano nella cartella «A&amp;C Allegati» del Drive e si aprono anche senza rete dopo la prima volta.</span>' + Viaggi.htmlAllegati(d.allegati, ctx, 'Aggiungi PDF o foto') + '</div>' +
        '<label class="campo">Note<textarea name="note" maxlength="1000">' + esc(d.note || '') + '</textarea></label>' +
        '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
      form = $('#form-file', foglio);
      $('[data-chiudi]', form).onclick = function () { foglio.close(); };
      if (id) $('[data-elimina]', form).onclick = function () {
        if (!window.confirm('Eliminare «' + (orig.titolo || orig.tipo || 'File') + '»?' + ((orig.allegati || []).length ? ' I file andranno nel cestino di Drive.' : ''))) return;
        (orig.allegati || []).forEach(function (a) { Store.chiama('allegato_elimina', { id: a.id }).catch(function () {}); });
        salvaAnagrafica({ file: filePersonali().filter(function (x) { return x.id !== id; }) }); foglio.close(); toast('File eliminato');
      };
      form.querySelectorAll('[data-apri-allegato]').forEach(function (b) { b.onclick = function () { Viaggi.apriAllegato(b.dataset.apriAllegato, b.dataset.nome, b.dataset.mime); }; });
      form.querySelectorAll('[data-togli-allegato]').forEach(function (b) { b.onclick = function () {
        var idAll = b.dataset.togliAllegato.split('|').pop();
        if (confirm('Togliere questo file?')) { snap(); Viaggi.togli(wrap, ctx, idAll, false); disegna(); }
      }; });
      var inp = form.querySelector('[data-allega]');
      if (inp) inp.onchange = function () {
        snap();
        if (!d.titolo && inp.files && inp.files[0]) d.titolo = inp.files[0].name.replace(/\.[A-Za-z0-9]+$/, '');
        Viaggi.allega(wrap, ctx, inp.files, false, { nome: function (f) { return nomeFile(f.name); } }).then(disegna);
      };
      Viaggi.anteprime(form);
      form.onsubmit = function (e) {
        e.preventDefault(); snap();
        if (!d.titolo && !d.allegati.length) { form.titolo.focus(); return; }
        var nuovo = { id: d.id, persona: d.persona, titolo: d.titolo || d.tipo, tipo: d.tipo, data: d.data, note: d.note, allegati: d.allegati };
        var l = filePersonali(), nuova = l.some(function (x) { return x.id === d.id; }) ? l.map(function (x) { return x.id === d.id ? nuovo : x; }) : l.concat([nuovo]);
        salvaAnagrafica({ file: nuova }); foglio.close(); toast(id ? 'File salvato' : 'File aggiunto');
      };
    }
    disegna();
    foglio.showModal();
  }

  function indirizzoCasa(f) {
    var g = function (n) { return (f.elements[n] ? f.elements[n].value : '').trim(); };
    var via = [g('via'), g('civico')].filter(Boolean).join(' '), luogo = [g('cap'), g('comune')].filter(Boolean).join(' ');
    return [via, luogo, g('provincia'), 'Italia'].filter(Boolean).join(', ');
  }
  function initCasa() {
    var el = document.getElementById('mappa-casa'), nota = document.getElementById('casa-nota');
    if (!el || !window.L) return;
    if (casaMappa) { casaMappa.remove(); casaMappa = null; }
    var casa = casaDi(Store.settings().anagrafica || {});
    casaPosizione = (casa.lat != null && casa.lon != null) ? [casa.lat, casa.lon] : null;
    var m = L.map(el, { scrollWheelZoom: false }), marcatore = null;
    casaMappa = m;
    var base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Immagini © Esri' });
    L.control.layers({ 'Mappa': base, 'Satellite': sat }, null, { position: 'topright' }).addTo(m);
    function metti(ll) {
      casaPosizione = ll;
      var icona = L.divIcon({ className: 'pin-luogo', html: '<span style="--c:#1E7F8C">🏠</span>', iconSize: [38, 38], iconAnchor: [19, 19] });
      if (marcatore) marcatore.setLatLng(ll); else marcatore = L.marker(ll, { icon: icona }).addTo(m);
    }
    if (casaPosizione) { metti(casaPosizione); m.setView(casaPosizione, 16); } else m.setView([44.5, 11.3], 6);
    m.on('click', function (e) { metti([e.latlng.lat, e.latlng.lng]); if (nota) nota.textContent = 'Casa segnata. Premi «Salva i dati» per conservarla.'; });
    var loc = document.getElementById('loc-casa'), f = document.getElementById('form-dati');
    if (loc && f) loc.onclick = function () {
      var q = indirizzoCasa(f);
      if (nota) nota.textContent = 'Cerco l\'indirizzo…';
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'it' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j[0]) { var ll = [+j[0].lat, +j[0].lon]; metti(ll); m.setView(ll, 16); if (nota) nota.textContent = 'Indirizzo trovato: controlla il punto sulla mappa.'; }
          else if (nota) nota.textContent = 'Indirizzo non trovato: tocca la mappa per posizionare la casa.';
        })
        .catch(function () { if (nota) nota.textContent = 'Non riesco a cercare l\'indirizzo: tocca la mappa.'; });
    };
  }
  // Editor di ritaglio: la foto si sposta, si zooma e si ruota dentro il riquadro del documento.
  // Restituisce il File ritagliato, oppure null se l'utente annulla.
  function ritagliaManuale(file) {
    return new Promise(function (ok) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); toast('Questa foto non si può aprire: ' + (file.name || 'file')); ok(null); };
      img.onload = function () {
        // foto verticale (come scattata col telefono) e riquadro orizzontale: la raddrizzo da sola di 90°
        var rot = img.height > img.width ? 90 : 0, fine = 0, zoom = 1, ox = 0, oy = 0, W = 0, H = 0, fW = 0, fH = 0, fX = 0, fY = 0;
        var kP = Math.min(1, 900 / Math.max(img.width, img.height));
        var piccola = document.createElement('canvas');
        piccola.width = Math.max(2, Math.round(img.width * kP)); piccola.height = Math.max(2, Math.round(img.height * kP));
        piccola.getContext('2d').drawImage(img, 0, 0, piccola.width, piccola.height);
        var box = document.createElement('dialog');
        box.className = 'camera-guida ritaglio';
        box.innerHTML = '<div class="ritaglio-vista"><canvas></canvas><div class="camera-riquadro" aria-hidden="true"></div></div>' +
          '<div class="ritaglio-comandi"><button type="button" class="btn secondario piccolo" data-ruota="-90" aria-label="Ruota a sinistra">↺</button>' +
          '<button type="button" class="btn secondario piccolo" data-ruota="90" aria-label="Ruota a destra">↻</button>' +
          '<label class="ritaglio-zoom">Zoom <input type="range" min="1" max="4" step="0.01" value="1" data-zoom></label>' +
          '<label class="ritaglio-zoom">Raddrizza <input type="range" min="-15" max="15" step="0.1" value="0" data-raddrizza> <span data-gradi>0°</span></label></div>' +
          '<p class="camera-suggerimento">Trascina e zooma per mettere il documento nel riquadro</p>' +
          '<div class="camera-azioni"><button class="btn secondario" type="button" data-annulla-rit>Annulla</button><button class="btn" type="button" data-usa-rit>Usa questa foto</button></div>';
        document.body.appendChild(box);
        box.addEventListener('cancel', function (e) { e.preventDefault(); var b = box.querySelector('[data-annulla-rit],[data-annulla-cam],[data-annulla-mappa]'); if (b) b.click(); });
        box.showModal();
        var cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), vista = box.querySelector('.ritaglio-vista');
        var ov = vista.querySelector('.camera-riquadro'), slider = box.querySelector('[data-zoom]');
        function misura() {
          W = Math.round(Math.min(window.innerWidth - 24, 560)); H = Math.round(Math.min(window.innerHeight * 0.6, W * 1.3));
          cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px'; vista.style.width = W + 'px'; vista.style.height = H + 'px';
          fW = W * 0.86; fH = fW / 1.586;
          if (fH > H * 0.9) { fH = H * 0.9; fW = fH * 1.586; }
          fX = (W - fW) / 2; fY = (H - fH) / 2;
          ov.style.cssText = 'left:' + fX + 'px;top:' + fY + 'px;width:' + fW + 'px;height:' + fH + 'px;transform:none;aspect-ratio:auto;';
        }
        // disegna l'immagine nel riquadro; f = fattore di scala, (dx,dy) = origine del riquadro sul contesto
        function disegna(c, f, dx, dy, colore, larg, alt, src) {
          var sorg = src || img;
          c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = colore; c.fillRect(0, 0, larg, alt);
          c.setTransform(f, 0, 0, f, dx, dy);
          // angolo totale = rotazione di 90° + raddrizzamento fine; la scala copre il riquadro anche ruotata
          var angolo = (rot + fine) * Math.PI / 180, cosA = Math.abs(Math.cos(angolo)), sinA = Math.abs(Math.sin(angolo));
          var bw = sorg.width * cosA + sorg.height * sinA, bh = sorg.width * sinA + sorg.height * cosA;
          var base = Math.max(fW / bw, fH / bh) * zoom;
          c.translate(fW / 2 + ox, fH / 2 + oy); c.rotate(angolo); c.scale(base, base);
          c.drawImage(sorg, -sorg.width / 2, -sorg.height / 2);
        }
        // anteprima leggera (foto ridotta) e un solo disegno per fotogramma: la foto piena si usa solo al salvataggio
        var inCorso = false;
        function anteprima() {
          if (inCorso) return; inCorso = true;
          requestAnimationFrame(function () { inCorso = false; disegna(ctx, 1, fX, fY, '#000', W, H, piccola); });
        }
        misura(); anteprima();
        // trascinamento e pizzico con due dita
        var punti = {}, distPrec = 0, ultimo = null;
        cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); punti[e.pointerId] = { x: e.clientX, y: e.clientY }; ultimo = null; });
        cv.addEventListener('pointermove', function (e) {
          if (!punti[e.pointerId]) return;
          punti[e.pointerId] = { x: e.clientX, y: e.clientY };
          var ids = Object.keys(punti);
          if (ids.length >= 2) {
            var p1 = punti[ids[0]], p2 = punti[ids[1]], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            if (distPrec) zoom = Math.max(1, Math.min(4, zoom * d / distPrec));
            distPrec = d; slider.value = zoom;
          } else {
            if (ultimo) { ox += e.clientX - ultimo.x; oy += e.clientY - ultimo.y; }
            ultimo = { x: e.clientX, y: e.clientY };
          }
          anteprima();
        });
        function fineTocco(e) { delete punti[e.pointerId]; distPrec = 0; ultimo = null; }
        cv.addEventListener('pointerup', fineTocco); cv.addEventListener('pointercancel', fineTocco);
        cv.addEventListener('wheel', function (e) { e.preventDefault(); zoom = Math.max(1, Math.min(4, zoom - e.deltaY * 0.002)); slider.value = zoom; anteprima(); }, { passive: false });
        slider.oninput = function () { zoom = +slider.value; anteprima(); };
        var raddrizza = box.querySelector('[data-raddrizza]'), gradi = box.querySelector('[data-gradi]');
        raddrizza.oninput = function () { fine = +raddrizza.value; gradi.textContent = fine.toFixed(1) + '°'; anteprima(); };
        box.querySelectorAll('[data-ruota]').forEach(function (b) { b.onclick = function () { rot = (rot + (+b.dataset.ruota) + 360) % 360; anteprima(); }; });
        function chiudi() { URL.revokeObjectURL(url); box.close(); box.remove(); window.removeEventListener('resize', misura); }
        box.querySelector('[data-annulla-rit]').onclick = function () { chiudi(); ok(null); };
        box.querySelector('[data-usa-rit]').onclick = function () {
          var out = document.createElement('canvas'), L = 1400, A = Math.round(L / 1.586);
          out.width = L; out.height = A;
          disegna(out.getContext('2d'), L / fW, 0, 0, '#fff', L, A);
          chiudi();
          out.toBlob(function (b) { ok(b ? new File([b], 'documento-' + Date.now() + '.jpg', { type: 'image/jpeg' }) : null); }, 'image/jpeg', 0.92);
        };
        window.addEventListener('resize', function () { misura(); anteprima(); });
      };
      img.src = url;
    });
  }
  // Fotocamera con riquadro: il documento va centrato nel riquadro e viene ritagliato al suo interno.
  // Autofocus continuo quando il telefono lo permette, tocco per mettere a fuoco, e scatto con la foto vera
  // della fotocamera (ImageCapture.takePhoto: piena risoluzione e messa a fuoco) invece di un fotogramma del video.
  function scattaConRiquadro() {
    return new Promise(function (ok, ko) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return ko(new Error('Fotocamera non disponibile'));
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false }).then(function (flusso) {
        var traccia = flusso.getVideoTracks()[0], caps = {};
        try { caps = traccia.getCapabilities ? traccia.getCapabilities() : {}; } catch (e) { caps = {}; }
        var modi = caps.focusMode || [];
        function fuocoContinuo() {
          if (modi.indexOf('continuous') >= 0) return traccia.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
          return Promise.resolve();
        }
        fuocoContinuo();
        var box = document.createElement('dialog');
        box.className = 'camera-guida';
        box.innerHTML = '<div class="camera-vista"><video playsinline muted></video><div class="camera-riquadro" aria-hidden="true"></div><span class="camera-fuoco" aria-hidden="true"></span></div>' +
          '<p class="camera-suggerimento">Centra il documento nel riquadro, senza riflessi.<br><small>Tocca il documento per mettere a fuoco.</small></p>' +
          '<div class="camera-azioni"><button class="btn secondario" type="button" data-annulla-cam>Annulla</button><button class="btn" type="button" data-scatta-cam>Scatta</button></div>' +
          '<button class="camera-nativa" type="button" data-nativa-cam>📷 Usa la fotocamera del telefono</button>';
        document.body.appendChild(box);
        box.addEventListener('cancel', function (e) { e.preventDefault(); var b = box.querySelector('[data-annulla-rit],[data-annulla-cam],[data-annulla-mappa]'); if (b) b.click(); });
        box.showModal();
        var video = box.querySelector('video'), vista = box.querySelector('.camera-vista'), anello = box.querySelector('.camera-fuoco');
        var chiuso = false;
        function chiudi() { if (chiuso) return; chiuso = true; flusso.getTracks().forEach(function (t) { t.stop(); }); box.close(); box.remove(); }
        video.onloadedmetadata = function () { vista.style.aspectRatio = video.videoWidth + ' / ' + video.videoHeight; };
        video.srcObject = flusso; video.play().catch(function () {});
        // tocco per mettere a fuoco (dove il telefono lo permette), poi torna al fuoco continuo
        var ritorno = null;
        vista.addEventListener('click', function (e) {
          var r = vista.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          anello.style.left = (x * 100) + '%'; anello.style.top = (y * 100) + '%';
          anello.classList.remove('attivo'); void anello.offsetWidth; anello.classList.add('attivo');
          var vincoli = {};
          if (caps.pointsOfInterest) vincoli.pointsOfInterest = [{ x: x, y: y }];
          if (modi.indexOf('single-shot') >= 0) vincoli.focusMode = 'single-shot';
          else if (modi.indexOf('continuous') >= 0) vincoli.focusMode = 'continuous';
          if (Object.keys(vincoli).length) traccia.applyConstraints({ advanced: [vincoli] }).catch(function () {});
          clearTimeout(ritorno); ritorno = setTimeout(fuocoContinuo, 2500);
        });
        box.querySelector('[data-annulla-cam]').onclick = function () { chiudi(); ko(new Error('annullato')); };
        box.querySelector('[data-nativa-cam]').onclick = function () { chiudi(); ko(new Error('nativa')); };
        // ritaglio del riquadro: 82% della larghezza dell'inquadratura, proporzione carta d'identità (1,586)
        function ritaglia(sorgente, sw, sh) {
          var vw = video.videoWidth || sw, vh = video.videoHeight || sh;
          // la foto può avere proporzioni diverse dal video: l'inquadratura è la parte centrale della foto
          var iw = sw, ih = sw * vh / vw;
          if (ih > sh) { ih = sh; iw = sh * vw / vh; }
          var ix = (sw - iw) / 2, iy = (sh - ih) / 2;
          var rw = iw * 0.82, rh = rw / 1.586;
          if (rh > ih * 0.9) { rh = ih * 0.9; rw = rh * 1.586; }
          var rx = ix + (iw - rw) / 2, ry = iy + (ih - rh) / 2;
          var scala = Math.min(1, 2400 / rw);
          var cv = document.createElement('canvas'); cv.width = Math.round(rw * scala); cv.height = Math.round(rh * scala);
          cv.getContext('2d').drawImage(sorgente, rx, ry, rw, rh, 0, 0, cv.width, cv.height);
          return cv;
        }
        function consegna(cv) {
          cv.toBlob(function (b) { if (!b) return ko(new Error('scatto non riuscito')); ok(new File([b], 'scatto-' + Date.now() + '.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
        }
        function daVideo() {
          var vw = video.videoWidth, vh = video.videoHeight;
          if (!vw || !vh) return false;
          var cv = ritaglia(video, vw, vh); chiudi(); consegna(cv); return true;
        }
        var bScatta = box.querySelector('[data-scatta-cam]');
        bScatta.onclick = function () {
          if (!video.videoWidth) return;
          if (!window.ImageCapture) { daVideo(); return; }
          bScatta.disabled = true; bScatta.textContent = 'Metto a fuoco…';
          var ic;
          try { ic = new window.ImageCapture(traccia); } catch (e) { daVideo(); return; }
          ic.takePhoto().then(function (blob) {
            return (window.createImageBitmap ? createImageBitmap(blob) : Promise.reject()).then(function (img) {
              var cv = ritaglia(img, img.width, img.height); chiudi(); consegna(cv);
            });
          }).catch(function () { if (!daVideo()) { bScatta.disabled = false; bScatta.textContent = 'Scatta'; } });
        };
      }).catch(ko);
    });
  }
  function b64Di(blob) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = function () { ko(r.error); }; r.readAsDataURL(blob); });
  }
  // cerca nel testo letto numero, date e autorità di rilascio; nascita (AAAA-MM-GG) esclusa dalle date
  // è una stima: i dati vanno sempre controllati prima di salvare
  function leggiDatiDocumento(testo, nascita) {
    var t = String(testo || '').replace(/\s+/g, ' ');
    var out = { numero: '', rilascio: '', scadenza: '', rilasciatoDa: '' };
    var n = t.match(/\b[A-Z]{2}\d{5}[A-Z]{2}\b/) || t.match(/\b[A-Z]{2}\d{7}\b/) || t.match(/\b[A-Z]\d{7}[A-Z]\b/);
    if (n) out.numero = n[0];
    function iso(g) { return g[3] + '-' + g[2] + '-' + g[1]; }
    var re = /\b(\d{2})[\/.\- ](\d{2})[\/.\- ](\d{4})\b/g, m, date = [];
    while ((m = re.exec(t))) if (iso(m) !== nascita) date.push(iso(m));
    function dopo(parola) {
      var x = t.match(new RegExp(parola + '[^0-9]{0,40}(\\d{2})[\\/.\\- ](\\d{2})[\\/.\\- ](\\d{4})', 'i'));
      return x ? iso(x) : '';
    }
    out.scadenza = dopo('scadenza') || (date.length ? date.slice().sort().slice(-1)[0] : '');
    out.rilascio = dopo('rilasci[oa]');
    var c = t.match(/(Comune di|Questura di|Prefettura di|Motorizzazione civile di)\s+[A-Za-zÀ-ÿ' ]{2,30}/i);
    if (c) out.rilasciatoDa = c[0].replace(/\s+(Data|Numero|Cognome|Nome|Nato|Sesso|scadenza|rilasci\w*)\b.*$/i, '').trim();
    return out;
  }
  function apriDocumento(id, personaScelta) {
    var lista = ((Store.settings().anagrafica || {}).documenti || []), orig = id ? lista.filter(function (x) { return x.id === id; })[0] : null;
    var d = orig ? JSON.parse(JSON.stringify(orig)) : { id: C.nuovoId(), tipo: TIPI_DOCUMENTO[0], persona: 'Andrea', numero: '', rilascio: '', scadenza: '', rilasciatoDa: '', allegati: [] };
    d.allegati = d.allegati || [];
    d.persona = d.persona || personaScelta || 'Andrea';
    if (!id && personaScelta) d.persona = personaScelta;
    var wrap = { documenti: [d] }, ctx = 'anag|documenti|' + d.id, form = null, PERSONE = ['Andrea', 'Cristina'];
    foglio.classList.remove('visore');
    // ricopia nel documento ciò che è scritto nel form, così il ridisegno non perde le modifiche
    function snap() {
      if (!form) return;
      d.tipo = form.tipo.value; d.persona = form.persona.value; d.numero = form.numero.value.trim();
      d.rilascio = form.rilascio.value; d.scadenza = form.scadenza.value; d.rilasciatoDa = form.rilasciatoDa.value.trim();
    }
    // nome del file in Drive: tipo - nome e cognome - data di nascita - lato
    function nomeFile(lato, originale, i) {
      var per = ((Store.settings().anagrafica || {}).persone || {})[d.persona] || {};
      var ext = (String(originale).match(/\.[A-Za-z0-9]+$/) || [''])[0];
      var parti = [d.tipo || 'Documento', per.nomeCompleto || d.persona];
      if (per.nascita) parti.push(per.nascita);
      parti.push(lato === 'Altro' ? 'altro ' + (i + 1) : lato.toLowerCase());
      return parti.join(' - ') + ext;
    }
    function disegna() {
      foglio.innerHTML = '<form method="dialog" id="form-documento"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica documento' : 'Nuovo documento') + '</h3><div class="campi">' +
        '<label class="campo">Tipo<select class="sel-pers" name="tipo">' + C.opzioni(TIPI_DOCUMENTO, d.tipo) + '</select></label>' +
        '<label class="campo">Intestato a<select class="sel-pers" name="persona">' + C.opzioni(PERSONE, d.persona) + '</select><span class="aiuto">Nome e data di nascita si prendono dall\'area personale.</span></label>' +
        '<label class="campo">Numero<input type="text" name="numero" maxlength="60" value="' + esc(d.numero) + '"></label>' +
        '<div class="due"><label class="campo">Data di rilascio<input type="date" name="rilascio" value="' + esc(d.rilascio) + '"></label><label class="campo">Data di scadenza<input type="date" name="scadenza" value="' + esc(d.scadenza) + '"></label></div>' +
        '<label class="campo">Rilasciato da<input type="text" name="rilasciatoDa" maxlength="120" value="' + esc(d.rilasciatoDa) + '" placeholder="Es. Comune di Bertinoro"></label>' +
        '<div class="campo"><span>Foto (fronte e retro)</span><span class="aiuto">Puoi aggiungerne più d\'una. Restano salvate nell\'area Allegati del foglio.</span>' + Viaggi.htmlAllegati(d.allegati, ctx, 'Aggiungi foto') + '<div class="azioni-foto"><button type="button" class="btn secondario piccolo" data-scatta>📷 Scatta con riquadro</button><button type="button" class="btn secondario piccolo" data-ocr>🔍 Leggi dati dalle foto</button><input type="file" accept="image/*" capture="environment" data-scatta-file class="sr" tabindex="-1"></div><div id="scelta-lati"></div></div>' +
        '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
      form = $('#form-documento', foglio);
      $('[data-chiudi]', form).onclick = function () { foglio.close(); };
      if (id) $('[data-elimina]', form).onclick = function () {
        if (!window.confirm('Eliminare il documento «' + (orig.tipo || 'Documento') + '»?')) return;
        if ((orig.allegati || []).length && !window.confirm('Conferma di nuovo: le foto del documento andranno nel cestino di Drive.')) return;
        (orig.allegati || []).forEach(function (a) { Store.chiama('allegato_elimina', { id: a.id }).catch(function () {}); });
        salvaAnagrafica({ documenti: lista.filter(function (x) { return x.id !== id; }) }); foglio.close(); toast('Documento eliminato');
      };
      form.querySelectorAll('[data-apri-allegato]').forEach(function (b) { b.onclick = function () { Viaggi.apriAllegato(b.dataset.apriAllegato, b.dataset.nome, b.dataset.mime); }; });
      form.querySelectorAll('[data-togli-allegato]').forEach(function (b) { b.onclick = function () {
        var idAll = b.dataset.togliAllegato.split('|').pop();
        if (confirm('Togliere questa foto?')) { snap(); Viaggi.togli(wrap, ctx, idAll, false); disegna(); }
      }; });
      var inp = form.querySelector('[data-allega]'), scelta = form.querySelector('#scelta-lati');
      function elaboraFile(files) {
        return files.reduce(function (p, f) {
          return p.then(function (acc) { return ritagliaManuale(f).then(function (r) { if (r) acc.push(r); return acc; }); });
        }, Promise.resolve([]));
      }
      // le foto in attesa si accumulano: aggiungerne una nuova non fa perdere quelle ancora da caricare
      var inAttesa = [];
      function sceltaFile(files) {
        if (!files.length) return;
        snap();
        inAttesa = inAttesa.concat(files);
        scelta.innerHTML = '<div class="campo"><span>Di quale lato sono?</span>' + inAttesa.map(function (x, i) {
          return '<label class="campo">' + esc(x.name) + '<select class="sel-pers" data-lato="' + i + '">' + C.opzioni(['Fronte', 'Retro', 'Altro']) + '</select></label>';
        }).join('') +
          '<div class="azioni"><button class="btn" type="button" data-carica-lati>Carica</button><button class="btn secondario" type="button" data-annulla-lati>Annulla</button></div></div>';
        scelta.querySelector('[data-annulla-lati]').onclick = function () { inAttesa = []; scelta.innerHTML = ''; inp.value = ''; };
        scelta.querySelector('[data-carica-lati]').onclick = function () {
          var daCaricare = inAttesa.slice();
          var lati = Array.prototype.map.call(scelta.querySelectorAll('[data-lato]'), function (s) { return s.value; });
          var nomi = lati.map(function (l, i) { return nomeFile(l, daCaricare[i].name, i); });
          inAttesa = []; scelta.innerHTML = '';
          Viaggi.allega(wrap, ctx, daCaricare, false, {
            nome: function (x) { return nomi[daCaricare.indexOf(x)]; },
            extra: function (x) { return { lato: lati[daCaricare.indexOf(x)] }; }
          }).then(disegna);
        };
      }
      if (inp) inp.onchange = function () { elaboraFile(Array.prototype.slice.call(inp.files || [])).then(function (fs) { if (fs.length) sceltaFile(fs); }); };
      var scatta = form.querySelector('[data-scatta]'), scattaFile = form.querySelector('[data-scatta-file]');
      if (scatta) scatta.onclick = function () {
        scattaConRiquadro().then(function (f) { return elaboraFile([f]); }).then(function (fs) { if (fs.length) sceltaFile(fs); })
          .catch(function (err) { if (err && err.message === 'annullato') return; if (scattaFile) scattaFile.click(); });
      };
      if (scattaFile) scattaFile.onchange = function () { var f = scattaFile.files[0]; if (f) elaboraFile([f]).then(function (fs) { if (fs.length) sceltaFile(fs); }); };
      // legge il testo delle foto già caricate e propone i dati da controllare
      var ocrBtn = form.querySelector('[data-ocr]');
      if (ocrBtn) ocrBtn.onclick = function () {
        snap();
        var foto = d.allegati.filter(function (a) { return a.mime && a.mime.indexOf('image/') === 0; });
        if (!foto.length) { toast('Carica prima una foto del documento'); return; }
        toast('Leggo il testo della foto…');
        Promise.all(foto.map(function (a) {
          return Viaggi.blobAllegato(a.id, a.mime).then(function (bl) { return b64Di(bl); })
            .then(function (b64) { return Store.chiama('ocr', { dati: b64, mime: 'image/jpeg' }); })
            .then(function (r) { return r.testo || ''; });
        })).then(function (testi) {
          var testo = testi.join('\n');
          var letti = leggiDatiDocumento(testo, (((Store.settings().anagrafica || {}).persone || {})[d.persona] || {}).nascita);
          var righe = [['Numero', letti.numero], ['Data di rilascio', letti.rilascio], ['Data di scadenza', letti.scadenza], ['Rilasciato da', letti.rilasciatoDa]];
          scelta.innerHTML = '<div class="campo"><span>Dati letti dalle foto: controllali prima di usarli</span>' +
            righe.map(function (r) { return '<span class="aiuto">' + r[0] + ': ' + (r[1] ? esc(r[1]) : 'non trovato') + '</span>'; }).join('') +
            '<details><summary class="aiuto">Testo letto</summary><pre class="aiuto" style="white-space:pre-wrap">' + esc(testo || 'nessun testo') + '</pre></details>' +
            '<div class="azioni"><button class="btn" type="button" data-usa-letti>Usa questi dati</button><button class="btn secondario" type="button" data-chiudi-letti>Chiudi</button></div></div>';
          scelta.querySelector('[data-chiudi-letti]').onclick = function () { scelta.innerHTML = ''; };
          scelta.querySelector('[data-usa-letti]').onclick = function () {
            if (letti.numero) form.numero.value = letti.numero;
            if (letti.rilascio) form.rilascio.value = letti.rilascio;
            if (letti.scadenza) form.scadenza.value = letti.scadenza;
            if (letti.rilasciatoDa) form.rilasciatoDa.value = letti.rilasciatoDa;
            scelta.innerHTML = ''; toast('Dati inseriti: controlla e salva');
          };
        }).catch(function (e) { toast('Lettura non riuscita: ' + (e.message || e)); });
      };
      Viaggi.anteprime(foglio);
      form.onsubmit = function (e) {
        e.preventDefault();
        snap();
        // rinomina su Drive le foto del documento con il nome aggiornato (le vecchie senza lato: 1ª fronte, 2ª retro)
        var rinomine = d.allegati.map(function (a, i) {
          if (!a.lato) a.lato = i === 0 ? 'Fronte' : i === 1 ? 'Retro' : 'Altro';
          var voce = nomeFile(a.lato, a.nome, i);
          if (a.nome === voce) return Promise.resolve();
          return Promise.resolve().then(function () { return Store.chiama('allegato_rinomina', { id: a.id, nome: voce }); })
            .then(function () { a.nome = voce; }).catch(function () {});
        });
        Promise.all(rinomine).then(function () {
          var nuovo = { id: d.id, tipo: d.tipo, persona: d.persona, numero: d.numero, rilascio: d.rilascio, scadenza: d.scadenza, rilasciatoDa: d.rilasciatoDa, allegati: d.allegati };
          var nuova = id ? lista.map(function (x) { return x.id === id ? nuovo : x; }) : lista.concat([nuovo]);
          salvaAnagrafica({ documenti: nuova }); foglio.close(); toast(id ? 'Documento salvato' : 'Documento aggiunto');
        });
      };
    }
    disegna();
    foglio.showModal();
  }

  function vistaAltro() {
    var conf = Store.conf(), st = Store.stato(), s = Store.settings();
    var h = testata('Altro', 'Impostazioni e app');
    h += '<h2>Aggiornamento app</h2><div class="sezione"><p class="testo-muto" style="margin:0 0 10px">Scarica l\'APK più recente, installalo sopra quella attuale e poi eliminalo dalla cartella Download.</p>' +
      '<a class="btn" href="https://github.com/andreaecristina2023/4giugno2026/releases/download/app/Casa.apk" download="Casa.apk" target="_blank" rel="noopener">⬇ Scarica l\'APK</a></div>';
    h += '<h2>Chi sta usando questo telefono</h2><div class="schede" role="group" aria-label="Persona">' + s.persone.map(function (p) { return '<button type="button" data-chi="' + esc(p) + '" aria-pressed="' + (conf.chi === p) + '">' + esc(p) + '</button>'; }).join('') + '</div>';

    h += datiPersonali(s);
    h += '<h2>Condivisione tra i telefoni</h2><div class="sezione">';
    if (Store.configurato()) {
      h += '<p>Collegato al Google Sheet. ' + (st.ultimo ? 'Ultima sincronizzazione: ' + new Date(st.ultimo).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) + '.' : '') + '</p>';
      if (st.errore) h += '<p style="color:var(--sangiovese)">' + esc(st.errore) + '</p>';
      h += '</div><h2>Collega un altro telefono</h2><div class="sezione"><p>Mostra il QR code all\'altro telefono: nell\'app lo inquadri con "Inquadra QR" qui sotto, dal browser basta la fotocamera. In alternativa manda il link (per esempio su WhatsApp).</p><p class="testo-muto">Il link contiene la chiave: mandalo solo a chi deve vedere i dati di casa.</p>' +
        '<div class="azioni"><button class="btn" type="button" data-azione="mostra-qr">Mostra QR code</button>' + (navigator.share ? '<button class="btn secondario" type="button" data-azione="condividi-link">Condividi il link</button>' : '') + '<button class="btn secondario" type="button" data-azione="copia-link">Copia il link</button></div></div><div class="sezione" style="margin-top:12px">';
    } else h += '<p>Ora i dati restano solo su questo telefono. Collega lo script del Google Sheet per vederli in due (istruzioni nel README del repository).</p>';
    h += '<form id="form-collega" class="campi"><label class="campo">Indirizzo dello script<span class="aiuto">Oppure incolla qui il link di collegamento ricevuto dall\'altro telefono.</span><input type="text" inputmode="url" name="url" value="' + esc(conf.url) + '" placeholder="https://script.google.com/macros/s/…/exec" required></label>' +
      '<label class="campo">Chiave<span class="aiuto">Non serve se hai incollato il link di collegamento. È nel foglio Google «Casa», scheda «Impostazioni» in basso, cella B1. Compare dopo aver eseguito la funzione setup nello script.</span><input type="password" name="chiave" value="' + esc(conf.chiave) + '" autocomplete="off"></label>' +
      '<div class="azioni"><button class="btn" type="submit">Collega e sincronizza</button><button class="btn secondario" type="button" data-azione="scansiona-qr">Inquadra QR</button>' + (Store.configurato() ? '<button class="btn secondario" type="button" data-azione="scollega">Scollega</button>' : '') + '</div></form></div>';

    h += '<h2>Promemoria</h2><div class="sezione">';
    if (Native.isApp) h += '<p>L\'app programma da sola le notifiche dei prossimi 21 giorni: bidoni la sera prima alle ' + esc(rifiuti().oraAvviso || '20:00') + ', pagamenti 2 giorni prima e il giorno stesso alle 9, appuntamenti con l\'anticipo scelto.</p><div class="azioni"><button class="btn secondario" type="button" data-azione="permesso">Controlla il permesso notifiche</button></div>';
    else h += '<p>Nel browser l\'avviso arriva solo a sito aperto. Per le notifiche vere installa l\'app Android, oppure attiva il bot Telegram nello script.</p><div class="azioni"><a class="btn" href="' + REPO + '/releases/latest" target="_blank" rel="noopener">Scarica l\'app Android</a><button class="btn secondario" type="button" data-azione="permesso">Attiva avvisi nel browser</button></div>';
    h += '</div>';

    h += '<h2>Backup</h2><div class="sezione"><p>Salva tutto in un file o ripristinalo (utile anche per passare i dati all\'altro telefono senza script).</p><div class="azioni"><button class="btn secondario" type="button" data-azione="esporta">Esporta i dati</button><label class="btn secondario">Importa un file<input type="file" accept="application/json,.json" data-azione="importa" class="sr"></label></div></div>';
    var areaScelta = ui.area || (s.persone.indexOf(conf.chi) >= 0 ? conf.chi : 'Andrea');
    h += '<h2>Aree personali</h2><div class="schede" role="group" aria-label="Area personale">' + ['Andrea', 'Cristina'].map(function (p) { return '<button type="button" data-area="' + esc(p) + '" aria-pressed="' + (areaScelta === p) + '">👤 ' + esc(p) + '</button>'; }).join('') + '</div>' + areaPersonale(areaScelta);
    h += '<p class="testo-muto" style="margin-top:24px">' + voci().length + ' voci salvate · <a href="' + REPO + '" target="_blank" rel="noopener">codice su GitHub</a></p>';
    vista.innerHTML = h;
  }

  // ---------- FORM VOCE ----------
  var CAT_VEICOLO = ['Bollo auto/moto', 'Assicurazione', 'Revisione', 'Auto'];
  var RIPETI_CAT = { 'Bollo auto/moto': '1 anni', 'Assicurazione': '1 anni', 'Revisione': '2 anni' };
  function selUnita(nome, lista, scelta) {
    return '<select name="' + nome + '" aria-label="Unità">' + lista.map(function (u) { return '<option value="' + u + '"' + (u === scelta ? ' selected' : '') + '>' + C.UNITA[u].piu + '</option>'; }).join('') + '</select>';
  }
  function apriVoce(id, pre) {
    var it = id ? JSON.parse(JSON.stringify(Store.get(id))) : Object.assign({ tipo: 'appuntamento', titolo: '', data: C.oggi(), ora: '', ricorrenza: '', importo: '', categoria: '', chi: '', note: '', avviso: '', targa: '' }, pre || {});
    if (!it.annotazioni) it.annotazioni = it.note ? [{ testo: it.note, quando: '' }] : [];
    if (!it.annotazioni.length) it.annotazioni.push({ testo: '', quando: '' });
    var s = Store.settings();
    var targhe = {};
    Store.lista().forEach(function (v) { if (v.targa) targhe[v.targa] = true; });
    function render() {
      var conImporto = it.tipo === 'pagamento' || it.tipo === 'scadenza';
      var rip = C.leggiDurata(it.ricorrenza) || { n: '', u: 'mesi' };
      var avv = C.leggiDurata(it.avviso) || { n: '', u: it.tipo === 'appuntamento' ? 'ore' : 'giorni' };
      var predef = { appuntamento: '1 ora', pagamento: '2 giorni', scadenza: '2 giorni', promemoria: 'nessun anticipo' }[it.tipo];
      var veicolo = conImporto && (CAT_VEICOLO.indexOf(it.categoria) >= 0 || it.targa);
      foglio.innerHTML = '<form method="dialog" id="form-voce"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica' : 'Nuova voce') + '</h3><div class="campi">' +
        '<div class="tipi" role="group" aria-label="Tipo">' + C.TIPI_BASE.map(function (t) { return '<button type="button" data-tipo="' + t + '" style="--c:' + COLORE_TIPO[t] + '" aria-pressed="' + (it.tipo === t) + '">' + C.TIPI[t].nome + '</button>'; }).join('') + '</div>' +
        '<label class="campo">Titolo<input type="text" name="titolo" required maxlength="120" value="' + esc(it.titolo) + '" placeholder="' + { appuntamento: 'Es. Dentista Cristina', pagamento: 'Es. Spese condominiali', scadenza: 'Es. Revisione Panda', promemoria: 'Es. Cambiare filtro caldaia' }[it.tipo] + '"></label>' +
        '<div class="due"><label class="campo">' + (conImporto ? 'Scadenza' : 'Data') + '<input type="date" name="data" required value="' + esc(it.data) + '"></label><label class="campo">Ora<input type="time" name="ora" value="' + esc(it.ora) + '"></label></div>' +
        (conImporto ? '<div class="due"><label class="campo">Importo €<input type="number" name="importo" inputmode="decimal" step="0.01" min="0" value="' + esc(it.importo) + '"></label><label class="campo">Categoria<select class="sel-pers" name="categoria">' + C.opzioni(s.categorie, it.categoria, '') + '</select></label></div>'
          : '<label class="campo">Categoria<select class="sel-pers" name="categoria">' + C.opzioni(s.categorie, it.categoria, '') + '</select></label>') +
        (veicolo ? '<label class="campo">Targa<span class="aiuto">Auto o moto a cui si riferisce.</span><input type="text" name="targa" list="lista-targhe" maxlength="12" autocapitalize="characters" value="' + esc(it.targa || '') + '" placeholder="Es. AB123CD"><datalist id="lista-targhe">' + Object.keys(targhe).map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></label>' : '') +
        '<div class="due"><label class="campo">Ripeti ogni<span class="durata"><input type="number" name="ripN" min="0" max="999" inputmode="numeric" value="' + esc(rip.n) + '" placeholder="—" aria-label="Quanti">' + selUnita('ripU', C.UNITA_RIPETI, rip.u) + '</span></label>' +
        '<label class="campo">Fino al<input type="date" name="fine" value="' + esc(it.fine || '') + '"' + (rip.n ? '' : ' disabled') + '></label></div>' +
        '<label class="campo">Avviso prima<span class="aiuto">Vuoto = ' + predef + (it.tipo === 'appuntamento' ? ' prima' : (it.tipo === 'promemoria' ? '' : ' prima, più il giorno stesso')) + '.</span><span class="durata"><input type="number" name="avvN" min="0" max="999" inputmode="numeric" value="' + esc(avv.n) + '" placeholder="—" aria-label="Quanti">' + selUnita('avvU', C.UNITA_AVVISO, avv.u) + '</span></label>' +
        '<label class="campo">Per chi<select class="sel-pers" name="chi">' + C.opzioni(s.persone, it.chi, 'Tutti e due') + '</select></label>' +
        '<div class="due"><label class="campo">Telefono<input type="tel" name="telefono" value="' + esc(it.telefono || '') + '"></label><label class="campo">Email<input type="email" name="email" value="' + esc(it.email || '') + '"></label></div>' +
        '<label class="campo">Indirizzo<input type="text" name="indirizzo" maxlength="160" value="' + esc(it.indirizzo || '') + '"></label>' +
        '<div class="posizione-azioni"><button type="button" class="btn secondario piccolo" data-mappa-voce>📍 ' + (it.lat != null ? 'Cambia posizione' : 'Scegli sulla mappa') + '</button>' +
          (it.lat != null ? '<span class="testo-muto">Posizione segnata</span><button type="button" class="btn secondario piccolo" data-mappa-togli>Togli</button>' : '') +
          Native.linkNaviga(it.lat != null && it.lon != null ? { lat: it.lat, lon: it.lon } : (it.indirizzo ? { q: it.indirizzo } : null), '🧭 Naviga', 'btn secondario piccolo') + '</div>' +
        '<div class="campo"><span>Note</span><div class="note-elenco">' + it.annotazioni.map(function (n, i) {
          return '<div class="nota-riga"><input type="text" name="ntesto" maxlength="300" value="' + esc(n.testo) + '" placeholder="Es. Portare la tessera sanitaria" aria-label="Nota ' + (i + 1) + '">' +
            '<input type="datetime-local" name="nquando" value="' + esc(n.quando) + '" aria-label="Promemoria nota ' + (i + 1) + ' (facoltativo)">' +
            '<button class="btn icona" type="button" data-nota-piu aria-label="Aggiungi nota">+</button>' +
            (it.annotazioni.length > 1 ? '<button class="btn icona secondario" type="button" data-nota-meno="' + i + '" aria-label="Togli nota">−</button>' : '<span class="nota-spazio" aria-hidden="true"></span>') + '</div>';
        }).join('') + '</div><span class="aiuto">Con un orario la nota diventa un promemoria.</span></div>' +
        '<div class="campo"><span>Colore</span><div class="colori" role="group" aria-label="Colore">' +
          '<button type="button" class="colore-scelta" data-colore="" style="--c:' + COLORE_TIPO[it.tipo] + '" aria-pressed="' + (!it.colore) + '" aria-label="Colore predefinito">Auto</button>' +
          COLORI_VOCE.map(function (c) { return '<button type="button" class="colore-scelta" data-colore="' + c + '" style="--c:' + c + '" aria-pressed="' + (it.colore === c) + '" aria-label="' + c + '"></button>'; }).join('') +
        '</div></div>' +
        '<div class="azioni"><button class="btn" type="submit" value="salva">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
      var f = $('#form-voce', foglio);
      f.querySelectorAll('[data-tipo]').forEach(function (b) { b.onclick = function () { leggi(f); it.tipo = b.dataset.tipo; it.avviso = ''; render(); }; });
      f.ripN.oninput = function () { f.fine.disabled = !(+f.ripN.value > 0); };
      f.querySelectorAll('[data-colore]').forEach(function (b) { b.onclick = function () { leggi(f); it.colore = b.dataset.colore; render(); }; });
      f.querySelectorAll('[data-nota-piu]').forEach(function (b) { b.onclick = function () { leggi(f); it.annotazioni.push({ testo: '', quando: '' }); render(); }; });
      var bMappa = f.querySelector('[data-mappa-voce]'), bTogli = f.querySelector('[data-mappa-togli]');
      if (bMappa) bMappa.onclick = function () { leggi(f); scegliSulMappa(it.lat != null ? { lat: it.lat, lon: it.lon } : null, function (p) { it.lat = p.lat; it.lon = p.lon; render(); }); };
      if (bTogli) bTogli.onclick = function () { leggi(f); delete it.lat; delete it.lon; render(); };
      f.querySelectorAll('[data-nota-meno]').forEach(function (b) { b.onclick = function () { leggi(f); it.annotazioni.splice(+b.dataset.notaMeno, 1); render(); }; });
      if (f.categoria) f.categoria.onchange = function () {
        leggi(f);
        if (RIPETI_CAT[it.categoria] && !C.leggiDurata(it.ricorrenza)) it.ricorrenza = RIPETI_CAT[it.categoria];
        render();
      };
      $('[data-chiudi]', f).onclick = function () { foglio.close(); };
      if (id) $('[data-elimina]', f).onclick = function () {
        var copia = Store.get(id); Store.elimina(id); foglio.close();
        toast('Eliminato: ' + copia.titolo, 'Annulla', function () { copia.eliminato = false; Store.upsert(copia); });
      };
      f.onsubmit = function (e) {
        e.preventDefault(); leggi(f);
        if (!it.titolo.trim()) { f.titolo.focus(); return; }
        it.annotazioni = it.annotazioni.filter(function (n) { return n.testo || n.quando; });
        it.note = it.annotazioni.map(function (n) { return n.testo; }).filter(Boolean).join(' · ');
        if (!it.colore) delete it.colore;
        if (it.lat == null) { delete it.lat; delete it.lon; }
        Store.upsert(it); foglio.close(); toast(id ? 'Modifiche salvate' : 'Aggiunto: ' + it.titolo);
      };
    }
    function leggi(f) {
      ['titolo', 'data', 'ora', 'chi'].forEach(function (k) { if (f[k]) it[k] = f[k].value; });
      var testi = f.querySelectorAll('[name=ntesto]'), quando = f.querySelectorAll('[name=nquando]');
      it.annotazioni = Array.prototype.map.call(testi, function (t, i) { return { testo: t.value.trim(), quando: quando[i] ? quando[i].value : '' }; });
      var rn = parseInt(f.ripN.value, 10);
      it.ricorrenza = rn > 0 ? rn + ' ' + f.ripU.value : '';
      it.fine = rn > 0 ? f.fine.value : '';
      var an = parseInt(f.avvN.value, 10);
      it.avviso = an >= 0 && f.avvN.value !== '' ? an + ' ' + f.avvU.value : '';
      if (f.importo) it.importo = f.importo.value === '' ? '' : Math.round(parseFloat(f.importo.value) * 100) / 100;
      else it.importo = '';
      if (f.categoria) it.categoria = f.categoria.value;
      if (f.targa) it.targa = f.targa.value.toUpperCase().replace(/\s+/g, '');
      if (f.telefono) it.telefono = f.telefono.value.trim();
      if (f.email) it.email = f.email.value.trim();
      if (f.indirizzo) it.indirizzo = f.indirizzo.value.trim();
      it.titolo = it.titolo.trim();
    }
    render();
    foglio.showModal();
    setTimeout(function () { var t = $('input[name=titolo]', foglio); if (t && !id) t.focus(); }, 60);
  }

  function apriEccezione() {
    var e = { data: C.addGiorni(C.oggi(), 1), frazioni: [], nota: '' };
    function render() {
      foglio.innerHTML = '<form method="dialog" id="form-ecc"><div class="maniglia"></div><h3 id="foglio-titolo">Variazione del ritiro</h3><div class="campi">' +
        '<label class="campo">Giorno del ritiro<input type="date" name="data" required value="' + e.data + '"></label>' +
        '<div class="campo">Cosa ritirano quel giorno<span class="aiuto">Nessuna scelta = niente ritiro.</span><div class="riga-reg" style="display:flex;gap:8px;flex-wrap:wrap">' + Object.keys(C.FRAZIONI).map(function (f) { return '<button type="button" class="chip frazione" style="--c:' + C.FRAZIONI[f].colore + '" data-f="' + f + '" aria-pressed="' + (e.frazioni.indexOf(f) >= 0) + '">' + C.FRAZIONI[f].nome.split(' ')[0] + '</button>'; }).join('') + '</div></div>' +
        '<label class="campo">Nota<input type="text" name="nota" value="' + esc(e.nota) + '" placeholder="Es. recupero per festività"></label>' +
        '<div class="azioni"><button class="btn" type="submit">Salva variazione</button><button class="btn secondario" type="button" data-chiudi>Annulla</button></div></div></form>';
      var f = $('#form-ecc', foglio);
      f.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { e.data = f.data.value; e.nota = f.nota.value; toggle(e.frazioni, b.dataset.f); render(); }; });
      $('[data-chiudi]', f).onclick = function () { foglio.close(); };
      f.onsubmit = function (ev) {
        ev.preventDefault(); e.data = f.data.value; e.nota = f.nota.value.trim();
        salvaRifiuti(function (cfg) { cfg.eccezioni = (cfg.eccezioni || []).filter(function (x) { return x.data !== e.data; }).concat([e]); });
        foglio.close(); toast('Variazione salvata');
      };
    }
    render(); foglio.showModal();
  }

  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'form-dati') return;
    e.preventDefault();
    var f = e.target, v = function (n) { return (f.elements[n] ? f.elements[n].value : '').trim(); };
    var attuale = Store.settings().anagrafica || {}, casaVecchia = casaDi(attuale);
    var casa = { via: v('via'), civico: v('civico'), comune: v('comune'), cap: v('cap'), provincia: v('provincia').toUpperCase() };
    var pos = casaPosizione || (casaVecchia.lat != null ? [casaVecchia.lat, casaVecchia.lon] : null);
    if (pos) { casa.lat = pos[0]; casa.lon = pos[1]; }
    salvaAnagrafica({ casa: casa, altro: v('altro') });
    toast('Dati di casa salvati');
  });
  // dati di una persona (area personale): salva solo i suoi, lasciando quelli dell'altra
  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'form-persona') return;
    e.preventDefault();
    var f = e.target, nome = f.dataset.persona, v = function (n) { return (f.elements[n] ? f.elements[n].value : '').trim(); };
    var pp = Object.assign({}, (Store.settings().anagrafica || {}).persone || {});
    pp[nome] = Object.assign({}, pp[nome] || {}, { prefisso: v(nome + '_prefisso'), telefono: v(nome + '_telefono'), nomeCompleto: v(nome + '_nome'), nascita: v(nome + '_nascita'), email: v(nome + '_email'), cf: v(nome + '_cf').toUpperCase() });
    salvaAnagrafica({ persone: pp });
    toast('Dati di ' + nome + ' salvati');
  });

  // ---------- routing e eventi ----------
  var VISTE = { wallet: vistaWallet, lista: vistaLista, oggi: vistaOggi, calendario: vistaCalendario, conti: vistaConti, rifiuti: vistaRifiuti, viaggi: vistaViaggi, viaggio: vistaViaggio, concerti: vistaConcerti, archivio: vistaArchivio, album: vistaAlbum, altro: vistaAltro };
  function rotta() { var r = location.hash.replace('#', '').split('/')[0]; return VISTE[r] ? r : 'oggi'; }
  function disegna() {
    var r = rotta(), y = window.scrollY;
    VISTE[r]();
    $('#fab').style.display = (r === 'altro' || r === 'album' || r === 'viaggio') ? 'none' : '';
    var rNav = r === 'viaggio' ? 'viaggi' : r;
    document.querySelectorAll('nav.barra-nav a').forEach(function (a) { if (a.dataset.r === rNav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo(0, y);
    Native.aggiorna(voci(), rifiuti());
    programmaTurnoAuto();
    programmaSveglieTurno();
  }
  window.addEventListener('hashchange', function () { disegna(); window.scrollTo(0, 0); });
  Store.on(disegna);
  Store.on(aggiornaPallino); aggiornaPallino();

  Album.init({ esc: esc, toast: toast, foglio: foglio, ridisegna: function () { if (rotta() === 'album' && !foglio.open) disegna(); } });
  Viaggi.init({ esc: esc, toast: toast, foglio: foglio });
  $('#fab').onclick = function () {
    if (rotta() === 'viaggi') { Viaggi.apriViaggio(null); return; }
    if (rotta() === 'concerti') { Viaggi.apriConcerto(null); return; }
    if (rotta() === 'album') { var inp = $('input[data-album=file]'); if (inp) inp.click(); else location.hash = 'altro'; return; }
    if (rotta() === 'lista') { apriNota(null); return; }
    if (rotta() === 'wallet') { apriCarta(null); return; }
    sceltaNuovo(rotta() === 'calendario' ? ui.giornoCal : null); };
  // scelta diretta del tipo quando si preme +
  function sceltaNuovo(data) {
    var voci = [['appuntamento', 'Appuntamento'], ['pagamento', 'Pagamento'], ['scadenza', 'Scadenza'], ['promemoria', 'Promemoria'], ['nota', 'Nota post-it'], ['spesa', 'Lista della spesa'], ['carta', 'Carta o biglietto'], ['viaggio', 'Viaggio'], ['concerto', 'Concerto']];
    foglio.classList.remove('visore');
    foglio.innerHTML = '<div class="maniglia"></div><h3 id="foglio-titolo">Cosa aggiungi?</h3><div class="campi scelta-tipi">' +
      voci.map(function (v) { return '<button type="button" class="btn secondario" data-nuovo-tipo="' + v[0] + '" style="--c:' + (COLORE_TIPO[v[0]] || 'var(--ardesia)') + '">' + v[1] + '</button>'; }).join('') + '</div>';
    foglio.querySelectorAll('[data-nuovo-tipo]').forEach(function (b) { b.onclick = function () {
      var t = b.dataset.nuovoTipo;
      foglio.close();
      if (t === 'nota') apriNota(null);
      else if (t === 'carta') apriCarta(null);
      else if (t === 'viaggio') Viaggi.apriViaggio(null);
      else if (t === 'concerto') Viaggi.apriConcerto(null);
      else if (t === 'spesa') { location.hash = 'lista'; }
      else apriVoce(null, Object.assign({ tipo: t }, data ? { data: data } : {}));
    }; });
    foglio.showModal();
  }
  // scelta di un punto sulla mappa: tocca il luogo e conferma
  function scegliSulMappa(corrente, onScelta) {
    var box = document.createElement('dialog');
    box.className = 'camera-guida mappa-scelta';
    box.innerHTML = '<div class="mappa-scelta-campo"></div><p class="camera-suggerimento">Tocca il punto del luogo</p>' +
      '<div class="camera-azioni"><button class="btn secondario" type="button" data-annulla-mappa>Annulla</button><button class="btn" type="button" data-usa-mappa>Usa questa posizione</button></div>';
    document.body.appendChild(box);
        box.addEventListener('cancel', function (e) { e.preventDefault(); var b = box.querySelector('[data-annulla-rit],[data-annulla-cam],[data-annulla-mappa]'); if (b) b.click(); });
        box.showModal();
    var m = L.map(box.querySelector('.mappa-scelta-campo'), { zoomControl: true });
    m.setView(corrente ? [corrente.lat, corrente.lon] : [44.2, 12.2], corrente ? 16 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    var icona = L.divIcon({ html: '📍', className: 'pin-luogo', iconSize: [28, 28], iconAnchor: [14, 26] });
    var pos = corrente ? L.latLng(corrente.lat, corrente.lon) : null, marker = pos ? L.marker(pos, { icon: icona }).addTo(m) : null;
    m.on('click', function (e) { pos = e.latlng; if (marker) marker.setLatLng(pos); else marker = L.marker(pos, { icon: icona }).addTo(m); });
    setTimeout(function () { m.invalidateSize(); }, 150);
    function chiudi() { m.remove(); box.close(); box.remove(); }
    box.querySelector('[data-annulla-mappa]').onclick = chiudi;
    box.querySelector('[data-usa-mappa]').onclick = function () {
      if (pos) onScelta({ lat: +pos.lat.toFixed(6), lon: +pos.lng.toFixed(6) });
      chiudi();
    };
  }
  foglio.addEventListener('click', function (e) { if (e.target === foglio) foglio.close(); });

  // pressione prolungata su una carta: chiede se modificarla (il clic che segue viene ignorato)
  var pressTimer = null, pressoLungo = false, pressoX = 0, pressoY = 0;
  function annullaPressione() { clearTimeout(pressTimer); pressTimer = null; }
  vista.addEventListener('pointerdown', function (e) {
    pressoLungo = false; annullaPressione();
    var b = e.target.closest('.carta-wallet'); if (!b) return;
    var id = b.dataset.cartaApri; pressoX = e.clientX; pressoY = e.clientY;
    pressTimer = setTimeout(function () {
      pressTimer = null; pressoLungo = true;
      if (window.confirm('Modificare questa carta?')) apriCarta(id);
    }, 550);
  });
  vista.addEventListener('pointermove', function (e) {
    if (pressTimer && Math.abs(e.clientX - pressoX) + Math.abs(e.clientY - pressoY) > 12) annullaPressione();
  });
  vista.addEventListener('pointerup', annullaPressione);
  vista.addEventListener('pointercancel', annullaPressione);
  vista.addEventListener('pointerleave', annullaPressione);
  vista.addEventListener('contextmenu', function (e) { if (e.target.closest('.carta-wallet')) e.preventDefault(); });

  vista.addEventListener('click', function (e) {
    if (pressoLungo) { pressoLungo = false; return; }
    if (Viaggi.click(e)) return;
    var t = e.target.closest('button, a'); if (!t) return;
    var d = t.dataset;
    if (d.foto) { Album.apri(d.foto); return; }
    if (d.calModo) { ui.calModo = d.calModo; disegna(); return; }
    if (d.turnoGiorno) { apriGiornoTurno(d.turnoGiorno); return; }
    if (d.azione === 'modi') { apriModi(); return; }
    if (d.azione === 'turni-off') { var tc = JSON.parse(JSON.stringify(turni())); tc.attivo = false; Store.setSettings({ turni: tc }); ui.calModo = 'impegni'; toast('Turnario nascosto: lo riattivi da Calendario → Turni VVF'); return; }
    if (d.fatto) {
      var nuovo = t.getAttribute('aria-pressed') !== 'true';
      Store.segnaFatto(d.fatto, d.data, nuovo);
      if (nuovo) toast('Segnato come fatto', 'Annulla', function () { Store.segnaFatto(d.fatto, d.data, false); });
    } else if (d.apri) apriVoce(d.apri);
    else if (d.vai) { if (d.filtro) ui.filtroConti = d.filtro; location.hash = d.vai; }
    else if (d.mese) { ui.meseCal = C.addMesi(ui.meseCal + '-01', +d.mese).slice(0, 7); disegna(); }
    else if (d.giorno) { ui.giornoCal = d.giorno; if (d.giorno.slice(0, 7) !== ui.meseCal) ui.meseCal = d.giorno.slice(0, 7); disegna(); }
    else if (d.filtroConti) { ui.filtroConti = d.filtroConti; disegna(); }
    else if (d.chi) { Store.setConf({ chi: d.chi }); datiWidgetComandi(); }
    else if (d.fraz) salvaRifiuti(function (cfg) { toggle(cfg.regole[+d.reg].frazioni, d.fraz); });
    else if (d.sett) salvaRifiuti(function (cfg) { var r = cfg.regole[+d.reg]; r.settimane = toggle(r.settimane || [], +d.sett); });
    else if (d.meseReg) salvaRifiuti(function (cfg) { var r = cfg.regole[+d.reg]; r.mesi = toggle(r.mesi || [], +d.meseReg); });
    else if (d.togliReg) salvaRifiuti(function (cfg) { cfg.regole.splice(+d.togliReg, 1); });
    else if (d.togliEcc) salvaRifiuti(function (cfg) { cfg.eccezioni.splice(+d.togliEcc, 1); });
    else if (d.azione === 'sync') { Store.sync(); if (!Store.configurato()) location.hash = 'altro'; }
    else if (d.azione === 'nuovo') apriVoce(null, Object.assign({}, d.data ? { data: d.data } : {}, d.tipo ? { tipo: d.tipo } : {}));
    else if (d.azione === 'aggiungi-regola') salvaRifiuti(function (cfg) { cfg.regole.push({ giorno: 1, frazioni: [], settimane: [], mesi: [] }); });
    else if (d.azione === 'nuova-eccezione') apriEccezione();
    else if (d.spuntaSpesa !== undefined) { var sp = Store.get(d.spuntaSpesa); if (sp) Store.upsert(Object.assign({}, sp, { fatto: !sp.fatto })); vistaLista(); }
    else if (d.eliminaSpesa !== undefined) { Store.elimina(d.eliminaSpesa); vistaLista(); }
    else if (d.bollettaNuova !== undefined) apriSchedaConti('bolletta', null);
    else if (d.bollettaApri) apriSchedaConti('bolletta', d.bollettaApri);
    else if (d.ibanNuovo !== undefined) apriSchedaConti('iban', null);
    else if (d.ibanApri) apriSchedaConti('iban', d.ibanApri);
    else if (d.cartaNuova !== undefined) apriCarta(null);
    else if (d.cartaApri !== undefined) apriCodiceGrande(d.cartaApri);
    else if (d.notaNuova !== undefined) apriNota(null);
    else if (d.nota !== undefined) apriNota(d.nota);
    else if (d.area) { ui.area = d.area; disegna(); }
    else if (d.fileNuovo !== undefined) apriFilePersonale(null, d.persona);
    else if (d.fileApri) apriFilePersonale(d.fileApri);
    else if (d.docNuovo !== undefined) apriDocumento(null, d.persona);
    else if (d.docModifica) apriDocumento(d.docModifica);
    else if (d.azione === 'scollega') { Store.setConf({ url: '', chiave: '' }); toast('Scollegato: i dati restano su questo telefono'); }
    else if (d.azione === 'permesso') Native.permesso().then(function (p) { toast(p === 'granted' ? 'Notifiche attive' : 'Notifiche non concesse: abilitale dalle impostazioni del telefono'); });
    else if (d.azione === 'esporta') {
      var blob = new Blob([Store.esporta()], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'AeC-backup-' + C.oggi() + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }
  });
  vista.addEventListener('change', function (e) {
    if (Viaggi.change(e)) return;
    var t = e.target, d = t.dataset;
    if (d.rif === 'festivi') {
      var lista = t.value.split(/[,;\s]+/).map(function (x) { var m = x.match(/^(\d{1,2})[\/.\-](\d{1,2})$/); return m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 ? C.pad(+m[2]) + '-' + C.pad(+m[1]) : null; }).filter(Boolean);
      if (!lista.length) { toast('Scrivi i giorni come 1/1, 6/1, 25/12'); return; }
      salvaRifiuti(function (cfg) { cfg.festivi = lista; }); toast('Giorni senza raccolta salvati');
    }
    else if (d.rif) salvaRifiuti(function (cfg) { cfg[d.rif] = d.rif === 'festivita' ? t.value === '1' : t.value; });
    else if (d.reg && d.campo === 'giorno') salvaRifiuti(function (cfg) { cfg.regole[+d.reg].giorno = +t.value; });
    else if (d.album === 'file') { Album.carica(t.files); t.value = ''; }
    else if (d.azione === 'importa' && t.files[0]) {
      t.files[0].text().then(function (txt) { try { toast('Importate ' + Store.importa(txt) + ' voci'); } catch (err) { toast('File non valido: serve un backup esportato da A&C'); } });
    }
  });
  var SITO = 'https://andreaecristina2023.github.io/4giugno2026/';
  function linkCollegamento() {
    var c = Store.conf(), dati = JSON.stringify({ u: c.url, k: c.chiave });
    return SITO + '#collega=' + btoa(unescape(encodeURIComponent(dati))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function leggiCollegamento(testo) {
    var i = String(testo || '').indexOf('#collega=');
    if (i < 0) return null;
    try {
      var b = testo.slice(i + 9).trim().replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var o = JSON.parse(decodeURIComponent(escape(atob(b))));
      return o.u && o.k ? { url: o.u, chiave: o.k } : null;
    } catch (e) { return null; }
  }
  function collega(url, chiave) {
    toast('Provo il collegamento…');
    return Store.prova(url, chiave).then(function (r) {
      if (!r.ok) throw new Error(r.errore || 'Chiave non valida');
      Store.setConf({ url: url, chiave: chiave }); toast('Collegato al foglio di casa'); Store.sync();
    }).catch(function (err) { toast('Collegamento non riuscito: ' + (err.message === 'Failed to fetch' ? 'controlla l\'indirizzo e che lo script sia distribuito per "Chiunque"' : err.message)); });
  }
  vista.addEventListener('submit', function (e) {
    if (e.target.id === 'form-spesa') {
      e.preventDefault();
      var v = e.target.voce.value.trim();
      if (v) {
        Store.upsert({ tipo: 'spesa', titolo: v, fatto: false });
        // se il prodotto non è nel catalogo, lo salvo nel database per la prossima volta
        var gia = nomiCatalogoSpesa().some(function (n) { return n.toLowerCase() === v.toLowerCase(); });
        if (!gia) { Store.upsert({ tipo: 'prodotto', titolo: v }); toast('Aggiunto anche ai suggerimenti'); }
      }
      e.target.reset(); vistaLista(); return;
    }
    if (e.target.id === 'form-turni') {
      e.preventDefault();
      var f = e.target, cfg = JSON.parse(JSON.stringify(turni()));
      var orario = function (v, def) { v = v.trim().replace(/\./g, ':').replace(/\s/g, ''); var m = v.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/); return m ? C.pad(+m[1]) + ':' + (m[2] || '00') + '-' + C.pad(+m[3]) + ':' + (m[4] || '00') : def; };
      cfg.turno = (f.querySelector('input[name=turno]:checked') || {}).value || cfg.turno;
      cfg.saltoturno = f.saltoturno.value ? +f.saltoturno.value : ''; cfg.persona = f.persona.value;
      delete cfg.riferimento; delete cfg.salto;
      cfg.diurno = orario(f.diurno.value, '08:00-20:00'); cfg.notte = orario(f.notte.value, '20:00-08:00');
      cfg.attivo = true;
      Store.setSettings({ turni: cfg }); toast('Turnario salvato'); return;
    }
    if (e.target.id !== 'form-collega') return;
    e.preventDefault();
    var f = e.target, link = leggiCollegamento(f.url.value);
    if (link) return collega(link.url, link.chiave);
    var url = f.url.value.trim(), chiave = f.chiave.value.trim();
    if (!chiave) { toast('Manca la chiave'); f.chiave.focus(); return; }
    collega(url, chiave);
  });
  // ---------- QR code ----------
  function mostraQR() {
    var q = qrcode(0, 'M'); q.addData(linkCollegamento()); q.make();
    foglio.innerHTML = '<form method="dialog"><div class="maniglia"></div><h3 id="foglio-titolo">Collega un altro telefono</h3>' +
      '<div class="qr-box">' + q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) + '</div>' +
      '<p class="testo-muto">Sull\'altro telefono: app A&amp;C → Altro → <b>Inquadra QR</b>, oppure inquadralo con la fotocamera per aprire il sito già collegato. Il QR contiene la chiave: non mostrarlo ad altri.</p>' +
      '<div class="azioni"><button class="btn" type="submit">Fatto</button></div></form>';
    foglio.showModal();
  }
  var jsQRpronto = null;
  function caricaJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (jsQRpronto) return jsQRpronto;
    jsQRpronto = new Promise(function (ok, ko) { var sc = document.createElement('script'); sc.src = 'js/vendor/jsQR.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
    return jsQRpronto;
  }
  function scansionaQR() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Questo browser non può usare la fotocamera: incolla il link'); return; }
    var flusso = null, attivo = true;
    foglio.innerHTML = '<form method="dialog"><div class="maniglia"></div><h3 id="foglio-titolo">Inquadra il QR code</h3>' +
      '<div class="qr-video"><video playsinline muted></video><span class="mirino"></span></div>' +
      '<p class="testo-muto" id="qr-stato">Apri il QR sull\'altro telefono (Altro → Mostra QR code) e inquadralo.</p>' +
      '<div class="azioni"><button class="btn secondario" type="submit">Annulla</button></div></form>';
    foglio.showModal();
    function stop() { attivo = false; if (flusso) flusso.getTracks().forEach(function (t) { t.stop(); }); }
    foglio.addEventListener('close', stop, { once: true });
    var video = $('video', foglio), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    Promise.all([caricaJsQR(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })]).then(function (r) {
      flusso = r[1]; if (!attivo) return stop();
      video.srcObject = flusso; video.play();
      (function giro() {
        if (!attivo) return;
        if (video.readyState >= 2 && video.videoWidth) {
          var k = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var cod = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (cod && cod.data) {
            var link = leggiCollegamento(cod.data);
            if (link) { stop(); foglio.close(); collega(link.url, link.chiave); return; }
            var st = $('#qr-stato', foglio); if (st) st.textContent = 'Questo QR non è un collegamento di A&C.';
          }
        }
        setTimeout(giro, 180);
      })();
    }).catch(function (e) {
      var st = $('#qr-stato', foglio);
      if (st) st.textContent = (e && e.name === 'NotAllowedError') ? 'Permesso fotocamera negato: abilitalo nelle impostazioni del telefono per A&C.' : 'Fotocamera non disponibile: incolla il link nel campo indirizzo.';
    });
  }

  vista.addEventListener('click', function (e) {
    var t = e.target.closest('[data-azione]'); if (!t) return;
    if (t.dataset.azione === 'mostra-qr') return mostraQR();
    if (t.dataset.azione === 'scansiona-qr') return scansionaQR();
    if (t.dataset.azione === 'condividi-link') navigator.share({ title: 'A&C', text: 'Apri questo link per collegare il telefono ai dati di casa', url: linkCollegamento() }).catch(function () {});
    else if (t.dataset.azione === 'copia-link') {
      var l = linkCollegamento();
      (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { toast('Link copiato: incollalo su WhatsApp'); })
        .catch(function () { window.prompt('Copia questo link:', l); });
    }
  });


  // ---------- MODI AUDIO (Moto, Lavoro, Notte…) e rotazione schermo ----------
  // Salvati solo su questo telefono (ognuno ha i suoi). volumi in %, null = non cambiare.
  var VOLUMI = [['suoneria', 'Suoneria'], ['notifiche', 'Notifiche'], ['chiamate', 'Chiamate'], ['media', 'Musica, video, navigatore'], ['sveglia', 'Sveglia']];
  var SUONERIE = { suona: 'Suona', vibra: 'Vibra', silenzio: 'Silenzio' };
  var DND = { '': 'Non cambiare', off: 'Spento', priorita: 'Solo priorità', sveglie: 'Solo sveglie', totale: 'Silenzio totale' };
  var ROTAZIONI = { '': 'Non cambiare', auto: 'Automatica', bloccata: 'Bloccata' };
  var ICONE_MODO = ['🔔', '🏍️', '🚒', '🌙', '🔕', '🎵', '⛔', '⛔', '🚗', '🏠', '💼', '🎬', '🏋️', '✈️', '🛏️', '🎧', '⛪'];
  function modiPredefiniti() {
    var v = function (o) { var r = {}; VOLUMI.forEach(function (x) { r[x[0]] = o[x[0]] == null ? null : o[x[0]]; }); return r; };
    return [
      { id: 'normale', nome: 'Normale', icona: '🔔', suoneria: 'suona', dnd: 'off', rotazione: 'auto', volumi: v({ suoneria: 70, notifiche: 70, chiamate: 70, media: 50 }) },
      { id: 'moto', nome: 'Moto', icona: '🏍️', suoneria: 'suona', dnd: 'off', rotazione: 'bloccata', volumi: v({ suoneria: 100, notifiche: 60, chiamate: 100, media: 100 }) },
      { id: 'lavoro', nome: 'Lavoro', icona: '🚒', suoneria: 'vibra', dnd: 'off', rotazione: '', volumi: v({ media: 0 }) },
      { id: 'notte', nome: 'Notte', icona: '🌙', suoneria: 'suona', dnd: 'priorita', rotazione: 'bloccata', volumi: v({ media: 0, sveglia: 80 }) },
      { id: 'silenzioso', nome: 'Silenzioso', icona: '🔕', suoneria: 'silenzio', dnd: 'off', rotazione: '', volumi: v({ media: 0 }) },
      { id: 'musica', nome: 'Solo musica', icona: '🎵', suoneria: 'silenzio', dnd: 'off', rotazione: '', volumi: v({ media: 80 }) },
      { id: 'nondisturbare', nome: 'Non disturbare', icona: '⛔', suoneria: '', dnd: 'priorita', rotazione: '', volumi: v({}) },
      // Non disturbare di Android con le eccezioni scelte nelle impostazioni del telefono (preferiti, chiamate ripetute, sveglie)
      { id: 'nondisturbare', nome: 'Non disturbare', icona: '⛔', suoneria: '', dnd: 'priorita', rotazione: '', volumi: v({}) }
    ];
  }
  function leggiLocale(k, def) { try { var x = localStorage.getItem(k); return x ? JSON.parse(x) : def; } catch (e) { return def; } }
  function scriviLocale(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } }
  // i modi predefiniti nuovi (es. Solo musica) compaiono una volta anche a chi aveva già salvato i suoi; se li elimina restano eliminati
  var MODI_ORIGINALI = ['normale', 'moto', 'lavoro', 'notte', 'silenzioso'];
  function modi() {
    var m = leggiLocale('aec.modi', null);
    if (!Array.isArray(m) || !m.length) return modiPredefiniti();
    var noti = leggiLocale('aec.modiNoti', MODI_ORIGINALI), aggiunti = false;
    modiPredefiniti().forEach(function (d) {
      if (noti.indexOf(d.id) >= 0) return;
      noti.push(d.id);
      if (!m.some(function (x) { return x.id === d.id; })) { m.push(d); aggiunti = true; }
    });
    scriviLocale('aec.modiNoti', noti);
    if (aggiunti) scriviLocale('aec.modi', m);
    return m;
  }
  function salvaModi(lista) { scriviLocale('aec.modi', lista); datiWidgetComandi(); programmaTurnoAuto(); }
  function isAndrea() { return /^andrea/i.test(String(Store.conf().chi || '').trim()); }
  function dnsHost() { return leggiLocale('aec.dnsHost', ''); }
  function datiWidgetComandi() { if (Native.isApp) Native.audio.salvaWidget({ modi: modi(), andrea: isAndrea(), dnsHost: dnsHost() }); }
  function modoAttivo() { var id = leggiLocale('aec.modoAttivo', null); return modi().filter(function (m) { return m.id === id; })[0] || null; }
  function descriviModo(m) {
    var p = m.suoneria ? [SUONERIE[m.suoneria]] : [];
    if (m.dnd && m.dnd !== 'off') p.push('Non disturbare: ' + DND[m.dnd].toLowerCase());
    if (!p.length) p.push('Suoneria invariata');
    if (m.volumi && m.volumi.media === 0) p.push('media muti'); else if (m.volumi && m.volumi.media === 100) p.push('media al massimo'); else if (m.volumi && m.volumi.media != null) p.push('musica al ' + m.volumi.media + '%');
    if (m.rotazione) p.push('rotazione ' + ROTAZIONI[m.rotazione].toLowerCase());
    return p.join(' · ');
  }
  function tastoModi() {
    var m = modoAttivo();
    return '<button class="ingranaggio modo-audio" type="button" data-azione="modi" aria-label="Modi audio' + (m ? ': ' + esc(m.nome) : '') + '">' +
      (m ? '<span aria-hidden="true">' + esc(m.icona) + '</span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>') + '</button>';
  }
  // se nel frattempo suoneria o Non disturbare sono stati cambiati a mano, il modo non è più "attivo"
  function verificaModo() {
    if (!Native.isApp) return Promise.resolve();
    return Native.audio.stato().then(function (st) {
      var prima = leggiLocale('aec.modoAttivo', null);
      // il widget può aver cambiato modo ad app chiusa
      if (st.attivo !== undefined && (st.attivo || null) !== prima) scriviLocale('aec.modoAttivo', st.attivo || null);
      var m = modoAttivo();
      if (m && ((m.suoneria && st.suoneria !== m.suoneria) || (m.dnd && st.dnd !== m.dnd))) { scriviLocale('aec.modoAttivo', null); Native.audio.segna(''); }
      if (leggiLocale('aec.modoAttivo', null) !== prima) disegna();
      dnsDiDefault(st);
    }).catch(function () {});
  }
  // DNS privato attivo di default (solo Andrea): si riaccende quando la VPN è spenta,
  // a meno che non sia in pausa per la VPN o spento a mano (dall'app o dal widget)
  function dnsDiDefault(st) {
    var host = dnsHost() || st.dnsHost || '';
    if (!isAndrea() || !host || !st.permessoDns || st.vpn || st.dnsInPausa || st.dnsManualeOff || st.dnsModo === 'host') return;
    if (!dnsHost()) scriviLocale('aec.dnsHost', host);
    Native.audio.dns('host', host).then(function () { toast('DNS privato attivo: ' + host); }).catch(function () {});
  }
  function permessoDns() {
    foglio.classList.remove('visore');
    foglio.innerHTML = '<form method="dialog"><div class="maniglia"></div><h3 id="foglio-titolo">Permesso per il DNS</h3>' +
      '<p>Android lascia cambiare il DNS privato solo alle app autorizzate dal computer. Si fa una volta sola:</p>' +
      '<ol class="passi"><li>Sul telefono: Impostazioni → Info sul telefono → tocca 7 volte <b>Numero build</b>, poi in Opzioni sviluppatore attiva <b>Debug USB</b>.</li>' +
      '<li>Collega il telefono al computer con il cavo e accetta la richiesta sul telefono.</li>' +
      '<li>Sul computer (con gli <i>Android platform-tools</i>) scrivi:<br><code>adb shell pm grant it.andreaecristina.casa android.permission.WRITE_SECURE_SETTINGS</code></li></ol>' +
      '<p class="testo-muto">Il permesso resta anche dopo gli aggiornamenti di A&amp;C (si perde solo disinstallandola). Nel frattempo puoi cambiarlo a mano nelle impostazioni di rete, alla voce <b>DNS privato</b>.</p>' +
      '<div class="azioni"><button class="btn" type="button" data-copia-adb>Copia il comando</button><button class="btn secondario" type="button" data-rete>Apri impostazioni di rete</button><button class="btn secondario" type="submit">Chiudi</button></div></form>';
    $('[data-copia-adb]', foglio).onclick = function () {
      var cmd = 'adb shell pm grant it.andreaecristina.casa android.permission.WRITE_SECURE_SETTINGS';
      (navigator.clipboard ? navigator.clipboard.writeText(cmd) : Promise.reject()).then(function () { toast('Comando copiato'); }).catch(function () { window.prompt('Copia il comando:', cmd); });
    };
    $('[data-rete]', foglio).onclick = function () { foglio.close(); Native.audio.apriPermesso('rete'); };
    if (!foglio.open) foglio.showModal();
  }
  // "VPN in un tocco" sta nell'app separata A&C VPN: usa l'Accessibilità, che Play Protect blocca nelle app
  // installate dal browser; per questo si installa una volta dal computer con adb.
  function istruzioniVpnAuto(installata) {
    var cmd = 'adb install -r A-C-VPN.apk';
    foglio.classList.remove('visore');
    foglio.innerHTML = '<form method="dialog"><div class="maniglia"></div><h3 id="foglio-titolo">VPN in un tocco</h3>' +
      '<p>Il tasto VPN apre FortiClient, preme <b>Connetti</b> (o <b>Disconnetti</b>) e ti riporta dov\'eri. Prima di collegare spegne il DNS privato e lo riaccende quando la VPN si scollega.</p>' +
      '<p class="testo-muto">Lo fa una piccola app a parte, <b>A&amp;C VPN</b>: usa l\'Accessibilità, e Google Play Protect blocca le app con Accessibilità installate dal browser. Dal computer invece si installa senza problemi, una volta sola.</p>' +
      '<ol class="passi">' +
      (installata ? '<li>✓ A&amp;C VPN è installata.</li>' :
        '<li>Sul computer scarica <b>A-C-VPN.apk</b> dalla pagina della release (stessa pagina di Casa.apk) e mettilo nella cartella <code>platform-tools</code>.</li>' +
        '<li>Collega il telefono col cavo e nella finestra dei comandi scrivi:<br><code>' + cmd + '</code><br>Deve rispondere <i>Success</i>.</li>') +
      '<li>In <b>FortiClient</b>: apri il profilo VPN, spunta <b>Salva password</b> e collegati una volta a mano.</li>' +
      '<li><b>Impostazioni → Accessibilità → Servizi installati</b> → <b>A&amp;C · VPN in un tocco</b> → attiva.</li></ol>' +
      '<p class="testo-muto">Il servizio legge solo le schermate di FortiClient e solo nei 25 secondi dopo il tuo tocco. La password resta in FortiClient. Se FortiClient chiede un codice (FortiToken, SMS) lo inserisci tu. A&amp;C VPN parla solo con A&amp;C: le due app sono firmate con la stessa chiave.</p>' +
      '<div class="azioni">' + (installata ? '<button class="btn" type="button" data-acc>Apri Accessibilità</button>' : '<button class="btn" type="button" data-copia>Copia il comando</button><a class="btn secondario" href="' + REPO + '/releases/latest" target="_blank" rel="noopener">Pagina della release</a>') +
      '<button class="btn secondario" type="submit">Chiudi</button></div></form>';
    var acc = $('[data-acc]', foglio); if (acc) acc.onclick = function () { Native.audio.apriPermesso('accessibilita'); };
    var cp = $('[data-copia]', foglio);
    if (cp) cp.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(cmd) : Promise.reject()).then(function () { toast('Comando copiato'); }).catch(function () { window.prompt('Copia il comando:', cmd); }); };
    if (!foglio.open) foglio.showModal();
  }
  function permessoMancante(quale) {
    var dnd = quale === 'dnd';
    foglio.classList.remove('visore');
    foglio.innerHTML = '<form method="dialog"><div class="maniglia"></div><h3 id="foglio-titolo">Serve un permesso</h3>' +
      '<p>' + (dnd ? 'Per mettere il telefono in silenzio, vibrazione o Non disturbare, Android chiede di dare ad A&amp;C l\'<b>accesso a Non disturbare</b>.' : 'Per cambiare la rotazione dello schermo, Android chiede di consentire ad A&amp;C di <b>modificare le impostazioni di sistema</b>.') + '</p>' +
      '<p class="testo-muto">Si apre la pagina di Android: cerca A&amp;C, attiva l\'interruttore e torna qui. Poi tocca di nuovo il modo.</p>' +
      '<div class="azioni"><button class="btn" type="button" data-apri-permesso>Apri le impostazioni</button><button class="btn secondario" type="submit">Annulla</button></div></form>';
    $('[data-apri-permesso]', foglio).onclick = function () { foglio.close(); Native.audio.apriPermesso(quale).catch(function () { toast('Impostazioni non disponibili su questo telefono'); }); };
    if (!foglio.open) foglio.showModal();
  }
  function applicaModo(m) {
    var richiesta = { id: m.id, volumi: {} };
    if (m.suoneria) richiesta.suoneria = m.suoneria;
    if (m.dnd) richiesta.dnd = m.dnd;
    if (m.rotazione) richiesta.rotazione = m.rotazione;
    VOLUMI.forEach(function (x) { var val = m.volumi && m.volumi[x[0]]; if (val != null && val !== '') richiesta.volumi[x[0]] = +val; });
    return Native.audio.applica(richiesta).then(function (r) {
      scriviLocale('aec.modoAttivo', m.id); foglio.close(); disegna();
      var saltati = (r && r.saltati) || [];
      if (saltati.indexOf('rotazione') >= 0) toast(m.icona + ' ' + m.nome + ' attivo, rotazione non cambiata', 'Consenti', function () { permessoMancante('sistema'); });
      else if (saltati.length) toast(m.icona + ' ' + m.nome + ' attivo (alcuni volumi bloccati da Non disturbare)');
      else toast(m.icona + ' ' + m.nome + ' attivo');
    }).catch(function (e) {
      if (e && e.code === 'PERMESSO_DND') permessoMancante('dnd');
      else toast((e && e.message) || 'Modo non applicato');
    });
  }
  function apriModi() {
    var lista = modi(), att = modoAttivo();
    foglio.classList.remove('visore');
    foglio.innerHTML = '<form method="dialog" id="form-modi"><div class="maniglia"></div><h3 id="foglio-titolo">Modi e comandi</h3>' +
      '<ul class="modi-elenco">' + lista.map(function (m) {
        return '<li><button type="button" class="modo' + (att && att.id === m.id ? ' attivo' : '') + '" data-modo="' + esc(m.id) + '" aria-pressed="' + !!(att && att.id === m.id) + '">' +
          '<span class="modo-icona" aria-hidden="true">' + esc(m.icona) + '</span><span><span class="titolo">' + esc(m.nome) + '</span><span class="meta">' + esc(descriviModo(m)) + '</span></span></button>' +
          '<button type="button" class="btn icona" data-modifica-modo="' + esc(m.id) + '" aria-label="Modifica ' + esc(m.nome) + '">✎</button></li>';
      }).join('') + '</ul>' +
      '<div class="rotazione-rapida"><span><b>Rotazione schermo</b><span class="testo-muto" id="rot-stato">…</span></span>' +
      '<span class="tipi due-tasti" role="group" aria-label="Rotazione schermo"><button type="button" data-rot="auto" style="--c:var(--ardesia)">Automatica</button><button type="button" data-rot="bloccata" style="--c:var(--ardesia)">Bloccata</button></span></div>' +
      '<div class="rotazione-rapida"><span><b>⏰ Sveglie</b><span class="testo-muto">' + esc(riassuntoSveglie()) + '</span></span><button type="button" class="btn piccolo" data-sveglie>Imposta</button></div>' +
      (isAndrea() ? (function () {
        var ta = turnoAuto(), opz = function (sel, extra) { return extra + lista.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.icona + ' ' + m.nome) + '</option>'; }).join(''); };
        return '<div class="rotazione-rapida turno-auto"><span><b>🚒 Modo automatico nei turni</b><span class="testo-muto">' + esc(testoProssimoTurno()) + '</span></span>' +
          '<span class="tipi due-tasti" role="group" aria-label="Modo automatico nei turni"><button type="button" data-tauto="1" style="--c:var(--sangiovese)" aria-pressed="' + ta.attivo + '">Sì</button><button type="button" data-tauto="0" style="--c:var(--sangiovese)" aria-pressed="' + !ta.attivo + '">No</button></span>' +
          '<div class="due"><label class="campo">Durante il turno<select name="ta-in">' + opz(ta.inTurno, '') + '</select></label><label class="campo">A fine turno<select name="ta-dopo">' + opz(ta.dopo, '<option value="">Il modo di prima</option>') + '</select></label></div></div>';
      })() : '') +
      (isAndrea() ? '<div class="rotazione-rapida"><span><b>VPN FortiClient</b><span class="testo-muto" id="vpn-stato">…</span></span><button type="button" class="btn piccolo" data-forti>VPN</button></div><div class="vpn-auto" id="vpn-auto"></div>' +
        '<div class="rotazione-rapida dns"><span><b>DNS privato</b><span class="testo-muto" id="dns-stato">…</span></span>' +
        '<span class="tipi due-tasti" role="group" aria-label="DNS privato"><button type="button" data-dns="host" style="--c:var(--ardesia)">Attivo</button><button type="button" data-dns="off" style="--c:var(--ardesia)">Disattivato</button></span>' +
        '<label class="campo dns-host">Indirizzo del DNS<input type="text" name="dnshost" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="120" value="' + esc(dnsHost()) + '" placeholder="es. dns.adguard-dns.com"></label></div>' : '') +
      '<div class="azioni"><button class="btn secondario" type="button" data-nuovo-modo>Nuovo modo</button><button class="btn secondario" type="submit">Chiudi</button></div></form>';
    var f = $('#form-modi', foglio);
    function segnaRete(st) {
      var v = $('#vpn-stato', f), d = $('#dns-stato', f);
      if (v) v.textContent = st.vpn ? 'Collegata' : (st.forticlient === false ? 'FortiClient non installato' : 'Non collegata');
      var bf2 = $('[data-forti]', f); if (bf2) bf2.textContent = st.vpn ? 'Scollega' : (st.vpnAuto ? 'Collega' : 'Apri FortiClient');
      var va = $('#vpn-auto', f);
      if (va) va.innerHTML = st.vpnAuto ? '<span class="testo-muto">✓ VPN in un tocco attiva' + (st.dnsHost || st.dnsInPausa ? ' · il DNS privato si spegne durante la VPN' : '') + '</span>'
        : '<button type="button" class="btn secondario piccolo" data-vpn-auto>' + (st.vpnApp ? 'Attiva «VPN in un tocco»' : 'Installa «A&amp;C VPN» per la VPN in un tocco') + '</button>';
      var bva = $('[data-vpn-auto]', f); if (bva) bva.onclick = function () { istruzioniVpnAuto(!!st.vpnApp); };
      if (d) d.textContent = st.dnsInPausa ? 'In pausa per la VPN: torna ' + st.dnsInPausa + ' a VPN spenta' : st.dnsModo === 'host' ? (st.dnsHost || 'attivo') : st.dnsModo === 'off' ? 'Disattivato' : 'Automatico (tocca Disattivato o Attivo)';
      f.querySelectorAll('[data-dns]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.dns === (st.dnsModo === 'host' ? 'host' : 'off'))); });
    }
    function segnaRot(r) {
      f.querySelectorAll('[data-rot]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rot === r)); });
      var st = $('#rot-stato', f); if (st) st.textContent = r === 'auto' ? 'Gira da solo' : r === 'bloccata' ? 'Resta fermo' : '';
    }
    Native.audio.stato().then(function (st) { segnaRot(st.rotazione); segnaRete(st); if (st.dnsHost && !dnsHost() && $('[name=dnshost]', f)) $('[name=dnshost]', f).value = st.dnsHost; }).catch(function () { segnaRot(''); });
    $('[data-sveglie]', f).onclick = function () { apriSveglie(); };
    function salvaTurnoAuto(cambi) {
      var ta = Object.assign(turnoAuto(), cambi); scriviLocale('aec.turnoAuto', ta);
      return programmaTurnoAuto(true);
    }
    f.querySelectorAll('[data-tauto]').forEach(function (b) {
      b.onclick = function () {
        var on = b.dataset.tauto === '1';
        f.querySelectorAll('[data-tauto]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); });
        salvaTurnoAuto({ attivo: on }).then(function (st) {
          if (!on) { toast('Modo automatico nei turni spento'); return; }
          var tcfg = Store.settings().turni;
          if (!tcfg || !tcfg.attivo || !tcfg.turno) { toast('Imposta il tuo turno in Calendario → Turni VVF'); return; }
          if (st && st.permessoDnd === false) toast('Attivo. Concedi l\'accesso a Non disturbare, altrimenti la vibrazione può non partire', 'Concedi', function () { permessoMancante('dnd'); });
          else toast(st && /^i:/.test(st.turnoAutoFatto || '') ? 'Sei in turno: modo applicato' : 'Attivo: cambierà da solo a inizio e fine turno');
        });
      };
    });
    var taIn = $('[name=ta-in]', f), taDopo = $('[name=ta-dopo]', f);
    if (taIn) taIn.onchange = function () { salvaTurnoAuto({ inTurno: taIn.value }); };
    if (taDopo) taDopo.onchange = function () { salvaTurnoAuto({ dopo: taDopo.value }); };
    var bf = $('[data-forti]', f);
    if (bf) bf.onclick = function () {
      Native.audio.apriFortiClient().then(function (r) { if (r && r.azione === 'manuale') toast('Tocca Connetti in FortiClient'); }).catch(function () { toast('FortiClient non trovato'); });
    };
    var campoDns = $('[name=dnshost]', f);
    if (campoDns) campoDns.onchange = function () { scriviLocale('aec.dnsHost', campoDns.value.trim()); datiWidgetComandi(); };
    f.querySelectorAll('[data-dns]').forEach(function (b) {
      b.onclick = function () {
        var host = campoDns ? campoDns.value.trim() : dnsHost();
        if (b.dataset.dns === 'host' && !host) { toast('Scrivi prima l\'indirizzo del DNS'); if (campoDns) campoDns.focus(); return; }
        scriviLocale('aec.dnsHost', host); datiWidgetComandi();
        Native.audio.dns(b.dataset.dns, host).then(function (st) { segnaRete(st); toast(b.dataset.dns === 'host' ? 'DNS privato: ' + host : 'DNS privato disattivato: resta così finché non tocchi Attivo'); })
          .catch(function (e) { if (e && e.code === 'PERMESSO_DNS') permessoDns(); else toast((e && e.message) || 'DNS non cambiato'); });
      };
    });
    f.querySelectorAll('[data-modo]').forEach(function (b) { b.onclick = function () { var m = modi().filter(function (x) { return x.id === b.dataset.modo; })[0]; if (m) applicaModo(m); }; });
    f.querySelectorAll('[data-modifica-modo]').forEach(function (b) { b.onclick = function () { modificaModo(b.dataset.modificaModo); }; });
    f.querySelectorAll('[data-rot]').forEach(function (b) {
      b.onclick = function () {
        Native.audio.rotazione(b.dataset.rot).then(function (st) { segnaRot(st.rotazione); toast(st.rotazione === 'auto' ? 'Rotazione automatica' : 'Rotazione bloccata'); })
          .catch(function (e) { if (e && e.code === 'PERMESSO_SISTEMA') permessoMancante('sistema'); else toast((e && e.message) || 'Rotazione non cambiata'); });
      };
    });
    $('[data-nuovo-modo]', f).onclick = function () { modificaModo(null); };
    if (!foglio.open) foglio.showModal();
  }
  // ---------- MODO AUTOMATICO NEI TURNI (solo Andrea) ----------
  // intervalli di servizio [inizioMs, fineMs] dei prossimi giorni, dal turnario VVF (turni attaccati uniti)
  function intervalliTurno(cfg, giorni) {
    var out = [], da = C.addGiorni(C.oggi(), -1);
    for (var k = 0; k <= giorni; k++) {
      var d = C.addGiorni(da, k), t = C.turnoDel(cfg, d);
      if (!t || !(C.STATI_TURNO[t.stato] || {}).lavoro) continue;
      var m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(t.orario || ''));
      if (!m) continue;
      var a = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +m[1], +m[2]).getTime();
      var b = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +m[3], +m[4]).getTime();
      if (b <= a) b = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1, +m[3], +m[4]).getTime();
      out.push([a, b]);
    }
    out.sort(function (x, y) { return x[0] - y[0]; });
    var uniti = [];
    out.forEach(function (x) { var u = uniti[uniti.length - 1]; if (u && x[0] <= u[1]) u[1] = Math.max(u[1], x[1]); else uniti.push(x.slice()); });
    return uniti.filter(function (x) { return x[1] > Date.now(); });
  }
  function turnoAuto() { return Object.assign({ attivo: false, inTurno: 'lavoro', dopo: '' }, leggiLocale('aec.turnoAuto', {})); }
  var firmaTurnoAuto = '';
  function programmaTurnoAuto(forza) {
    if (!Native.isApp) return Promise.resolve(null);
    var ta = turnoAuto(), tcfg = Store.settings().turni;
    var attivo = !!(ta.attivo && isAndrea() && tcfg && tcfg.attivo && tcfg.turno);
    var conf = { attivo: attivo, inTurno: ta.inTurno, dopo: ta.dopo, modi: modi(), intervalli: attivo ? intervalliTurno(tcfg, 22) : [] };
    var firma = JSON.stringify(conf).replace(/"intervalli".*$/, '') + (conf.intervalli[0] || []).join() + conf.intervalli.length;
    if (!forza && firma === firmaTurnoAuto) return Promise.resolve(null);
    firmaTurnoAuto = firma;
    return Native.audio.turnoAuto(conf).then(function (st) { if (st && st.attivo !== leggiLocale('aec.modoAttivo', null)) { scriviLocale('aec.modoAttivo', st.attivo || null); disegna(); } return st; }).catch(function () { return null; });
  }
  function testoProssimoTurno() {
    var tcfg = Store.settings().turni;
    if (!tcfg || !tcfg.attivo || !tcfg.turno) return 'Prima imposta il tuo turno in Calendario → Turni VVF';
    var iv = intervalliTurno(tcfg, 22)[0];
    if (!iv) return 'Nessun turno nelle prossime 3 settimane';
    var f = function (ms) { var d = new Date(ms); return C.dataBreve(C.iso(d)) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
    return (iv[0] <= Date.now() ? 'In turno fino a ' + f(iv[1]) : 'Prossimo turno: ' + f(iv[0]) + ' → ' + f(iv[1]));
  }

  // ---------- SVEGLIE DAL TURNARIO (suonano in A&C: l'Orologio non accetta una data precisa) ----------
  function sveglieTurno() {
    var x = leggiLocale('aec.sveglieTurno', {});
    return { diurno: Object.assign({ on: false, ora: '06:30' }, x.diurno || {}), smonto: Object.assign({ on: false, ora: '13:00' }, x.smonto || {}),
      suono: Object.assign({ tipo: 'sistema', uri: '', nome: '', spotify: '', link: '' }, x.suono || {}) };
  }
  // eventi dei prossimi 22 giorni: mattina del diurno e giorno dopo la notte (ferie, salti e cambi già considerati)
  function eventiSveglieTurno(giorni) {
    var cfg = Store.settings().turni, st = sveglieTurno(), out = [];
    if (!cfg || !cfg.attivo || !cfg.turno) return out;
    var ms = function (d, hhmm) { var o = String(hhmm || '').split(':'); return new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +o[0] || 0, +o[1] || 0).getTime(); };
    for (var k = -1; k <= (giorni || 22); k++) {
      var d = C.addGiorni(C.oggi(), k), t = C.turnoDel(cfg, d);
      if (!t) continue;
      if (t.stato === 'diurno' && st.diurno.on) out.push({ t: ms(d, st.diurno.ora), nome: 'Diurno' + (t.orario ? ' ' + t.orario.replace('-', '–') : '') });
      if (t.stato === 'notte' && st.smonto.on) out.push({ t: ms(C.addGiorni(d, 1), st.smonto.ora), nome: 'Smonto (dopo la notte)' });
    }
    return out.filter(function (e) { return e.t > Date.now(); }).sort(function (a, b) { return a.t - b.t; });
  }
  var firmaSveglieTurno = '';
  function programmaSveglieTurno(forza) {
    if (!Native.isApp) return Promise.resolve(null);
    var st = sveglieTurno(), attive = isAndrea() && (st.diurno.on || st.smonto.on);
    var conf = { attive: attive, eventi: attive ? eventiSveglieTurno(22) : [], suono: st.suono };
    var firma = JSON.stringify(conf);
    if (!forza && firma === firmaSveglieTurno) return Promise.resolve(null);
    firmaSveglieTurno = firma;
    return Native.audio.sveglieTurno(conf).catch(function () { return null; });
  }
  // link di Spotify (Condividi → Copia link) o URI spotify:… → URI spotify:tipo:id
  function uriSpotify(t) {
    t = String(t || '').trim();
    var m = t.match(/^spotify:(track|playlist|album|artist|episode|show):([A-Za-z0-9]+)/);
    if (m) return 'spotify:' + m[1] + ':' + m[2];
    m = t.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|playlist|album|artist|episode|show)\/([A-Za-z0-9]+)/);
    return m ? 'spotify:' + m[1] + ':' + m[2] : '';
  }
  var NOMI_SPOTIFY = { track: 'brano', playlist: 'playlist', album: 'album', artist: 'artista', episode: 'episodio', show: 'podcast' };
  function quandoBreve(ms) { var d = new Date(ms); return C.dataBreve(C.iso(d)) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  // ---------- SVEGLIE (create nell'app Orologio del telefono) ----------
  var GIORNI_SV = [[1, 'L', 'lun'], [2, 'M', 'mar'], [3, 'M', 'mer'], [4, 'G', 'gio'], [5, 'V', 'ven'], [6, 'S', 'sab'], [7, 'D', 'dom']];
  function sveglie() { return leggiLocale('aec.sveglie', []); }
  function oraSv(sv) { return ('0' + sv.ora).slice(-2) + ':' + ('0' + sv.minuti).slice(-2); }
  function giorniSv(sv) {
    var g = (sv.giorni || []).slice().sort();
    if (!g.length) return 'una volta';
    if (g.length === 7) return 'tutti i giorni';
    if (g.join() === '1,2,3,4,5') return 'lun–ven';
    if (g.join() === '6,7') return 'weekend';
    return g.map(function (d) { return GIORNI_SV[d - 1][2]; }).join(' ');
  }
  function riassuntoSveglie() {
    var l = sveglie(), st = sveglieTurno();
    if (isAndrea() && (st.diurno.on || st.smonto.on)) return (l.length ? l.slice(0, 2).map(oraSv).join(', ') + ' · ' : '') + 'turnario attivo';
    return l.length ? l.slice(0, 3).map(oraSv).join(', ') + (l.length > 3 ? '…' : '') : 'Nell\'orologio del telefono';
  }
  function erroreSveglia(e) { toast(e && e.code === 'NO_OROLOGIO' ? 'Nessuna app Orologio trovata sul telefono' : ((e && e.message) || 'Sveglia non impostata')); }
  function apriSveglie() {
    var nuova = { ora: 6, minuti: 30, giorni: [], nome: '', vibra: true };
    foglio.classList.remove('visore');
    function disegnaSv() {
      var l = sveglie();
      foglio.innerHTML = '<form method="dialog" id="form-sveglie"><div class="maniglia"></div><h3 id="foglio-titolo">⏰ Sveglie</h3><div class="campi">' +
        (l.length ? '<ul class="righe">' + l.map(function (sv, i) {
          return '<li class="riga" style="--c:var(--ardesia)"><span class="barra"></span><span class="corpo-riga"><span class="titolo">' + oraSv(sv) + (sv.nome ? ' · ' + esc(sv.nome) : '') + '</span><span class="meta">' + esc(giorniSv(sv)) + (sv.vibra === false ? ' · senza vibrazione' : '') + '</span></span>' +
            '<span class="destra"><button type="button" class="btn secondario piccolo" data-reimposta="' + i + '">Imposta</button><button type="button" class="btn icona" data-togli-sv="' + i + '" aria-label="Togli la sveglia delle ' + oraSv(sv) + '">✕</button></span></li>';
        }).join('') + '</ul>' : '') +
        '<div class="sezione"><div class="campi">' +
        '<div class="due"><label class="campo">Ora<input type="time" name="ora" required value="' + oraSv(nuova) + '"></label><label class="campo">Nome<input type="text" name="nome" maxlength="40" value="' + esc(nuova.nome) + '" placeholder="Es. Turno diurno"></label></div>' +
        '<div class="campo-modo"><b>Ripeti</b><span class="aiuto">Nessun giorno = suona una volta sola, alla prossima volta che arriva quell\'ora.</span><div class="riga-reg giorni-sv">' +
        GIORNI_SV.map(function (g) { return '<button type="button" class="chip" data-g="' + g[0] + '" aria-pressed="' + (nuova.giorni.indexOf(g[0]) >= 0) + '" aria-label="' + g[2] + '">' + g[1] + '</button>'; }).join('') +
        '<button type="button" class="chip" data-gset="1,2,3,4,5">lun–ven</button><button type="button" class="chip" data-gset="1,2,3,4,5,6,7">tutti</button></div></div>' +
        '<label class="spunta-vol"><input type="checkbox" name="vibra"' + (nuova.vibra ? ' checked' : '') + '> Vibra anche</label>' +
        '<div class="azioni"><button class="btn" type="submit">Imposta la sveglia</button><button class="btn secondario" type="button" data-orologio>Apri l\'Orologio</button></div></div></div>' +
        (isAndrea() ? (function () {
          var st = sveglieTurno(), tcfg = Store.settings().turni, ok = tcfg && tcfg.attivo && tcfg.turno, prossime = ok ? eventiSveglieTurno(22).slice(0, 3) : [];
          return '<div class="sezione sveglie-turno"><div class="campi"><b>🚒 Segui il turnario</b>' +
            (ok ? '<span class="aiuto">Suonano in A&amp;C (l\'Orologio non accetta una data precisa), anche con Non disturbare. Ferie, salti turno e giorni cambiati vengono saltati.</span>' : '<span class="aiuto">Prima imposta il tuo turno in Calendario → Turni VVF.</span>') +
            '<label class="riga-turno"><input type="checkbox" name="st-diurno"' + (st.diurno.on ? ' checked' : '') + (ok ? '' : ' disabled') + '><span>Giorno di <b>diurno</b></span><input type="time" name="st-diurno-ora" value="' + esc(st.diurno.ora) + '"' + (ok ? '' : ' disabled') + '></label>' +
            '<label class="riga-turno"><input type="checkbox" name="st-smonto"' + (st.smonto.on ? ' checked' : '') + (ok ? '' : ' disabled') + '><span>Giorno <b>dopo la notte</b></span><input type="time" name="st-smonto-ora" value="' + esc(st.smonto.ora) + '"' + (ok ? '' : ' disabled') + '></label>' +
            (prossime.length ? '<span class="aiuto">Prossime: ' + prossime.map(function (e) { return quandoBreve(e.t); }).join(' · ') + '</span>' : '') +
            '<div class="suono-sveglia"><b>Suono</b><div class="tipi tre-tasti" role="group" aria-label="Suono della sveglia">' +
              [['sistema', '🔔 Sveglia'], ['file', '🎵 Brano'], ['spotify', '🟢 Spotify']].map(function (o) { return '<button type="button" data-suono="' + o[0] + '" style="--c:var(--ardesia)" aria-pressed="' + (st.suono.tipo === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
              (st.suono.tipo === 'file' ? '<div class="suono-riga"><span>' + (st.suono.nome ? '🎵 ' + esc(st.suono.nome) : 'Nessun brano scelto') + '</span><button type="button" class="btn secondario piccolo" data-scegli-brano>' + (st.suono.uri ? 'Cambia' : 'Scegli dal telefono') + '</button></div>' : '') +
              (st.suono.tipo === 'spotify' ? '<label class="campo">Link di Spotify<span class="aiuto">In Spotify: ⋯ sul brano o sulla playlist → Condividi → Copia link, poi incollalo qui. Alla sveglia si apre Spotify e parte la musica; la suoneria resta finché la musica non parte davvero.</span><input type="url" name="st-spotify" value="' + esc(st.suono.link || '') + '" placeholder="https://open.spotify.com/playlist/…"></label>' +
                (st.suono.spotify ? '<span class="aiuto">✓ ' + esc(NOMI_SPOTIFY[st.suono.spotify.split(':')[1]] || 'link') + ' di Spotify</span>' : '') : '') +
            '</div>' +
            '<div id="st-avviso"></div>' +
            (ok ? '<div class="azioni"><button type="button" class="btn secondario piccolo" data-prova-sveglia>🔔 Prova il suono</button></div>' : '') +
            '</div></div>';
        })() : '') +
        '<p class="testo-muto">La sveglia viene creata nell\'Orologio del telefono: suona anche ad app chiusa e la posticipi o spegni come sempre. Se la modifichi nell\'Orologio, qui resta com\'era.</p>' +
        '<div class="azioni"><button class="btn secondario" type="button" data-indietro>Indietro</button></div></div></form>';
      var f = $('#form-sveglie', foglio);
      function leggiForm() { var o = String(f.ora.value || '06:30').split(':'); nuova.ora = +o[0]; nuova.minuti = +o[1]; nuova.nome = f.nome.value.trim(); nuova.vibra = f.vibra.checked; }
      f.querySelectorAll('[data-g]').forEach(function (b) { b.onclick = function () { var g = +b.dataset.g, k = nuova.giorni.indexOf(g); if (k >= 0) nuova.giorni.splice(k, 1); else nuova.giorni.push(g); b.setAttribute('aria-pressed', String(k < 0)); }; });
      f.querySelectorAll('[data-gset]').forEach(function (b) { b.onclick = function () { leggiForm(); nuova.giorni = b.dataset.gset.split(',').map(Number); disegnaSv(); }; });
      f.querySelectorAll('[data-reimposta]').forEach(function (b) { b.onclick = function () { var sv = sveglie()[+b.dataset.reimposta]; Native.audio.sveglia(sv).then(function () { toast('Sveglia delle ' + oraSv(sv) + ' impostata'); }).catch(erroreSveglia); }; });
      f.querySelectorAll('[data-togli-sv]').forEach(function (b) {
        b.onclick = function () {
          var l2 = sveglie(), i = +b.dataset.togliSv, sv = l2[i];
          if (!confirm('Togliere la sveglia delle ' + oraSv(sv) + '? L\'Orologio potrebbe chiedere conferma.')) return;
          l2.splice(i, 1); scriviLocale('aec.sveglie', l2);
          Native.audio.togliSveglia(sv).catch(function () { toast('Toglila anche dall\'Orologio'); });
          disegnaSv();
        };
      });
      $('[data-orologio]', f).onclick = function () { Native.audio.elencoSveglie().catch(erroreSveglia); };
      function salvaSt() {
        var st = { diurno: { on: !!(f['st-diurno'] && f['st-diurno'].checked), ora: f['st-diurno-ora'] ? f['st-diurno-ora'].value || '06:30' : '06:30' },
                   smonto: { on: !!(f['st-smonto'] && f['st-smonto'].checked), ora: f['st-smonto-ora'] ? f['st-smonto-ora'].value || '13:00' : '13:00' },
                   suono: sveglieTurno().suono };
        scriviLocale('aec.sveglieTurno', st);
        programmaSveglieTurno(true).then(function (r) {
          var av = $('#st-avviso', f); if (!av) return;
          var msg = [];
          if (r && r.prossima) msg.push('Prossima sveglia: <b>' + esc(quandoBreve(r.prossima)) + '</b> · ' + esc(r.nome));
          else if (st.diurno.on || st.smonto.on) msg.push('Nessuna sveglia nelle prossime 3 settimane.');
          if (r && r.schermoBloccato === false) msg.push('Per vedere la sveglia a telefono bloccato consenti le notifiche a schermo intero: <button type="button" class="btn secondario piccolo" data-perm-schermo>Consenti</button>');
          av.innerHTML = msg.length ? '<p class="testo-muto">' + msg.join('<br>') + '</p>' : '';
          var bp = $('[data-perm-schermo]', av); if (bp) bp.onclick = function () { Native.audio.permessoSchermoSveglia(); };
        });
      }
      ['st-diurno', 'st-diurno-ora', 'st-smonto', 'st-smonto-ora'].forEach(function (n) { if (f[n]) f[n].onchange = salvaSt; });
      function cambiaSuono(patch) {
        var st = sveglieTurno(); st.suono = Object.assign(st.suono, patch);
        scriviLocale('aec.sveglieTurno', st); programmaSveglieTurno(true);
        setTimeout(disegnaSv, 0); // dopo l'evento in corso (es. il campo che perde il fuoco)
      }
      function scegliBrano() {
        Native.audio.scegliBrano().then(function (r) { cambiaSuono({ tipo: 'file', uri: r.uri, nome: r.nome || 'Brano' }); toast('Brano scelto: ' + (r.nome || '')); })
          .catch(function (e) { if (!e || e.code !== 'ANNULLATO') toast((e && e.message) || 'Brano non scelto'); });
      }
      f.querySelectorAll('[data-suono]').forEach(function (b) { b.onclick = function () {
        if (b.dataset.suono === 'file' && !sveglieTurno().suono.uri) { scegliBrano(); return; } // prima scelgo il brano
        cambiaSuono({ tipo: b.dataset.suono });
      }; });
      var sb = $('[data-scegli-brano]', f);
      if (sb) sb.onclick = scegliBrano;
      var lk = f['st-spotify'];
      if (lk) lk.onchange = function () {
        var u = uriSpotify(lk.value);
        if (lk.value.trim() && !u) { toast('Non è un link di Spotify: usa Condividi → Copia link'); return; }
        cambiaSuono({ link: lk.value.trim(), spotify: u });
        if (u) toast('Spotify: ' + (NOMI_SPOTIFY[u.split(':')[1]] || 'link') + ' salvato');
      };
      var prova = $('[data-prova-sveglia]', f);
      if (prova) prova.onclick = function () {
        Native.audio.provaSveglia(sveglieTurno().suono).then(function () { toast('Suona: tocca Ferma', 'Ferma', function () { Native.audio.fermaSveglia(); }); }).catch(function () { toast('Disponibile solo nell\'app Android'); });
      };
      if (f['st-diurno'] && (f['st-diurno'].checked || f['st-smonto'].checked)) salvaSt();
      $('[data-indietro]', f).onclick = apriModi;
      f.onsubmit = function (e) {
        e.preventDefault(); leggiForm();
        var sv = { id: 's' + Date.now().toString(36), ora: nuova.ora, minuti: nuova.minuti, giorni: nuova.giorni.slice().sort(), nome: nuova.nome, vibra: nuova.vibra };
        Native.audio.sveglia(sv).then(function () {
          var l2 = sveglie().filter(function (x) { return !(x.ora === sv.ora && x.minuti === sv.minuti && (x.giorni || []).join() === sv.giorni.join()); });
          l2.push(sv); l2.sort(function (a, b) { return a.ora * 60 + a.minuti - b.ora * 60 - b.minuti; });
          scriviLocale('aec.sveglie', l2);
          nuova = { ora: sv.ora, minuti: sv.minuti, giorni: [], nome: '', vibra: true };
          toast('⏰ Sveglia ' + oraSv(sv) + ' ' + giorniSv(sv) + ' impostata'); disegnaSv();
        }).catch(erroreSveglia);
      };
    }
    disegnaSv();
    if (!foglio.open) foglio.showModal();
  }
  function modificaModo(id) {
    var lista = modi();
    var m = id ? JSON.parse(JSON.stringify(lista.filter(function (x) { return x.id === id; })[0])) : { id: 'm' + Date.now().toString(36), nome: '', icona: '🎧', suoneria: 'suona', dnd: '', rotazione: '', volumi: {} };
    if (!m.volumi) m.volumi = {};
    function sel(nome, opz, val) { return '<select name="' + nome + '">' + Object.keys(opz).map(function (k) { return '<option value="' + k + '"' + (k === (val || '') ? ' selected' : '') + '>' + opz[k] + '</option>'; }).join('') + '</select>'; }
    foglio.innerHTML = '<form method="dialog" id="form-modo"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica ' + esc(m.nome) : 'Nuovo modo') + '</h3><div class="campi">' +
      '<div class="durata"><label class="campo">Simbolo<select name="icona">' + ICONE_MODO.concat(ICONE_MODO.indexOf(m.icona) < 0 ? [m.icona] : []).map(function (i) { return '<option' + (i === m.icona ? ' selected' : '') + '>' + i + '</option>'; }).join('') + '</select></label>' +
      '<label class="campo">Nome<input type="text" name="nome" required maxlength="30" value="' + esc(m.nome) + '" placeholder="Es. Palestra"></label></div>' +
      '<div class="campo-modo"><b>Suoneria</b><div class="tipi tre-tasti" role="group" aria-label="Suoneria">' + Object.keys(SUONERIE).map(function (k) { return '<button type="button" data-suon="' + k + '" style="--c:var(--sangiovese)" aria-pressed="' + (m.suoneria === k) + '">' + SUONERIE[k] + '</button>'; }).join('') + '</div></div>' +
      '<div class="due"><label class="campo">Non disturbare' + sel('dnd', DND, m.dnd) + '</label><label class="campo">Rotazione schermo' + sel('rotazione', ROTAZIONI, m.rotazione) + '</label></div>' +
      '<div class="campo-modo"><b>Volumi</b><span class="aiuto">Togli la spunta per lasciare il volume com\'è. Con Vibra o Silenzio, suoneria e notifiche restano spente.</span><div class="volumi">' +
      VOLUMI.map(function (x) {
        var val = m.volumi[x[0]], on = val != null && val !== '';
        return '<div class="volume"><label class="spunta-vol"><input type="checkbox" name="usa-' + x[0] + '"' + (on ? ' checked' : '') + '> ' + x[1] + '</label>' +
          '<input type="range" min="0" max="100" step="5" name="vol-' + x[0] + '" value="' + (on ? val : 50) + '"' + (on ? '' : ' disabled') + ' aria-label="Volume ' + x[1] + '"><output>' + (on ? val + '%' : '—') + '</output></div>';
      }).join('') + '</div></div>' +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-indietro>Indietro</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina-modo>Elimina</button>' : '') + '</div>' +
      (id && modiPredefiniti().some(function (x) { return x.id === id; }) ? '<button class="btn secondario piccolo" type="button" data-ripristina-modo>Torna alle impostazioni iniziali</button>' : '') +
      '</div></form>';
    var f = $('#form-modo', foglio);
    f.querySelectorAll('[data-suon]').forEach(function (b) { b.onclick = function () { m.suoneria = b.dataset.suon; f.querySelectorAll('[data-suon]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); }); }; });
    f.querySelectorAll('.volume').forEach(function (r) {
      var cb = $('input[type=checkbox]', r), rg = $('input[type=range]', r), out = $('output', r);
      cb.onchange = function () { rg.disabled = !cb.checked; out.textContent = cb.checked ? rg.value + '%' : '—'; };
      rg.oninput = function () { out.textContent = rg.value + '%'; };
    });
    $('[data-indietro]', f).onclick = apriModi;
    var el = $('[data-elimina-modo]', f);
    if (el) el.onclick = function () {
      if (!confirm('Eliminare il modo «' + m.nome + '»?')) return;
      salvaModi(modi().filter(function (x) { return x.id !== id; }));
      if (leggiLocale('aec.modoAttivo', null) === id) { scriviLocale('aec.modoAttivo', null); Native.audio.segna(''); }
      disegna(); apriModi();
    };
    var rp = $('[data-ripristina-modo]', f);
    if (rp) rp.onclick = function () {
      var orig = modiPredefiniti().filter(function (x) { return x.id === id; })[0];
      salvaModi(modi().map(function (x) { return x.id === id ? orig : x; })); toast('Modo ripristinato'); apriModi();
    };
    f.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(f);
      m.nome = String(fd.get('nome') || '').trim() || 'Modo'; m.icona = fd.get('icona'); m.dnd = fd.get('dnd'); m.rotazione = fd.get('rotazione');
      VOLUMI.forEach(function (x) { m.volumi[x[0]] = fd.get('usa-' + x[0]) ? +fd.get('vol-' + x[0]) : null; });
      var l = modi(), i = l.map(function (x) { return x.id; }).indexOf(m.id);
      if (i >= 0) l[i] = m; else l.push(m);
      salvaModi(l); disegna(); toast('Modo salvato'); apriModi();
    };
  }
  if (Native.isApp) document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') verificaModo(); });

  // ---------- avvio ----------
  Native.creaCanale().then(function () { if (Native.isApp) Native.permesso(); });
  if ('serviceWorker' in navigator && !Native.isApp && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  var daLink = leggiCollegamento(location.hash);
  if (daLink) {
    history.replaceState(null, '', location.pathname + '#oggi'); // tolgo la chiave dalla barra degli indirizzi
    if (Store.conf().url !== daLink.url || Store.conf().chiave !== daLink.chiave) collega(daLink.url, daLink.chiave);
  }
  disegna();
  verificaModo();
  datiWidgetComandi();
  Store.sync();
  // nell'app: carico l'elenco dell'album all'avvio, così il widget foto si aggiorna anche senza aprire l'album
  if (Native.isApp && Store.configurato()) setTimeout(function () { Album.aggiorna(); }, 4000);
  setInterval(function () { if (document.visibilityState === 'visible') Store.sync(); }, 5 * 60 * 1000);
  // ridisegna al cambio di giorno (app aperta a mezzanotte)
  var giorno = C.oggi();
  setInterval(function () { if (C.oggi() !== giorno) { giorno = C.oggi(); disegna(); } }, 60000);
})();
