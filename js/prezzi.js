/* A&C — Monitora prezzi dei voli (sezione Viaggi).
   Le tratte sono voci di tipo "prezzovolo" (condivise tra i telefoni); i prezzi li cerca lo script
   ogni mattina su Google Flights (tramite SerpApi) e li salva nel foglio "PrezziVoli". */
var PrezziVoli = (function () {
  'use strict';
  var C = Casa;
  var ui = null; // { esc, toast, foglio, ridisegna }
  var K_CACHE = 'aec.prezziVoli', K_VISTI = 'aec.prezziVoliVisti';

  function leggi(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* niente */ } }
  function esc(t) { return ui ? ui.esc(t) : String(t == null ? '' : t); }

  var cache = leggi(K_CACHE, { t: 0, storico: {}, chiave: null, automatico: null, rimaste: null });

  function tratte() {
    return Store.lista().filter(function (v) { return v.tipo === 'prezzovolo'; })
      .sort(function (a, b) { return (a.andata || '') < (b.andata || '') ? -1 : 1; });
  }
  function storico(id) { return (cache.storico || {})[id] || []; }
  function conPrezzo(id) { return storico(id).filter(function (x) { return x.prezzo != null; }); }
  function ultimo(id) { var l = storico(id); return l.length ? l[l.length - 1] : null; }
  function ultimoPrezzo(id) { var l = conPrezzo(id); return l.length ? l[l.length - 1] : null; }
  function precedente(id) { var l = conPrezzo(id); return l.length > 1 ? l[l.length - 2] : null; }
  function minimo(id) { var l = conPrezzo(id); return l.length ? l.reduce(function (a, b) { return b.prezzo < a.prezzo ? b : a; }) : null; }
  function euro(n) { return n == null ? '—' : Math.round(n).toLocaleString('it-IT') + ' €'; }
  function finita(m) { return m.andata && C.addGiorni(m.andata, +m.flex || 0) < C.oggi(); }
  function codici(s) {
    return String(s || '').split(/[,;/]+/).map(function (p) { var t = p.toUpperCase().match(/\b[A-Z]{3}\b/); return t ? t[0] : ''; }).filter(Boolean).join(',');
  }
  function quandoCheck(q) {
    if (!q) return '';
    var g = q.slice(0, 10), ora = q.slice(11, 16);
    return (g === C.oggi() ? 'oggi' : g === C.addGiorni(C.oggi(), -1) ? 'ieri' : C.dataBreve(g)) + (ora ? ' alle ' + ora : '');
  }
  function testoDate(m) {
    var t = C.dataBreve(m.andata) + (m.ritorno ? ' – ' + C.dataBreve(m.ritorno) : ' · solo andata');
    if (+m.flex) t += ' · ±' + m.flex + ' gg';
    return t;
  }
  function livello(l) {
    var s = String(l || '').toLowerCase();
    if (/low|bass/.test(s)) return { testo: 'Prezzo basso', classe: 'basso' };
    if (/high|alt/.test(s)) return { testo: 'Prezzo alto', classe: 'alto' };
    if (/typ|medi|norm/.test(s)) return { testo: 'Nella media', classe: 'medio' };
    return null;
  }

  // link per comprare: quello di Google Flights restituito dalla ricerca, altrimenti una ricerca in linguaggio naturale
  function urlGoogle(m, r) {
    if (r && r.dettagli && r.dettagli.url && !+m.flex) return r.dettagli.url;
    var andata = (r && r.andata) || m.andata, ritorno = (r && r.ritorno) || m.ritorno;
    var q = 'Voli da ' + codici(m.da).split(',')[0] + ' a ' + codici(m.a).split(',')[0] + ' il ' + andata + (ritorno ? ' ritorno il ' + ritorno : ' solo andata') + (+m.adulti > 1 ? ' ' + m.adulti + ' adulti' : '');
    return 'https://www.google.com/travel/flights?hl=it&curr=EUR&q=' + encodeURIComponent(q);
  }

  // ---------- grafico (SVG) ----------
  function grafico(serie, opz) {
    opz = opz || {};
    var W = 320, H = opz.alto || 96, pad = { l: opz.assi ? 40 : 4, r: 6, t: 8, b: opz.assi ? 18 : 6 };
    var tutti = [];
    serie.forEach(function (s) { s.punti.forEach(function (p) { tutti.push(p); }); });
    if (tutti.length < 2) return '';
    var x0 = Math.min.apply(null, tutti.map(function (p) { return p[0]; })), x1 = Math.max.apply(null, tutti.map(function (p) { return p[0]; }));
    var ys = tutti.map(function (p) { return p[1]; }); if (opz.soglia != null) ys.push(+opz.soglia);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (y1 - y0 < 10) { y0 -= 5; y1 += 5; }
    var sx = function (x) { return pad.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - pad.l - pad.r); };
    var sy = function (y) { return pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b); };
    var h = '<svg class="grafico-prezzi" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opz.aria || 'Andamento del prezzo') + '">';
    if (opz.assi) {
      h += '<text x="' + (pad.l - 6) + '" y="' + (sy(y1) + 4) + '" text-anchor="end">' + Math.round(y1) + '</text>' +
        '<text x="' + (pad.l - 6) + '" y="' + (sy(y0) + 4) + '" text-anchor="end">' + Math.round(y0) + '</text>' +
        '<line class="griglia" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + sy(y1) + '" y2="' + sy(y1) + '"/>' +
        '<line class="griglia" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + sy(y0) + '" y2="' + sy(y0) + '"/>';
      if (opz.etichette) h += '<text x="' + pad.l + '" y="' + (H - 4) + '">' + esc(opz.etichette[0]) + '</text><text x="' + (W - pad.r) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(opz.etichette[1]) + '</text>';
    }
    if (opz.soglia != null) h += '<line class="soglia" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + sy(+opz.soglia) + '" y2="' + sy(+opz.soglia) + '"/>';
    serie.forEach(function (s) {
      if (!s.punti.length) return;
      var pts = s.punti.map(function (p) { return sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join(' ');
      h += '<polyline class="' + s.classe + '" points="' + pts + '" vector-effect="non-scaling-stroke"/>';
      var u = s.punti[s.punti.length - 1];
      if (s.ultimo) h += '<circle class="' + s.classe + '-punto" cx="' + sx(u[0]).toFixed(1) + '" cy="' + sy(u[1]).toFixed(1) + '" r="3.5"/>';
    });
    return h + '</svg>';
  }
  function msDi(q) { return new Date(+q.slice(0, 4), +q.slice(5, 7) - 1, +q.slice(8, 10), +q.slice(11, 13) || 0, +q.slice(14, 16) || 0).getTime(); }
  function serieMia(id) { return conPrezzo(id).map(function (x) { return [msDi(x.quando), x.prezzo]; }); }

  // ---------- elenco (in fondo alla pagina Viaggi) ----------
  function cardTratta(m) {
    var r = ultimoPrezzo(m.id), u = ultimo(m.id), p = precedente(m.id), mn = minimo(m.id);
    var diff = r && p ? r.prezzo - p.prezzo : 0;
    var soglia = m.soglia === '' || m.soglia == null ? null : +m.soglia;
    var stato = m.attivo === false ? '<span class="pv-stato">In pausa</span>' : finita(m) ? '<span class="pv-stato">Date passate</span>' : '';
    var errore = u && u.dettagli && u.dettagli.errore ? u.dettagli.errore : '';
    var nota = u && u.prezzo == null && u.dettagli && u.dettagli.nota ? u.dettagli.nota : '';
    var trend = r && p && diff ? '<span class="pv-trend ' + (diff < 0 ? 'giu' : 'su') + '">' + (diff < 0 ? '▼ ' : '▲ ') + euro(Math.abs(diff)) + '</span>' : '';
    var sotto = r && soglia != null && r.prezzo <= soglia;
    return '<button type="button" class="card-prezzo' + (sotto ? ' sotto-soglia' : '') + '" data-prezzo-volo="' + esc(m.id) + '">' +
      '<span class="pv-alto"><span class="pv-tratta">✈️ ' + esc(m.titolo || (codici(m.da) + ' → ' + codici(m.a))) + '</span>' + stato + '</span>' +
      '<span class="pv-date">' + esc(testoDate(m)) + (+m.adulti > 1 ? ' · ' + m.adulti + ' adulti' : '') + '</span>' +
      '<span class="pv-prezzo"><b>' + (r ? euro(r.prezzo) : '—') + '</b>' + trend + (sotto ? '<span class="pv-badge">Sotto soglia</span>' : '') + '</span>' +
      (grafico([{ punti: serieMia(m.id), classe: 'linea-mia', ultimo: true }], { alto: 46, soglia: soglia, aria: 'Andamento del prezzo ' + (m.titolo || '') }) || '') +
      '<span class="pv-meta">' + esc([mn && r && mn.prezzo < r.prezzo ? 'minimo ' + euro(mn.prezzo) : '', soglia != null ? 'soglia ' + euro(soglia) : '',
        r && +m.flex && r.andata !== m.andata ? 'giorno migliore ' + C.dataBreve(r.andata) : '',
        u ? 'controllato ' + quandoCheck(u.quando) : 'non ancora controllato'].filter(Boolean).join(' · ')) + '</span>' +
      (errore ? '<span class="sc-avviso">⚠ ' + esc(errore) + '</span>' : nota ? '<span class="pv-meta">' + esc(nota) + '</span>' : '') + '</button>';
  }
  function htmlSezione() {
    var l = tratte(), attive = l.filter(function (m) { return !finita(m); }), passate = l.filter(finita);
    var h = '<h2 class="titolo-prezzi">Monitora prezzi <small>' + (l.length || '') + '</small><button type="button" class="btn icona piccola-icona" data-prezzi-impostazioni aria-label="Impostazioni del monitoraggio prezzi">⚙</button></h2>';
    if (cache.chiave === false) h += '<p class="avviso-prezzi">Per cercare i prezzi su Google Flights serve una chiave SerpApi gratuita. <button type="button" class="btn secondario piccolo" data-prezzi-impostazioni>Inserisci la chiave</button></p>';
    if (!l.length) h += '<div class="vuoto">Segui il prezzo di un volo: ogni mattina lo script lo controlla su Google Flights e ti avvisa quando scende. Puoi usare date esatte o flessibili ±3 giorni.</div>';
    h += attive.map(cardTratta).join('');
    if (passate.length) h += '<details class="pv-passate"><summary>Tratte con date passate · ' + passate.length + '</summary>' + passate.map(cardTratta).join('') + '</details>';
    return h + '<div class="azioni"><button class="btn secondario piccolo" type="button" data-nuovo-prezzo>+ Monitora un volo</button></div>';
  }

  // ---------- dettaglio ----------
  function apriDettaglio(id) {
    var m = Store.get(id); if (!m) return;
    var fg = ui.foglio, r = ultimoPrezzo(id), u = ultimo(id), mn = minimo(id), d = (r && r.dettagli) || {};
    var soglia = m.soglia === '' || m.soglia == null ? null : +m.soglia;
    var mie = serieMia(id), goo = (d.storicoGoogle || []).map(function (p) { return [p[0] * 1000, p[1]]; });
    var serie = [];
    if (goo.length > 1) serie.push({ punti: goo, classe: 'linea-google' });
    serie.push({ punti: mie, classe: 'linea-mia', ultimo: true });
    var tuttiX = goo.concat(mie).map(function (p) { return p[0]; });
    var etich = tuttiX.length > 1 ? [C.dataBreve(C.iso(new Date(Math.min.apply(null, tuttiX)))), C.dataBreve(C.iso(new Date(Math.max.apply(null, tuttiX))))] : null;
    var gr = grafico(serie, { alto: 150, assi: true, soglia: soglia, etichette: etich });
    var lv = livello(d.livello);
    var h = '<form method="dialog"><div class="maniglia"></div><h3 id="foglio-titolo">✈️ ' + esc(m.titolo || (codici(m.da) + ' → ' + codici(m.a))) + '</h3>' +
      '<p class="testo-muto" style="margin-top:0">' + esc(testoDate(m)) + (+m.adulti > 1 ? ' · ' + m.adulti + ' adulti' : '') + (m.scali === '1' ? ' · solo diretti' : m.scali === '2' ? ' · massimo 1 scalo' : '') + '</p>' +
      '<div class="pv-grande"><b>' + (r ? euro(r.prezzo) : '—') + '</b>' + (lv ? '<span class="pv-livello ' + lv.classe + '">' + lv.testo + '</span>' : '') + '</div>';
    if (r) {
      var righe = [];
      if (+m.flex) righe.push('Giorno più economico: ' + C.etichettaGiorno(r.andata) + (r.ritorno ? ' → ' + C.dataBreve(r.ritorno) : ''));
      if (r.compagnia) righe.push(r.compagnia + (d.voli ? ' · ' + d.voli : ''));
      if (d.partenza) righe.push('Partenza ' + d.partenza.slice(11, 16) + (d.arrivo ? ' → arrivo ' + d.arrivo.slice(11, 16) + (d.arrivo.slice(0, 10) !== d.partenza.slice(0, 10) ? ' (+1)' : '') : '') +
        (d.durata ? ' · ' + Math.floor(d.durata / 60) + ' h ' + ('0' + d.durata % 60).slice(-2) : '') + (d.scali != null ? ' · ' + (d.scali ? d.scali + (d.scali === 1 ? ' scalo' : ' scali') : 'diretto') : ''));
      if (d.tipico && d.tipico.length === 2) righe.push('Di solito tra ' + euro(d.tipico[0]) + ' e ' + euro(d.tipico[1]));
      if (mn) righe.push('Minimo visto: ' + euro(mn.prezzo) + ' (' + quandoCheck(mn.quando) + ')');
      if (m.ritorno) righe.push('Prezzo andata e ritorno' + (+m.adulti > 1 ? ' per ' + m.adulti + ' adulti' : ''));
      h += '<div class="pv-dettagli">' + righe.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    }
    if (gr) h += '<div class="pv-grafico">' + gr + '<p class="legenda">' + (goo.length > 1 ? '<span class="l-google">Storico di Google Flights</span>' : '') + '<span class="l-mia">Controlli di A&amp;C</span>' + (soglia != null ? '<span class="l-soglia">Soglia ' + euro(soglia) + '</span>' : '') + '</p></div>';
    else h += '<p class="testo-muto">Il grafico compare dopo due controlli.</p>';
    if (d.giorni && d.giorni.length) {
      var min = Math.min.apply(null, d.giorni.map(function (g) { return g[2]; }));
      h += '<h4 class="pv-sotto">Prezzo per giorno di partenza</h4><div class="pv-giorni">' + d.giorni.map(function (g) {
        var gd = C.parse(g[0]);
        return '<span class="pv-giorno' + (g[2] === min ? ' migliore' : '') + (g[0] === m.andata ? ' scelto' : '') + '"><small>' + C.GIORNI_LUNGHI[gd.getDay()].slice(0, 3) + '</small><b>' + gd.getDate() + '</b><span>' + euro(g[2]) + '</span></span>';
      }).join('') + '</div>';
    }
    if (u && u.dettagli && u.dettagli.errore) h += '<p class="sc-avviso">⚠ Ultimo controllo: ' + esc(u.dettagli.errore) + '</p>';
    if (m.note) h += '<p style="white-space:pre-wrap">' + esc(m.note) + '</p>';
    h += '<div class="azioni"><a class="btn" href="' + esc(urlGoogle(m, r)) + '" target="_blank" rel="noopener">Apri in Google Flights</a>' +
      '<button type="button" class="btn secondario" data-controlla>↻ Controlla ora</button></div>' +
      '<div class="azioni"><button type="button" class="btn secondario piccolo" data-modifica>Modifica</button>' +
      '<button type="button" class="btn secondario piccolo" data-pausa>' + (m.attivo === false ? '▶ Riprendi' : '⏸ Metti in pausa') + '</button>' +
      '<button type="button" class="btn secondario piccolo" data-chiudi style="margin-left:auto">Chiudi</button></div></form>';
    fg.classList.remove('visore');
    fg.innerHTML = h;
    if (!fg.open) fg.showModal();
    fg.querySelector('[data-chiudi]').onclick = function () { fg.close(); };
    fg.querySelector('[data-modifica]').onclick = function () { apriModulo(id); };
    fg.querySelector('[data-pausa]').onclick = function () {
      var x = JSON.parse(JSON.stringify(Store.get(id))); x.attivo = x.attivo === false; Store.upsert(x);
      ui.toast(x.attivo ? 'Monitoraggio ripreso' : 'Monitoraggio in pausa'); apriDettaglio(id);
    };
    fg.querySelector('[data-controlla]').onclick = function (e) {
      var b = e.currentTarget; b.disabled = true; b.textContent = 'Cerco su Google Flights…';
      controllaOra(id).then(function () { if (fg.open) apriDettaglio(id); }, function () { b.disabled = false; b.textContent = '↻ Controlla ora'; });
    };
  }

  // ---------- modulo ----------
  // tutti gli aeroporti con voli di linea (js/aeroporti.js): ricerca per codice, città, nome o paese
  var aer = null;
  function senzaAccenti(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function aeroporti() {
    if (aer) return aer;
    var paese = function (c) { try { return new Intl.DisplayNames(['it'], { type: 'region' }).of(c) || c; } catch (e) { return c; } };
    var nomiPaese = {};
    aer = { elenco: [], perCodice: {} };
    String(window.AEROPORTI_TUTTI || '').split('\n').forEach(function (r) {
      var x = r.split('|'); if (x.length < 4) return;
      if (!nomiPaese[x[2]]) nomiPaese[x[2]] = paese(x[2]);
      var o = { c: x[0], n: x[1], p: nomiPaese[x[2]], w: +x[3], k: senzaAccenti(x[0] + ' ' + x[1] + ' ' + (x[4] || '') + ' ' + nomiPaese[x[2]]) };
      aer.elenco.push(o); aer.perCodice[o.c] = o;
    });
    return aer;
  }
  function nomeAeroporto(cod) { var o = aeroporti().perCodice[String(cod || '').split(',')[0]]; return o ? o.n : ''; }
  function cercaAeroporti(q) {
    q = senzaAccenti(q).trim(); if (q.length < 2) return [];
    var parole = q.split(/\s+/), out = [];
    aeroporti().elenco.forEach(function (o) {
      if (!parole.every(function (p) { return o.k.indexOf(p) >= 0; })) return;
      var n = senzaAccenti(o.n), punti = o.c.toLowerCase() === q ? 0 : n.indexOf(q) === 0 ? 1 : (' ' + n).indexOf(' ' + parole[0]) >= 0 ? 2 : 3;
      out.push([punti * 10 + o.w, o]);
    });
    return out.sort(function (a, b) { return a[0] - b[0]; }).slice(0, 8).map(function (x) { return x[1]; });
  }
  // suggerimenti sotto i campi Da / A: si scrive una città o un codice, il tocco mette il codice (anche più di uno, separati da virgola)
  function suggeritore(f, nome) {
    var inp = f[nome], box = f.querySelector('[data-sugg="' + nome + '"]'), nomi = f.querySelector('[data-nomi="' + nome + '"]');
    function scriviNomi() { nomi.textContent = codici(inp.value).split(',').filter(Boolean).map(function (c) { var n = nomeAeroporto(c); return n ? c + ' = ' + n : c + ' = ?'; }).join(' · '); }
    inp.addEventListener('input', function () {
      var parti = inp.value.split(','), q = parti[parti.length - 1];
      var l = cercaAeroporti(q);
      box.innerHTML = l.map(function (o) { return '<button type="button" data-cod="' + o.c + '"><b>' + o.c + '</b> ' + esc(o.n) + ' <small>' + esc(o.p) + '</small></button>'; }).join('');
      box.hidden = !l.length;
      scriviNomi();
    });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cod]'); if (!b) return;
      var parti = inp.value.split(','); parti[parti.length - 1] = (parti.length > 1 ? ' ' : '') + b.dataset.cod;
      inp.value = parti.join(','); box.hidden = true; box.innerHTML = ''; scriviNomi(); inp.focus();
    });
    scriviNomi();
  }
  function apriModulo(id, preset) {
    var m = id ? JSON.parse(JSON.stringify(Store.get(id))) : Object.assign({ tipo: 'prezzovolo', da: 'BLQ', a: '', andata: C.addGiorni(C.oggi(), 30), ritorno: '', flex: 0, adulti: 2, scali: '', soglia: '', attivo: true, note: '' }, preset || {});
    var fg = ui.foglio;
    fg.classList.remove('visore');
    fg.innerHTML = '<form method="dialog" id="form-prezzo"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica tratta' : 'Monitora un volo') + '</h3><div class="campi">' +
      '<label class="campo">Da<input type="text" name="da" required value="' + esc(m.da) + '" placeholder="Città o codice (es. Bologna, BLQ)" autocomplete="off" autocapitalize="off"><span class="aiuto" data-nomi="da"></span></label>' +
      '<div class="sugg-aer" data-sugg="da" hidden></div>' +
      '<label class="campo">A<input type="text" name="a" required value="' + esc(m.a) + '" placeholder="Città o codice (es. Tokyo, NRT)" autocomplete="off" autocapitalize="off"><span class="aiuto" data-nomi="a"></span></label>' +
      '<div class="sugg-aer" data-sugg="a" hidden></div>' +
      '<span class="aiuto">Scrivi la città, il nome o il codice e tocca l\'aeroporto. Più aeroporti separati da virgola (es. BLQ, FRL).</span>' +
      '<div class="due"><label class="campo">Andata<input type="date" name="andata" required value="' + esc(m.andata) + '"></label>' +
      '<label class="campo">Ritorno<input type="date" name="ritorno" value="' + esc(m.ritorno || '') + '"></label></div>' +
      '<span class="aiuto">Ritorno vuoto = solo andata.</span>' +
      '<fieldset class="campo"><legend>Date</legend><div class="pv-scelte" role="radiogroup">' +
      '<label class="scelta"><input type="radio" name="flex" value="0"' + (+m.flex ? '' : ' checked') + '> Date esatte</label>' +
      '<label class="scelta"><input type="radio" name="flex" value="3"' + (+m.flex ? ' checked' : '') + '> ± 3 giorni</label></div>' +
      '<span class="aiuto">Con ±3 giorni cerca il giorno di partenza più economico tra 3 giorni prima e 3 dopo, con la stessa durata del viaggio.</span></fieldset>' +
      '<div class="due"><label class="campo">Adulti<input type="number" name="adulti" min="1" max="9" step="1" value="' + esc(m.adulti || 1) + '"></label>' +
      '<label class="campo">Scali<select name="scali"><option value=""' + (!m.scali ? ' selected' : '') + '>Qualsiasi</option><option value="1"' + (m.scali === '1' ? ' selected' : '') + '>Solo diretti</option><option value="2"' + (m.scali === '2' ? ' selected' : '') + '>Massimo 1 scalo</option></select></label></div>' +
      '<label class="campo">Avvisami sotto (€)<input type="number" name="soglia" min="0" step="1" inputmode="numeric" value="' + esc(m.soglia == null ? '' : m.soglia) + '" placeholder="Es. 450"><span class="aiuto">Prezzo totale. Ti avviso anche quando cala del 10% o più.</span></label>' +
      '<label class="campo">Note<textarea name="note" maxlength="1000">' + esc(m.note || '') + '</textarea></label>' +
      '<div class="azioni"><button class="btn" type="submit">' + (id ? 'Salva' : 'Inizia a monitorare') + '</button><button class="btn secondario" type="button" data-annulla>Annulla</button>' +
      (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
    if (!fg.open) fg.showModal();
    var f = fg.querySelector('form');
    suggeritore(f, 'da'); suggeritore(f, 'a');
    f.querySelector('[data-annulla]').onclick = function () { fg.close(); };
    if (id) f.querySelector('[data-elimina]').onclick = function () { if (confirm('Smettere di monitorare questa tratta?')) { Store.elimina(id); fg.close(); ui.toast('Tratta eliminata'); } };
    f.onsubmit = function (e) {
      e.preventDefault();
      var da = codici(f.da.value), a = codici(f.a.value);
      if (!da) { ui.toast('Scrivi il codice dell\'aeroporto di partenza (es. BLQ)'); f.da.focus(); return; }
      if (!a) { ui.toast('Scrivi il codice dell\'aeroporto di arrivo (es. NRT)'); f.a.focus(); return; }
      if (!f.andata.value) { f.andata.focus(); return; }
      if (f.ritorno.value && f.ritorno.value < f.andata.value) { ui.toast('Il ritorno è prima dell\'andata'); return; }
      var flex = +f.querySelector('input[name=flex]:checked').value;
      if (C.addGiorni(f.andata.value, flex) < C.oggi()) { ui.toast('La data di andata è già passata'); return; }
      var nomeDi = function (cod) { return nomeAeroporto(cod).split(' – ')[0]; };
      var cambiata = !id || m.da !== da || m.a !== a || m.andata !== f.andata.value || (m.ritorno || '') !== f.ritorno.value || +m.flex !== flex || +m.adulti !== +f.adulti.value || (m.scali || '') !== f.scali.value;
      m.da = da; m.a = a; m.andata = f.andata.value; m.ritorno = f.ritorno.value; m.flex = flex;
      m.adulti = Math.max(1, Math.min(9, parseInt(f.adulti.value, 10) || 1)); m.scali = f.scali.value;
      m.soglia = f.soglia.value === '' ? '' : Math.round(parseFloat(String(f.soglia.value).replace(',', '.')));
      m.note = f.note.value.trim();
      m.titolo = da.split(',')[0] + ' → ' + a.split(',')[0] + (nomeDi(a) ? ' ' + nomeDi(a) : '');
      if (m.attivo === undefined) m.attivo = true;
      var salvato = Store.upsert(m);
      fg.close();
      ui.toast(id ? 'Tratta aggiornata' : 'Tratta aggiunta: cerco il prezzo…');
      if (cambiata && Store.configurato() && cache.chiave !== false) controllaOra(salvato.id).catch(function () {});
    };
  }

  // ---------- impostazioni (chiave SerpApi) ----------
  function apriImpostazioni() {
    var fg = ui.foglio;
    fg.classList.remove('visore');
    var stato = cache.chiave ? 'Chiave salvata nello script' + (cache.automatico ? ' · controllo automatico ogni mattina verso le 7' : '') + (cache.rimaste != null ? ' · ricerche rimaste questo mese: ' + cache.rimaste : '') : 'Nessuna chiave salvata';
    fg.innerHTML = '<form method="dialog" id="form-serpapi"><div class="maniglia"></div><h3 id="foglio-titolo">Prezzi da Google Flights</h3><div class="campi">' +
      '<p style="margin-top:0">I prezzi arrivano da Google Flights tramite <b>SerpApi</b>. Il piano gratuito comprende 250 ricerche al mese: ogni tratta usa una ricerca al giorno, anche con le date ±3 giorni. Con 8 tratte attive sei dentro il piano gratuito.</p>' +
      '<ol class="passi"><li>Registrati su <a href="https://serpapi.com/users/sign_up" target="_blank" rel="noopener">serpapi.com</a> (gratis, basta l\'email).</li><li>Copia la chiave da <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener">Api Key</a>.</li><li>Incollala qui sotto e salva: lo script la conserva e attiva il controllo di ogni mattina.</li></ol>' +
      '<p class="testo-muto">' + esc(stato) + '</p>' +
      '<label class="campo">Chiave SerpApi<input type="password" name="chiave" autocomplete="off" placeholder="' + (cache.chiave ? '•••••••• (lascia vuoto per non cambiarla)' : 'Incolla la chiave') + '"></label>' +
      '<p id="serpapi-esito" class="testo-muto" aria-live="polite"></p>' +
      '<div class="azioni"><button class="btn" type="submit">Salva</button><button class="btn secondario" type="button" data-annulla>Chiudi</button>' +
      (cache.chiave ? '<button class="btn pericolo" type="button" data-togli style="margin-left:auto">Togli la chiave</button>' : '') + '</div></div></form>';
    if (!fg.open) fg.showModal();
    var f = fg.querySelector('form'), esito = f.querySelector('#serpapi-esito');
    f.querySelector('[data-annulla]').onclick = function () { fg.close(); };
    function invia(val) {
      if (!Store.configurato()) { esito.textContent = 'Collega prima il foglio di casa (⚙ Impostazioni).'; return; }
      esito.textContent = 'Salvo e provo la chiave…';
      Store.chiama('voli_imposta', val === undefined ? {} : { serpapi: val }).then(function (r) {
        Object.assign(cache, { chiave: r.chiave, automatico: r.automatico, rimaste: r.rimaste }); scrivi(K_CACHE, cache);
        fg.close(); ui.toast(r.chiave ? 'Chiave salvata' + (r.rimaste != null ? ': ' + r.rimaste + ' ricerche rimaste' : '') : 'Chiave tolta');
        if (ui.ridisegna) ui.ridisegna();
      }).catch(function (e) { esito.textContent = e.message === 'Failed to fetch' ? 'Nessuna connessione con lo script' : e.message; });
    }
    f.onsubmit = function (e) { e.preventDefault(); var v = f.chiave.value.trim(); if (!v && !cache.chiave) { f.chiave.focus(); return; } invia(v || undefined); };
    var tg = f.querySelector('[data-togli]');
    if (tg) tg.onclick = function () { if (confirm('Togliere la chiave? I prezzi non verranno più controllati.')) invia(''); };
  }

  // ---------- dati dallo script ----------
  var inCorso = null;
  function applica(r) {
    cache.storico = r.storico || {}; cache.t = Date.now();
    if (r.chiave !== undefined) cache.chiave = r.chiave;
    if (r.automatico !== undefined) cache.automatico = r.automatico;
    if (r.rimaste !== undefined && r.rimaste !== null) cache.rimaste = r.rimaste;
    scrivi(K_CACHE, cache);
    avvisi();
  }
  function aggiorna(forza) {
    if (!Store.configurato() || !tratte().length) return Promise.resolve();
    if (!forza && Date.now() - (cache.t || 0) < 20 * 60000) return Promise.resolve();
    if (inCorso) return inCorso;
    inCorso = Store.chiama('voli_prezzi').then(function (r) { applica(r); if (ui && ui.ridisegna) ui.ridisegna(); })
      .catch(function (e) { console.warn('Prezzi voli non letti', e); })
      .then(function () { inCorso = null; });
    return inCorso;
  }
  function controllaOra(id) {
    var m = Store.get(id);
    if (!m) return Promise.reject(new Error('Tratta non trovata'));
    if (!Store.configurato()) { ui.toast('Collega prima il foglio di casa'); return Promise.reject(new Error('non collegato')); }
    return Store.chiama('voli_controlla', { monitor: m }).then(function (r) {
      applica(r);
      if (r.errore) ui.toast('Prezzo non trovato: ' + r.errore);
      else { var u = ultimoPrezzo(id); ui.toast(u ? 'Prezzo di oggi: ' + euro(u.prezzo) + (r.rimaste != null ? ' · ' + r.rimaste + ' ricerche rimaste' : '') : 'Nessun volo trovato per queste date'); }
      if (ui.ridisegna) ui.ridisegna();
      return r;
    }).catch(function (e) {
      ui.toast('Controllo non riuscito: ' + (e.message === 'Failed to fetch' ? 'nessuna connessione' : e.message));
      throw e;
    });
  }

  // avviso sul telefono (icona aereo) quando arriva un prezzo nuovo sotto soglia o in calo del 10%
  function avvisi() {
    var visti = leggi(K_VISTI, {}), cambiato = false, limite = C.addGiorni(C.oggi(), -2);
    tratte().forEach(function (m) {
      if (m.attivo === false) return;
      var l = conPrezzo(m.id), r = l[l.length - 1], firma = r ? r.quando + '|' + r.prezzo + '|' + l.length : '';
      if (!r || visti[m.id] === firma) return;
      visti[m.id] = firma; cambiato = true;
      if (r.quando.slice(0, 10) < limite) return;
      var prec = l.length > 1 ? l[l.length - 2].prezzo : null, soglia = m.soglia === '' || m.soglia == null ? null : +m.soglia;
      var sotto = soglia != null && r.prezzo <= soglia && (prec == null || prec > soglia), calo = prec != null && r.prezzo <= prec * 0.9;
      if (!sotto && !calo) return;
      Native.notificaSubito({
        chiave: 'pv' + m.id + r.quando, icona: 'ic_stat_volo',
        titolo: '✈ ' + (m.titolo || m.da + ' → ' + m.a) + ': ' + euro(r.prezzo),
        testo: (sotto ? 'Sotto la soglia di ' + euro(soglia) : 'Sceso da ' + euro(prec)) + ' · ' + C.dataBreve(r.andata) + (r.ritorno ? ' – ' + C.dataBreve(r.ritorno) : '')
      });
    });
    if (cambiato) scrivi(K_VISTI, visti);
  }

  // dati di partenza da un viaggio (primo volo: aeroporto di partenza, ultimo arrivo, date del viaggio)
  function daViaggio(v) {
    var voli = (v.voli || []).slice().sort(function (a, b) { return (a.data || '') < (b.data || '') ? -1 : 1; }), primo = voli[0] || {};
    var arrivo = (primo.tappe && primo.tappe.length ? primo.tappe[primo.tappe.length - 1].a : primo.a) || '';
    return { da: codici(primo.da) || 'BLQ', a: codici(arrivo), andata: primo.data || v.data, ritorno: v.fine && v.fine !== v.data ? v.fine : '', note: v.titolo };
  }

  function click(e) {
    var t = e.target.closest('button, a'); if (!t) return false;
    var d = t.dataset;
    if (d.prezzoVolo) { apriDettaglio(d.prezzoVolo); return true; }
    if (d.nuovoPrezzo !== undefined) { apriModulo(null); return true; }
    if (d.prezziImpostazioni !== undefined) { apriImpostazioni(); return true; }
    if (d.monitoraViaggio) { var v = Store.get(d.monitoraViaggio); if (v) apriModulo(null, daViaggio(v)); return true; }
    return false;
  }

  return {
    init: function (u) { ui = u; if (Store.configurato()) setTimeout(function () { aggiorna(false); }, 2500); },
    htmlSezione: htmlSezione, click: click, aggiorna: aggiorna, apriModulo: apriModulo, tratte: tratte
  };
})();
