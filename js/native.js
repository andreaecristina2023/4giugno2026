/* Ponte verso l'app Android (Capacitor): notifiche programmate e dati del widget.
   Nel browser non fa nulla di invasivo: al massimo mostra un avviso quando il sito è aperto. */
var Native = (function () {
  'use strict';
  var cap = window.Capacitor;
  var isApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var LN = null, Prefs = null, Widget = null, AudioPl = null;
  if (isApp) {
    LN = cap.registerPlugin('LocalNotifications');
    Prefs = cap.registerPlugin('Preferences');
    Widget = cap.registerPlugin('CasaWidget');
    AudioPl = cap.registerPlugin('AudioModi');
  }
  var ultimaFirma = '';
  var esatte = true; // sveglie esatte consentite? (Android 12+ può negarle)
  if (isApp) {
    LN.checkExactNotificationSetting().then(function (r) { esatte = r.exact_alarm === 'granted'; }).catch(function () {});
    // tasto indietro: chiude il foglio aperto, poi torna alla sezione precedente, poi esce
    var AppPl = cap.registerPlugin('App');
    AppPl.addListener('backButton', function (ev) {
      var d = document.querySelector('dialog[open]');
      if (d) { d.close(); return; }
      if (location.hash && location.hash !== '#oggi') { location.hash = 'oggi'; return; }
      AppPl.exitApp();
    });
  }

  function dataDa(q) { // "YYYY-MM-DDTHH:MM" → Date locale
    return new Date(+q.slice(0, 4), +q.slice(5, 7) - 1, +q.slice(8, 10), +q.slice(11, 13), +q.slice(14, 16), 0);
  }

  function permesso() {
    if (!isApp) {
      if (!('Notification' in window)) return Promise.resolve('non supportate');
      if (Notification.permission === 'granted') return Promise.resolve('granted');
      return Notification.requestPermission();
    }
    return LN.checkPermissions().then(function (p) {
      if (p.display === 'granted') return 'granted';
      return LN.requestPermissions().then(function (r) { return r.display; });
    });
  }

  // Riprogramma le notifiche dei prossimi 21 giorni (massimo 60)
  function programma(items, cfgRifiuti) {
    if (!isApp) return Promise.resolve(0);
    var adesso = new Date();
    var da = Casa.oggi(), a = Casa.addGiorni(da, 21);
    var lista = Casa.promemoria(items, cfgRifiuti, da, a).filter(function (p) { return dataDa(p.quando) > adesso; }).slice(0, 60);
    var firma = JSON.stringify(lista);
    if (firma === ultimaFirma) return Promise.resolve(lista.length);
    ultimaFirma = firma;
    return LN.getPending().then(function (pend) {
      var vecchie = (pend.notifications || []).map(function (n) { return { id: n.id }; });
      return vecchie.length ? LN.cancel({ notifications: vecchie }) : null;
    }).then(function () {
      if (!lista.length) return 0;
      return LN.schedule({
        notifications: lista.map(function (p) {
          return {
            id: Casa.hashInt(p.chiave), title: p.titolo, body: p.testo,
            schedule: { at: dataDa(p.quando), allowWhileIdle: true },
            isExactNotification: esatte,
            smallIcon: /^v/.test(p.chiave) ? 'ic_stat_volo' : 'ic_stat_casa', channelId: 'casa-promemoria' // aereo per voli e partenze
          };
        })
      }).then(function () { return lista.length; });
    }).catch(function (e) { console.warn('Notifiche non programmate', e); return 0; });
  }

  // notifica subito (es. prezzo di un volo sceso): { chiave, titolo, testo, icona }
  function notificaSubito(n) {
    if (!isApp) {
      if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(n.titolo, { body: n.testo, icon: 'icons/icon-192.png' }); } catch (e) { /* niente */ } }
      return Promise.resolve();
    }
    return LN.schedule({ notifications: [{ id: Casa.hashInt(n.chiave || n.titolo), title: n.titolo, body: n.testo || '', smallIcon: n.icona || 'ic_stat_casa', channelId: 'casa-promemoria' }] })
      .catch(function (e) { console.warn('Notifica non mostrata', e); });
  }

  function creaCanale() {
    if (!isApp) return Promise.resolve();
    return LN.createChannel({ id: 'casa-promemoria', name: 'Promemoria casa', description: 'Rifiuti, pagamenti e appuntamenti', importance: 4, visibility: 1, vibration: true }).catch(function () {});
  }

  // Dati per il widget: righe dei prossimi 10 giorni, il widget sceglie da oggi in poi
  function aggiornaWidget(items, cfgRifiuti) {
    if (!isApp) return Promise.resolve();
    var da = Casa.oggi(), a = Casa.addGiorni(da, 10), righe = [];
    Casa.agenda(items, cfgRifiuti, da, a).forEach(function (x) {
      if (x.tipo === 'rifiuti') {
        righe.push({ data: Casa.addGiorni(x.data, -1), testo: 'Fuori ' + Casa.nomiFrazioni(x.frazioni), colore: Casa.FRAZIONI[x.frazioni[0]].colore, rifiuti: true });
      } else if (!x.fatto) {
        var testo = (x.ora ? x.ora + ' ' : '') + x.item.titolo + (x.item.importo && x.tipo !== 'concerto' ? ' ' + Casa.euro(x.item.importo) : '');
        if (x.tipo === 'volo') testo = (x.ora ? x.ora + ' ' : '') + '✈ Volo ' + [x.volo.numero, [x.volo.da, x.volo.a].filter(Boolean).join('→')].filter(Boolean).join(' ');
        else if (x.tipo === 'hotel') testo = 'Check-in ' + (x.hotel.nome || '');
        else if (x.tipo === 'viaggio') testo = (x.ruolo === 'rientro' ? 'Rientro ' : 'Partenza ') + x.item.titolo;
        else if (x.tipo === 'concerto') testo = (x.ora ? x.ora + ' ' : '') + '🎤 ' + x.item.titolo;
        var col = { pagamento: '#7A1F3D', appuntamento: '#1F4E5F', viaggio: '#1E7F8C', volo: '#1E7F8C', hotel: '#1E7F8C', concerto: '#A3307A' }[x.tipo] || '#B8901A';
        righe.push({ data: x.data, testo: testo, colore: col });
      }
    });
    var tcfg = (Store.settings() || {}).turni;
    for (var g = da; g <= a; g = Casa.addGiorni(g, 1)) {
      var tt = Casa.turnoDel(tcfg, g);
      if (tt && (Casa.STATI_TURNO[tt.stato].lavoro || tt.stato === 'salto' || Casa.STATI_TURNO[tt.stato].assenza)) righe.push({ data: g, testo: Casa.testoTurno(tt) + (tt.nota ? ' · ' + tt.nota : ''), colore: Casa.STATI_TURNO[tt.stato].colore, turno: true });
    }
    righe = righe.filter(function (r) { return r.data >= da; }).sort(function (p, q) { return p.data < q.data ? -1 : p.data > q.data ? 1 : (p.turno ? -1 : q.turno ? 1 : (q.rifiuti ? 1 : -1)); });
    // in servizio (tutti i turni) per i prossimi 35 giorni: il widget mostra quello di oggi
    var servizio = {};
    if (tcfg && tcfg.attivo) for (var gs = da; gs <= Casa.addGiorni(da, 35); gs = Casa.addGiorni(gs, 1)) servizio[gs] = Casa.servizioDel(gs);
    var eventiGiorni = {};
    righe.forEach(function (r) { if (!r.rifiuti && !r.turno) eventiGiorni[r.data] = (eventiGiorni[r.data] || 0) + 1; });
    var json = JSON.stringify({ aggiornato: Date.now(), righe: righe.slice(0, 12), servizio: servizio, mioTurno: (tcfg && tcfg.attivo && tcfg.turno) || '' });
    // widget solo rifiuti: giorni di ritiro delle prossime 3 settimane
    var giorni = (cfgRifiuti && cfgRifiuti.attivo !== false) ? Casa.calendarioRifiuti(cfgRifiuti, da, Casa.addGiorni(da, 21)).map(function (x) {
      return { data: x.data, nota: x.nota || '', frazioni: x.frazioni.map(function (f) { var fr = Casa.FRAZIONI[f] || { nome: f, colore: '#6B6F73' }; return { n: fr.nome.split(' ')[0], c: fr.colore }; }) };
    }) : [];
    return Prefs.set({ key: 'widget', value: json })
      .then(function () { return Prefs.set({ key: 'widgetRifiuti', value: JSON.stringify({ aggiornato: Date.now(), giorni: giorni, eventi: eventiGiorni }) }); })
      .then(function () { return Widget.aggiorna().catch(function () {}); }).catch(function () {});
  }

  // Nel browser: avviso una volta al giorno se stasera c'è da esporre qualcosa
  function avvisoBrowser(items, cfgRifiuti) {
    if (isApp || !('Notification' in window) || Notification.permission !== 'granted') return;
    var chiave = 'casa.avviso.' + Casa.oggi();
    try { if (localStorage.getItem(chiave)) return; } catch (e) { return; }
    var dom = Casa.ritiri(cfgRifiuti, Casa.addGiorni(Casa.oggi(), 1));
    if (!dom.frazioni.length || new Date().getHours() < 17) return;
    try { new Notification('A&C · Stasera fuori: ' + Casa.nomiFrazioni(dom.frazioni), { body: 'Ritiro domani mattina', icon: 'icons/icon-192.png' }); localStorage.setItem(chiave, '1'); } catch (e) { /* alcuni browser richiedono il service worker */ }
  }

  // Widget "A&C Foto": 12 foto a caso, rinnovate una volta al giorno (o dopo un caricamento)
  var fotoInCorso = false;
  function aggiornaFoto(forza) {
    if (!isApp || fotoInCorso || !window.Album || !Album.numero() || !Store.configurato()) return Promise.resolve();
    var chiave = 'aec.widgetFoto', oggi = Casa.oggi();
    try { if (!forza && localStorage.getItem(chiave) === oggi) return Promise.resolve(); } catch (e) { /* niente */ }
    fotoInCorso = true;
    return Album.perWidget(12).then(function (lista) {
      if (!lista.length) return null;
      return lista.reduce(function (p, x) { return p.then(function () { return Widget.salvaFoto(x); }); }, Promise.resolve())
        .then(function () { return Widget.impostaFoto({ nomi: lista.map(function (x) { return x.nome; }) }); })
        .then(function () { try { localStorage.setItem(chiave, oggi); } catch (e) { /* niente */ } });
    }).catch(function (e) { console.warn('Widget foto non aggiornato', e); }).then(function () { fotoInCorso = false; });
  }

  function aggiorna(items, cfgRifiuti) {
    return Promise.all([programma(items, cfgRifiuti), aggiornaWidget(items, cfgRifiuti)]).then(function (r) { avvisoBrowser(items, cfgRifiuti); return r[0]; });
  }

  // Modi audio, rotazione schermo, VPN FortiClient e DNS privato (solo app)
  var soloApp = function () { return Promise.reject({ code: 'SOLO_APP', message: 'Disponibile solo nell\'app Android' }); };
  var audio = {
    stato: function () { return AudioPl ? AudioPl.stato() : soloApp(); },
    applica: function (m) { return AudioPl ? AudioPl.applica(m) : soloApp(); },
    rotazione: function (r) { return AudioPl ? AudioPl.rotazione({ rotazione: r }) : soloApp(); },
    apriPermesso: function (quale) { return AudioPl ? AudioPl.apriPermesso({ quale: quale }) : soloApp(); },
    segna: function (id) { return AudioPl ? AudioPl.segna({ id: id || '' }) : soloApp(); },
    dns: function (modo, host) { return AudioPl ? AudioPl.dns({ modo: modo, host: host || '' }) : soloApp(); },
    apriFortiClient: function () { return AudioPl ? AudioPl.apriFortiClient() : soloApp(); },
    // sveglie nell'app Orologio del telefono: { ora, minuti, giorni: [1=lun…7=dom], nome, vibra }
    sveglia: function (sv) { return AudioPl ? AudioPl.sveglia(sv) : soloApp(); },
    togliSveglia: function (sv) { return AudioPl ? AudioPl.togliSveglia({ ora: sv.ora, minuti: sv.minuti }) : soloApp(); },
    elencoSveglie: function () { return AudioPl ? AudioPl.elencoSveglie() : soloApp(); },
    // modo automatico durante i turni VVF: { attivo, inTurno, dopo, modi, intervalli: [[inizioMs, fineMs]] }
    turnoAuto: function (conf) { return AudioPl ? AudioPl.turnoAuto(conf) : soloApp(); },
    // sveglie che seguono il turnario: { attive, eventi: [ { t: ms, nome } ] }
    sveglieTurno: function (conf) { return AudioPl ? AudioPl.sveglieTurno(conf) : soloApp(); },
    provaSveglia: function (suono) { return AudioPl ? AudioPl.provaSveglia({ nome: 'Prova', suono: suono || null }) : soloApp(); },
    fermaSveglia: function () { return AudioPl ? AudioPl.fermaSveglia() : soloApp(); },
    // brano dal telefono per la sveglia: { uri, nome }
    scegliBrano: function () { return AudioPl ? AudioPl.scegliBrano() : soloApp(); },
    permessoSchermoSveglia: function () { return AudioPl ? AudioPl.permessoSchermoSveglia() : soloApp(); },
    // dati per il widget "A&C Comandi": { modi, andrea, dnsHost }
    salvaWidget: function (dati) {
      if (!AudioPl) return Promise.resolve();
      return Prefs.set({ key: 'comandi', value: JSON.stringify(dati) }).then(function () { return AudioPl.aggiornaWidget(); }).catch(function () {});
    }
  };

  // ---------- navigazione con Google Maps, in auto ----------
  // d = { lat, lon } oppure { q: 'indirizzo' }. Nell'app parte subito la navigazione (google.navigation, mode=d);
  // nel browser il link "indicazioni in auto" con avvio della navigazione.
  function urlNaviga(d) {
    var dest = d.lat != null && d.lon != null ? (+d.lat) + ',' + (+d.lon) : encodeURIComponent(String(d.q || ''));
    return 'https://www.google.com/maps/dir/?api=1&destination=' + dest + '&travelmode=driving&dir_action=navigate';
  }
  function naviga(d) {
    if (!d || (d.lat == null && !d.q)) return;
    if (AudioPl) AudioPl.naviga({ lat: d.lat != null ? +d.lat : null, lon: d.lon != null ? +d.lon : null, q: d.q || '' }).catch(function () { window.open(urlNaviga(d), '_blank'); });
    else window.open(urlNaviga(d), '_blank', 'noopener');
  }
  function escAttr(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // link "Naviga" da mettere in qualsiasi elenco: href per il browser, data-naviga-* per l'app
  function linkNaviga(d, testo, classe, aria) {
    if (!d || (d.lat == null && !d.q)) return '';
    return '<a class="' + escAttr(classe || 'naviga') + '" href="' + escAttr(urlNaviga(d)) + '" target="_blank" rel="noopener"' +
      (d.lat != null ? ' data-naviga-lat="' + (+d.lat) + '" data-naviga-lon="' + (+d.lon) + '"' : ' data-naviga-q="' + escAttr(d.q) + '"') +
      ' aria-label="' + escAttr(aria || 'Naviga in auto con Google Maps') + '">' + (testo || '🧭 Naviga') + '</a>';
  }
  // un solo gestore per tutta l'app (fase di cattura: arriva prima degli altri)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('[data-naviga-lat], [data-naviga-q]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    naviga(a.dataset.navigaQ ? { q: a.dataset.navigaQ } : { lat: a.dataset.navigaLat, lon: a.dataset.navigaLon });
  }, true);

  // luci del widget "A&C Comandi": { url, chiave, chi, luci: [{ id, nome, acceso, online, colore, luminosita, temperatura, modo, ha }] }
  var luci = {
    salvaWidget: function (dati) {
      if (!AudioPl) return Promise.resolve();
      return Prefs.set({ key: 'luci', value: JSON.stringify(dati) }).then(function () { return AudioPl.aggiornaLuci(); }).catch(function () {});
    },
    // sul Wi-Fi di casa, senza cloud (solo app)
    locale: {
      stato: function () { return AudioPl && AudioPl.luciLocaliStato ? AudioPl.luciLocaliStato().catch(function () { return { configurato: false }; }) : Promise.resolve({ configurato: false }); },
      importa: function (o) { return AudioPl.luciLocaliImporta(o); },
      cerca: function () { return AudioPl.luciLocaliCerca(); },
      elenco: function () { return AudioPl.luciLocaliElenco(); },
      comando: function (id, cmd) { return AudioPl.luciLocaliComando({ id: id, cmd: cmd }); },
      togli: function () { return AudioPl.luciLocaliTogli(); }
    }
  };

  return { isApp: isApp, audio: audio, luci: luci, naviga: naviga, linkNaviga: linkNaviga, urlNaviga: urlNaviga, permesso: permesso, aggiorna: aggiorna, notificaSubito: notificaSubito, creaCanale: creaCanale, aggiornaFoto: aggiornaFoto };
})();
