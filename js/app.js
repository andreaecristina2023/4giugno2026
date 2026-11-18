/* Casa — interfaccia */
(function () {
  'use strict';
  var C = Casa;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var vista = $('#vista'), foglio = $('#foglio');
  var REPO = 'https://github.com/andreaecristina2023/4giugno2026';
  var COLORE_TIPO = { appuntamento: 'var(--ardesia)', pagamento: 'var(--sangiovese)', scadenza: 'var(--albana)', promemoria: 'var(--muschio)' };
  var ZONE = {
    'centro': { nome: 'Centro', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_centro.pdf' },
    'cintura': { nome: 'Cintura urbana', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_cintura.pdf' },
    'sparse-a': { nome: 'Case sparse A', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_case-sparse-A.pdf' },
    'sparse-b': { nome: 'Case sparse B', pdf: 'https://www.alea-ambiente.it/wp-content/uploads/2025/12/bertinoro_case-sparse-B.pdf' }
  };
  var ui = { meseCal: C.oggi().slice(0, 7), giornoCal: C.oggi(), filtroConti: 'dapagare' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rifiuti() { return Store.settings().rifiuti; }
  function voci() { return Store.lista(); }

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

  function rigaVoce(x) {
    var it = x.item, cls = 'riga' + (x.fatto ? ' fatta' : '') + (x.scaduto ? ' scaduta' : '');
    var meta = [];
    if (x.scaduto) meta.push('Scaduto ' + C.dataBreve(x.data));
    if (x.ora) meta.push(x.ora);
    meta.push(C.TIPI[it.tipo].nome);
    if (it.ricorrenza) meta.push(C.RICORRENZE[it.ricorrenza].nome.toLowerCase());
    if (it.chi) meta.push(it.chi);
    var destra = '';
    if (it.importo) destra += '<span class="importo">' + C.euro(it.importo) + '</span>';
    if (C.chiudibile(it)) destra += '<button class="spunta" type="button" data-fatto="' + esc(it.id) + '" data-data="' + x.data + '" aria-pressed="' + x.fatto + '" aria-label="' + (x.fatto ? 'Segna come da fare: ' : 'Segna come fatto: ') + esc(it.titolo) + '"></button>';
    return '<li class="' + cls + '" style="--c:' + COLORE_TIPO[it.tipo] + '"><span class="barra"></span>' +
      '<button class="corpo-riga" type="button" data-apri="' + esc(it.id) + '"><span class="titolo">' + esc(it.titolo) + '</span><span class="meta">' + esc(meta.join(' · ')) + '</span></button>' +
      '<span class="destra">' + destra + '</span></li>';
  }
  function rigaRifiuti(x) {
    return '<li class="riga" style="--c:' + C.FRAZIONI[x.frazioni[0]].colore + '"><span class="barra"></span>' +
      '<a class="corpo-riga" href="#rifiuti" style="text-decoration:none;color:inherit"><span class="titolo">Ritiro ' + esc(C.nomiFrazioni(x.frazioni)) + '</span><span class="meta">Fuori la sera prima' + (x.nota ? ' · ' + esc(x.nota) : '') + '</span></a>' +
      '<span class="destra">' + bidoni(x.frazioni, true) + '</span></li>';
  }
  function elencoPerGiorno(lista, oggi) {
    var gruppi = {}, ordine = [];
    lista.forEach(function (x) { if (!gruppi[x.data]) { gruppi[x.data] = []; ordine.push(x.data); } gruppi[x.data].push(x); });
    return ordine.map(function (d) {
      return '<section class="giorno' + (d === oggi ? ' oggi' : '') + '"><h3 class="etichetta"><span>' + esc(C.etichettaGiorno(d, oggi)) + '</span></h3><ul class="righe">' +
        gruppi[d].map(function (x) { return x.tipo === 'rifiuti' ? rigaRifiuti(x) : rigaVoce(x); }).join('') + '</ul></section>';
    }).join('');
  }
  function testata(titolo, sotto) {
    var st = Store.stato(), s = Store.configurato() ? st.sync : 'locale';
    var lab = { ok: 'Sincronizzato', 'in corso': 'Sincronizzo…', errore: 'Non sincronizzato', locale: 'Solo su questo telefono', idle: 'Collegato' }[s] || s;
    var pend = Store.pendenti();
    if (s === 'errore' && pend) lab = pend + ' modifiche in attesa';
    return '<header class="testata"><div><h1>' + esc(titolo) + '</h1>' + (sotto ? '<div class="sotto">' + esc(sotto) + '</div>' : '') + '</div>' +
      '<button class="sync" type="button" data-s="' + esc(s) + '" data-azione="sync" title="' + esc(st.errore || '') + '">' + esc(lab) + '</button></header>';
  }

  // ---------- OGGI ----------
  function vistaOggi() {
    var oggi = C.oggi(), ora = new Date().getHours();
    var cfg = rifiuti();
    var domani = C.addGiorni(oggi, 1);
    var ritDomani = C.ritiri(cfg, domani), ritOggi = C.ritiri(cfg, oggi);
    var h = testata('A&C', C.etichettaGiorno(oggi, '1900-01-01'));

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
  function vistaCalendario() {
    var oggi = C.oggi(), cfg = rifiuti();
    var m0 = C.parse(ui.meseCal + '-01');
    var primo = ui.meseCal + '-01';
    var inizio = C.addGiorni(primo, -((m0.getDay() + 6) % 7));
    var fine = C.addGiorni(inizio, 41);
    var ag = C.agenda(voci(), cfg, inizio, fine, oggi);
    var perGiorno = {};
    ag.forEach(function (x) { (perGiorno[x.data] = perGiorno[x.data] || []).push(x); });

    var h = testata('Calendario');
    h += '<div class="mese-nav"><button class="btn icona" type="button" data-mese="-1" aria-label="Mese precedente">‹</button><h2>' + C.MESI[m0.getMonth()] + ' ' + m0.getFullYear() + '</h2><button class="btn icona" type="button" data-mese="1" aria-label="Mese successivo">›</button></div>';
    h += '<div class="griglia" role="grid">' + ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (g) { return '<div class="intest">' + g + '</div>'; }).join('');
    for (var d = inizio; d <= fine; d = C.addGiorni(d, 1)) {
      var cls = 'cella' + (d.slice(0, 7) !== ui.meseCal ? ' fuori' : '') + (d === oggi ? ' oggi' : '') + (d === ui.giornoCal ? ' scelta' : '') + (C.eFestivo(d) || C.giornoSett(d) === 0 ? ' festa' : '');
      var punti = (perGiorno[d] || []).slice(0, 4).map(function (x) {
        var col = x.tipo === 'rifiuti' ? C.FRAZIONI[x.frazioni[0]].colore : COLORE_TIPO[x.tipo];
        return '<i style="--c:' + col + '"></i>';
      }).join('');
      h += '<button class="' + cls + '" type="button" data-giorno="' + d + '" aria-label="' + esc(C.etichettaGiorno(d, oggi)) + ((perGiorno[d] || []).length ? ', ' + perGiorno[d].length + ' voci' : '') + '"><span class="n">' + C.parse(d).getDate() + '</span><span class="punti">' + punti + '</span></button>';
    }
    h += '</div>';
    var sel = perGiorno[ui.giornoCal] || [];
    h += '<h2>' + esc(C.etichettaGiorno(ui.giornoCal, oggi)) + (C.eFestivo(ui.giornoCal) ? ' <small>festivo</small>' : '') + '</h2>';
    h += sel.length ? '<ul class="righe">' + sel.map(function (x) { return x.tipo === 'rifiuti' ? rigaRifiuti(x) : rigaVoce(x); }).join('') + '</ul>'
      : '<div class="vuoto">Niente in programma.<br><button class="btn piccolo" type="button" data-azione="nuovo" data-data="' + ui.giornoCal + '">Aggiungi in questo giorno</button></div>';
    vista.innerHTML = h;
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
      var ric = tutti.filter(function (v) { return v.ricorrenza; }).sort(function (a, b) { return a.titolo.localeCompare(b.titolo); });
      var annuo = ric.reduce(function (s, v) { var r = C.RICORRENZE[v.ricorrenza]; var volte = r.mesi ? 12 / r.mesi : 365 / r.giorni; return s + (+v.importo || 0) * volte; }, 0);
      h += ric.length ? '<p class="testo-muto" style="margin:14px 0 8px">Stima annua delle spese fisse: <b>' + C.euro(annuo) + '</b> (' + C.euro(annuo / 12) + ' al mese)</p><ul class="righe">' + ric.map(function (v) {
        var pross = C.occorrenze(v, oggi, C.addGiorni(oggi, 400))[0];
        return rigaVoce({ data: pross || v.data, ora: v.ora, tipo: v.tipo, item: v, fatto: false, scaduto: false }).replace('</span></button>', ' · prossima ' + (pross ? esc(C.dataBreve(pross)) : 'terminata') + '</span></button>');
      }).join('') + '</ul>' : '<div class="vuoto" style="margin-top:14px">Aggiungi bollette, affitto o rate con "Ripeti" e qui vedi quanto spendete ogni anno.</div>';
    } else {
      lista = C.arretrati(voci(), oggi, 365).filter(function (x) { return x.tipo === 'pagamento' || x.tipo === 'scadenza'; })
        .concat(C.agenda(tutti, null, oggi, C.addGiorni(oggi, 60), oggi).filter(function (x) { return !x.fatto; }));
      h += lista.length ? elencoPerGiorno(lista, oggi) : '<div class="vuoto" style="margin-top:14px">Nessun pagamento nei prossimi 60 giorni.<br><button class="btn piccolo" type="button" data-azione="nuovo" data-tipo="pagamento">Aggiungi un pagamento</button></div>';
    }
    vista.innerHTML = h;
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
    h += '<p class="testo-muto" style="margin:0">Con le regole Alea un ritiro che cade di festa si sposta al sabato prima (lun–mer) o dopo (gio–ven); di sabato salta.</p></div>';

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

  // ---------- ALTRO ----------
  function vistaAltro() {
    var conf = Store.conf(), st = Store.stato(), s = Store.settings();
    var h = testata('Altro', 'Impostazioni e app');
    h += '<h2>Chi sta usando questo telefono</h2><div class="schede" role="group" aria-label="Persona">' + s.persone.map(function (p) { return '<button type="button" data-chi="' + esc(p) + '" aria-pressed="' + (conf.chi === p) + '">' + esc(p) + '</button>'; }).join('') + '</div>';

    h += '<h2>Condivisione tra i telefoni</h2><div class="sezione">';
    if (Store.configurato()) {
      h += '<p>Collegato al Google Sheet. ' + (st.ultimo ? 'Ultima sincronizzazione: ' + new Date(st.ultimo).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) + '.' : '') + '</p>';
      if (st.errore) h += '<p style="color:var(--sangiovese)">' + esc(st.errore) + '</p>';
      h += '</div><h2>Collega un altro telefono</h2><div class="sezione"><p>Manda questo link all\'altro telefono (per esempio su WhatsApp): aprendolo si collega da solo, senza ricopiare indirizzo e chiave. Nell\'app Android incolla il link nel campo "Indirizzo dello script" qui sotto.</p><p class="testo-muto">Il link contiene la chiave: mandalo solo a chi deve vedere i dati di casa.</p>' +
        '<div class="azioni">' + (navigator.share ? '<button class="btn" type="button" data-azione="condividi-link">Condividi il link</button>' : '') + '<button class="btn secondario" type="button" data-azione="copia-link">Copia il link</button></div></div><div class="sezione" style="margin-top:12px">';
    } else h += '<p>Ora i dati restano solo su questo telefono. Collega lo script del Google Sheet per vederli in due (istruzioni nel README del repository).</p>';
    h += '<form id="form-collega" class="campi"><label class="campo">Indirizzo dello script<span class="aiuto">Oppure incolla qui il link di collegamento ricevuto dall\'altro telefono.</span><input type="text" inputmode="url" name="url" value="' + esc(conf.url) + '" placeholder="https://script.google.com/macros/s/…/exec" required></label>' +
      '<label class="campo">Chiave<span class="aiuto">Non serve se hai incollato il link di collegamento. È nel foglio Google «Casa», scheda «Impostazioni» in basso, cella B1. Compare dopo aver eseguito la funzione setup nello script.</span><input type="password" name="chiave" value="' + esc(conf.chiave) + '" autocomplete="off"></label>' +
      '<div class="azioni"><button class="btn" type="submit">Collega e sincronizza</button>' + (Store.configurato() ? '<button class="btn secondario" type="button" data-azione="scollega">Scollega</button>' : '') + '</div></form></div>';

    h += '<h2>Promemoria</h2><div class="sezione">';
    if (Native.isApp) h += '<p>L\'app programma da sola le notifiche dei prossimi 21 giorni: bidoni la sera prima alle ' + esc(rifiuti().oraAvviso || '20:00') + ', pagamenti 2 giorni prima e il giorno stesso alle 9, appuntamenti con l\'anticipo scelto.</p><div class="azioni"><button class="btn secondario" type="button" data-azione="permesso">Controlla il permesso notifiche</button></div>';
    else h += '<p>Nel browser l\'avviso arriva solo a sito aperto. Per le notifiche vere installa l\'app Android, oppure attiva il bot Telegram nello script.</p><div class="azioni"><a class="btn" href="' + REPO + '/releases/latest" target="_blank" rel="noopener">Scarica l\'app Android</a><button class="btn secondario" type="button" data-azione="permesso">Attiva avvisi nel browser</button></div>';
    h += '</div>';

    h += '<h2>Backup</h2><div class="sezione"><p>Salva tutto in un file o ripristinalo (utile anche per passare i dati all\'altro telefono senza script).</p><div class="azioni"><button class="btn secondario" type="button" data-azione="esporta">Esporta i dati</button><label class="btn secondario">Importa un file<input type="file" accept="application/json,.json" data-azione="importa" class="sr"></label></div></div>';
    h += '<p class="testo-muto" style="margin-top:24px">' + voci().length + ' voci salvate · <a href="' + REPO + '" target="_blank" rel="noopener">codice su GitHub</a></p>';
    vista.innerHTML = h;
  }

  // ---------- FORM VOCE ----------
  function apriVoce(id, pre) {
    var it = id ? JSON.parse(JSON.stringify(Store.get(id))) : Object.assign({ tipo: 'appuntamento', titolo: '', data: C.oggi(), ora: '', ricorrenza: '', importo: '', categoria: '', chi: '', note: '', avviso: '' }, pre || {});
    var s = Store.settings();
    function avvisiPer(tipo) {
      if (tipo === 'appuntamento') return [['', 'Predefinito (1 ora prima)'], ['0', 'All\'ora esatta'], ['15', '15 minuti prima'], ['30', '30 minuti prima'], ['60', '1 ora prima'], ['120', '2 ore prima'], ['1440', 'Il giorno prima']];
      if (tipo === 'promemoria') return [['', 'Il giorno stesso']];
      return [['', 'Predefinito (2 giorni prima)'], ['1440', '1 giorno prima'], ['2880', '2 giorni prima'], ['4320', '3 giorni prima'], ['10080', '1 settimana prima']];
    }
    function render() {
      var conImporto = it.tipo === 'pagamento' || it.tipo === 'scadenza';
      foglio.innerHTML = '<form method="dialog" id="form-voce"><div class="maniglia"></div><h3 id="foglio-titolo">' + (id ? 'Modifica' : 'Nuova voce') + '</h3><div class="campi">' +
        '<div class="tipi" role="group" aria-label="Tipo">' + Object.keys(C.TIPI).map(function (t) { return '<button type="button" data-tipo="' + t + '" style="--c:' + COLORE_TIPO[t] + '" aria-pressed="' + (it.tipo === t) + '">' + C.TIPI[t].nome + '</button>'; }).join('') + '</div>' +
        '<label class="campo">Titolo<input type="text" name="titolo" required maxlength="120" value="' + esc(it.titolo) + '" placeholder="' + { appuntamento: 'Es. Dentista Cristina', pagamento: 'Es. Bolletta Hera gas', scadenza: 'Es. Revisione auto', promemoria: 'Es. Cambiare filtro caldaia' }[it.tipo] + '"></label>' +
        '<div class="due"><label class="campo">' + (conImporto ? 'Scadenza' : 'Data') + '<input type="date" name="data" required value="' + esc(it.data) + '"></label><label class="campo">Ora<input type="time" name="ora" value="' + esc(it.ora) + '"></label></div>' +
        (conImporto ? '<div class="due"><label class="campo">Importo €<input type="number" name="importo" inputmode="decimal" step="0.01" min="0" value="' + esc(it.importo) + '"></label><label class="campo">Categoria<select name="categoria"><option value=""></option>' + s.categorie.map(function (c) { return '<option' + (it.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label></div>' : '') +
        '<div class="due"><label class="campo">Ripeti<select name="ricorrenza">' + Object.keys(C.RICORRENZE).map(function (r) { return '<option value="' + r + '"' + ((it.ricorrenza || '') === r ? ' selected' : '') + '>' + C.RICORRENZE[r].nome + '</option>'; }).join('') + '</select></label>' +
        '<label class="campo">Fino al<input type="date" name="fine" value="' + esc(it.fine || '') + '"' + (it.ricorrenza ? '' : ' disabled') + '></label></div>' +
        '<div class="due"><label class="campo">Per chi<select name="chi"><option value="">Tutti e due</option>' + s.persone.map(function (p) { return '<option' + (it.chi === p ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></label>' +
        '<label class="campo">Avviso<select name="avviso">' + avvisiPer(it.tipo).map(function (a) { return '<option value="' + a[0] + '"' + (String(it.avviso || '') === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="campo">Note<textarea name="note" maxlength="1000">' + esc(it.note) + '</textarea></label>' +
        '<div class="azioni"><button class="btn" type="submit" value="salva">Salva</button><button class="btn secondario" type="button" data-chiudi>Annulla</button>' + (id ? '<button class="btn pericolo" type="button" data-elimina style="margin-left:auto">Elimina</button>' : '') + '</div></div></form>';
      var f = $('#form-voce', foglio);
      f.querySelectorAll('[data-tipo]').forEach(function (b) { b.onclick = function () { leggi(f); it.tipo = b.dataset.tipo; it.avviso = ''; render(); }; });
      f.ricorrenza.onchange = function () { f.fine.disabled = !f.ricorrenza.value; };
      $('[data-chiudi]', f).onclick = function () { foglio.close(); };
      if (id) $('[data-elimina]', f).onclick = function () {
        var copia = Store.get(id); Store.elimina(id); foglio.close();
        toast('Eliminato: ' + copia.titolo, 'Annulla', function () { copia.eliminato = false; Store.upsert(copia); });
      };
      f.onsubmit = function (e) {
        e.preventDefault(); leggi(f);
        if (!it.titolo.trim()) { f.titolo.focus(); return; }
        Store.upsert(it); foglio.close(); toast(id ? 'Modifiche salvate' : 'Aggiunto: ' + it.titolo);
      };
    }
    function leggi(f) {
      ['titolo', 'data', 'ora', 'ricorrenza', 'chi', 'avviso', 'note'].forEach(function (k) { if (f[k]) it[k] = f[k].value; });
      it.fine = f.ricorrenza.value ? f.fine.value : '';
      if (f.importo) { it.importo = f.importo.value === '' ? '' : Math.round(parseFloat(f.importo.value) * 100) / 100; it.categoria = f.categoria.value; }
      else { it.importo = ''; }
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

  // ---------- routing e eventi ----------
  var VISTE = { oggi: vistaOggi, calendario: vistaCalendario, conti: vistaConti, rifiuti: vistaRifiuti, altro: vistaAltro };
  function rotta() { var r = location.hash.replace('#', ''); return VISTE[r] ? r : 'oggi'; }
  function disegna() {
    var r = rotta(), y = window.scrollY;
    VISTE[r]();
    document.querySelectorAll('nav.barra-nav a').forEach(function (a) { if (a.dataset.r === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo(0, y);
    Native.aggiorna(voci(), rifiuti());
  }
  window.addEventListener('hashchange', function () { disegna(); window.scrollTo(0, 0); });
  Store.on(disegna);

  $('#fab').onclick = function () { apriVoce(null, rotta() === 'calendario' ? { data: ui.giornoCal } : rotta() === 'conti' ? { tipo: 'pagamento' } : null); };
  foglio.addEventListener('click', function (e) { if (e.target === foglio) foglio.close(); });

  vista.addEventListener('click', function (e) {
    var t = e.target.closest('button, a'); if (!t) return;
    var d = t.dataset;
    if (d.fatto) {
      var nuovo = t.getAttribute('aria-pressed') !== 'true';
      Store.segnaFatto(d.fatto, d.data, nuovo);
      if (nuovo) toast('Segnato come fatto', 'Annulla', function () { Store.segnaFatto(d.fatto, d.data, false); });
    } else if (d.apri) apriVoce(d.apri);
    else if (d.vai) { if (d.filtro) ui.filtroConti = d.filtro; location.hash = d.vai; }
    else if (d.mese) { ui.meseCal = C.addMesi(ui.meseCal + '-01', +d.mese).slice(0, 7); disegna(); }
    else if (d.giorno) { ui.giornoCal = d.giorno; if (d.giorno.slice(0, 7) !== ui.meseCal) ui.meseCal = d.giorno.slice(0, 7); disegna(); }
    else if (d.filtroConti) { ui.filtroConti = d.filtroConti; disegna(); }
    else if (d.chi) { Store.setConf({ chi: d.chi }); }
    else if (d.fraz) salvaRifiuti(function (cfg) { toggle(cfg.regole[+d.reg].frazioni, d.fraz); });
    else if (d.sett) salvaRifiuti(function (cfg) { var r = cfg.regole[+d.reg]; r.settimane = toggle(r.settimane || [], +d.sett); });
    else if (d.meseReg) salvaRifiuti(function (cfg) { var r = cfg.regole[+d.reg]; r.mesi = toggle(r.mesi || [], +d.meseReg); });
    else if (d.togliReg) salvaRifiuti(function (cfg) { cfg.regole.splice(+d.togliReg, 1); });
    else if (d.togliEcc) salvaRifiuti(function (cfg) { cfg.eccezioni.splice(+d.togliEcc, 1); });
    else if (d.azione === 'sync') { Store.sync(); if (!Store.configurato()) location.hash = 'altro'; }
    else if (d.azione === 'nuovo') apriVoce(null, Object.assign({}, d.data ? { data: d.data } : {}, d.tipo ? { tipo: d.tipo } : {}));
    else if (d.azione === 'aggiungi-regola') salvaRifiuti(function (cfg) { cfg.regole.push({ giorno: 1, frazioni: [], settimane: [], mesi: [] }); });
    else if (d.azione === 'nuova-eccezione') apriEccezione();
    else if (d.azione === 'scollega') { Store.setConf({ url: '', chiave: '' }); toast('Scollegato: i dati restano su questo telefono'); }
    else if (d.azione === 'permesso') Native.permesso().then(function (p) { toast(p === 'granted' ? 'Notifiche attive' : 'Notifiche non concesse: abilitale dalle impostazioni del telefono'); });
    else if (d.azione === 'esporta') {
      var blob = new Blob([Store.esporta()], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'AeC-backup-' + C.oggi() + '.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }
  });
  vista.addEventListener('change', function (e) {
    var t = e.target, d = t.dataset;
    if (d.rif) salvaRifiuti(function (cfg) { cfg[d.rif] = d.rif === 'festivita' ? t.value === '1' : t.value; });
    else if (d.reg && d.campo === 'giorno') salvaRifiuti(function (cfg) { cfg.regole[+d.reg].giorno = +t.value; });
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
    if (e.target.id !== 'form-collega') return;
    e.preventDefault();
    var f = e.target, link = leggiCollegamento(f.url.value);
    if (link) return collega(link.url, link.chiave);
    var url = f.url.value.trim(), chiave = f.chiave.value.trim();
    if (!chiave) { toast('Manca la chiave'); f.chiave.focus(); return; }
    collega(url, chiave);
  });
  vista.addEventListener('click', function (e) {
    var t = e.target.closest('[data-azione]'); if (!t) return;
    if (t.dataset.azione === 'condividi-link') navigator.share({ title: 'A&C', text: 'Apri questo link per collegare il telefono ai dati di casa', url: linkCollegamento() }).catch(function () {});
    else if (t.dataset.azione === 'copia-link') {
      var l = linkCollegamento();
      (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { toast('Link copiato: incollalo su WhatsApp'); })
        .catch(function () { window.prompt('Copia questo link:', l); });
    }
  });

  // ---------- avvio ----------
  Native.creaCanale().then(function () { if (Native.isApp) Native.permesso(); });
  if ('serviceWorker' in navigator && !Native.isApp && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  var daLink = leggiCollegamento(location.hash);
  if (daLink) {
    history.replaceState(null, '', location.pathname + '#oggi'); // tolgo la chiave dalla barra degli indirizzi
    if (Store.conf().url !== daLink.url || Store.conf().chiave !== daLink.chiave) collega(daLink.url, daLink.chiave);
  }
  disegna();
  Store.sync();
  setInterval(function () { if (document.visibilityState === 'visible') Store.sync(); }, 5 * 60 * 1000);
  // ridisegna al cambio di giorno (app aperta a mezzanotte)
  var giorno = C.oggi();
  setInterval(function () { if (C.oggi() !== giorno) { giorno = C.oggi(); disegna(); } }, 60000);
})();
