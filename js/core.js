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
    return { appuntamento: 60, pagamento: 2880, scadenza: 2880, promemoria: 0 }[item.tipo] || 0;
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
  // cfg = { attivo, persona, turno:'B', riferimento:'YYYY-MM-DD' (un giorno di DIURNO del proprio turno),
  //         diurno:'08:00-20:00', notte:'20:00-08:00', salto:{ da:'YYYY-MM-DD', ogni:N giorni }, eccezioni:[{data, stato, nota}] }
  var STATI_TURNO = {
    diurno:        { nome: 'Diurno',        breve: 'G', colore: '#C98A12', lavoro: true },
    notte:         { nome: 'Notte',         breve: 'N', colore: '#2C3E73', lavoro: true },
    smonto:        { nome: 'Smonto',        breve: 'S', colore: '#8C96A8', lavoro: false },
    riposo:        { nome: 'Riposo',        breve: 'R', colore: '#9AA59C', lavoro: false },
    salto:         { nome: 'Salto',         breve: 'X', colore: '#3E8E6A', lavoro: false },
    ferie:         { nome: 'Ferie',         breve: 'F', colore: '#4BA3C7', lavoro: false },
    straordinario: { nome: 'Straordinario', breve: '+', colore: '#B5452F', lavoro: true },
    altro:         { nome: 'Altro',         breve: '•', colore: '#7A6F9B', lavoro: false }
  };
  var CICLO = ['diurno', 'notte', 'smonto', 'riposo'];
  function turnoBase(cfg, s) {
    if (!cfg || !cfg.riferimento) return null;
    var k = ((diffGiorni(cfg.riferimento, s) % 4) + 4) % 4;
    return CICLO[k];
  }
  function turnoDel(cfg, s) {
    if (!cfg || cfg.attivo === false || !cfg.riferimento) return null;
    var base = turnoBase(cfg, s), out = { data: s, stato: base, base: base, nota: '' };
    var sl = cfg.salto || {};
    if (sl.da && +sl.ogni > 0 && s >= sl.da && diffGiorni(sl.da, s) % +sl.ogni === 0) { out.stato = 'salto'; out.nota = 'Salto turno'; }
    var ecc = (cfg.eccezioni || []).filter(function (e) { return e.data === s; })[0];
    if (ecc) { out.stato = ecc.stato; out.nota = ecc.nota || ''; out.modificato = true; }
    var orari = { diurno: cfg.diurno || '08:00-20:00', notte: cfg.notte || '20:00-08:00' };
    out.orario = orari[out.stato] || (out.stato === 'straordinario' && ecc && ecc.orario) || '';
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
    out.sort(function (p, q) { return p.quando < q.quando ? -1 : 1; });
    return out;
  }

  function hashInt(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h) % 2000000000 + 1; }
  function nuovoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function euro(n) { return '€ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  return {
    GIORNI: GIORNI, GIORNI_LUNGHI: GIORNI_LUNGHI, MESI: MESI, FRAZIONI: FRAZIONI, TIPI: TIPI, UNITA: UNITA, UNITA_RIPETI: UNITA_RIPETI, UNITA_AVVISO: UNITA_AVVISO,
    STATI_TURNO: STATI_TURNO, turnoDel: turnoDel, testoTurno: testoTurno,
    leggiDurata: leggiDurata, testoDurata: testoDurata, nomeRipeti: nomeRipeti, volteAnno: volteAnno, anticipoMinuti: anticipoMinuti,
    iso: iso, parse: parse, oggi: oggi, addGiorni: addGiorni, addMesi: addMesi, diffGiorni: diffGiorni,
    giornoSett: giornoSett, settimanaDelMese: settimanaDelMese, etichettaGiorno: etichettaGiorno, dataBreve: dataBreve,
    pasqua: pasqua, eFestivo: eFestivo, senzaRaccolta: senzaRaccolta, FESTIVI_ALEA: FESTIVI_ALEA, ritiri: ritiri, calendarioRifiuti: calendarioRifiuti,
    occorrenze: occorrenze, fatto: fatto, chiudibile: chiudibile, agenda: agenda, arretrati: arretrati,
    promemoria: promemoria, nomiFrazioni: nomiFrazioni, hashInt: hashInt, nuovoId: nuovoId, euro: euro, pad: pad
  };
})();
if (typeof module !== 'undefined') module.exports = Casa;
