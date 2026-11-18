/* Ponte verso l'app Android (Capacitor): notifiche programmate e dati del widget.
   Nel browser non fa nulla di invasivo: al massimo mostra un avviso quando il sito è aperto. */
var Native = (function () {
  'use strict';
  var cap = window.Capacitor;
  var isApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var LN = null, Prefs = null, Widget = null;
  if (isApp) {
    LN = cap.registerPlugin('LocalNotifications');
    Prefs = cap.registerPlugin('Preferences');
    Widget = cap.registerPlugin('CasaWidget');
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
            smallIcon: 'ic_stat_casa', channelId: 'casa-promemoria'
          };
        })
      }).then(function () { return lista.length; });
    }).catch(function (e) { console.warn('Notifiche non programmate', e); return 0; });
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
        righe.push({ data: x.data, testo: (x.ora ? x.ora + ' ' : '') + x.item.titolo + (x.item.importo ? ' ' + Casa.euro(x.item.importo) : ''), colore: x.tipo === 'pagamento' ? '#7A1F3D' : x.tipo === 'appuntamento' ? '#1F4E5F' : '#B8901A' });
      }
    });
    var tcfg = (Store.settings() || {}).turni;
    for (var g = da; g <= a; g = Casa.addGiorni(g, 1)) {
      var tt = Casa.turnoDel(tcfg, g);
      if (tt && (Casa.STATI_TURNO[tt.stato].lavoro || tt.stato === 'salto' || tt.stato === 'ferie')) righe.push({ data: g, testo: Casa.testoTurno(tt) + (tt.nota ? ' · ' + tt.nota : ''), colore: Casa.STATI_TURNO[tt.stato].colore, turno: true });
    }
    righe = righe.filter(function (r) { return r.data >= da; }).sort(function (p, q) { return p.data < q.data ? -1 : p.data > q.data ? 1 : (p.turno ? -1 : q.turno ? 1 : (q.rifiuti ? 1 : -1)); });
    // in servizio (tutti i turni) per i prossimi 35 giorni: il widget mostra quello di oggi
    var servizio = {};
    if (tcfg && tcfg.attivo) for (var gs = da; gs <= Casa.addGiorni(da, 35); gs = Casa.addGiorni(gs, 1)) servizio[gs] = Casa.servizioDel(gs);
    var json = JSON.stringify({ aggiornato: Date.now(), righe: righe.slice(0, 12), servizio: servizio });
    // widget solo rifiuti: giorni di ritiro delle prossime 3 settimane
    var giorni = (cfgRifiuti && cfgRifiuti.attivo !== false) ? Casa.calendarioRifiuti(cfgRifiuti, da, Casa.addGiorni(da, 21)).map(function (x) {
      return { data: x.data, nota: x.nota || '', frazioni: x.frazioni.map(function (f) { var fr = Casa.FRAZIONI[f] || { nome: f, colore: '#6B6F73' }; return { n: fr.nome.split(' ')[0], c: fr.colore }; }) };
    }) : [];
    return Prefs.set({ key: 'widget', value: json })
      .then(function () { return Prefs.set({ key: 'widgetRifiuti', value: JSON.stringify({ aggiornato: Date.now(), giorni: giorni }) }); })
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

  function aggiorna(items, cfgRifiuti) {
    return Promise.all([programma(items, cfgRifiuti), aggiornaWidget(items, cfgRifiuti)]).then(function (r) { avvisoBrowser(items, cfgRifiuti); return r[0]; });
  }

  return { isApp: isApp, permesso: permesso, aggiorna: aggiorna, creaCanale: creaCanale };
})();
