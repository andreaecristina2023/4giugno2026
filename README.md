# A&C · Andrea e Cristina

Sito e app Android per la casa di Fratta Terme: bidoni della raccolta Alea, pagamenti, scadenze, appuntamenti e promemoria. I dati sono condivisi tra i due telefoni tramite un Google Sheet.

- **Sito**: https://andreaecristina2023.github.io/4giugno2026/
- **App Android**: https://github.com/andreaecristina2023/4giugno2026/releases/latest (file `Casa.apk`)

## Cosa c'è

| Sezione | A cosa serve |
|---|---|
| Oggi | Quali bidoni portare fuori stasera, voci scadute, prossimi 7 giorni |
| Calendario | Mese con pallini colorati (bidoni, appuntamenti, pagamenti); scheda **Turni VVF** con il turnario 12/24 – 12/48 |
| Conti | Da pagare, scaduti, pagati, spese ricorrenti con stima annua |
| Rifiuti | Zona Alea, giorni di ritiro, recuperi per festività, variazioni |
| Viaggi | Ogni viaggio con inizio/fine, voli, hotel e documenti (eVisa, passaporto…) con i file allegati; avvisa se un documento scade prima del rientro |
| Concerti | Data, ora, cantante, luogo, prezzo e biglietti digitali (PDF o foto) da aprire anche senza rete |
| Album | Foto di casa (carosello di foto a caso che scorre da solo + griglia per mese di scatto letto dai metadati EXIF, presentazione a schermo intero), salvate nel Google Drive (cartella "A&C Album") |
| Modi (🔔 in alto, solo app) | Modi audio Normale, Moto, Lavoro, Notte, Silenzioso, Solo musica e personalizzati; rotazione schermo; sveglie; per Andrea modo automatico nei turni, VPN FortiClient e DNS privato |
| Impostazioni (⚙ in alto) | Chi usa il telefono, collegamento al foglio, QR code per l'altro telefono, notifiche, backup |

Le festività seguono le regole dell'Eco-Calendario Alea: un ritiro che cade di festa si sposta al sabato prima (lun–mer) o al sabato dopo (gio–ven); se cade di sabato salta. Pasquetta è calcolata in automatico. Per i casi particolari annunciati da Alea c'è "Aggiungi una variazione".

## 1. Pubblicare il sito (una volta)

Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, cartella `/ (root)` → Save. Dopo un minuto il sito è online.

## 2. Collegare il Google Sheet (una volta, dal computer)

1. Apri il Google Sheet "Casa" → **Estensioni → Apps Script**.
2. Cancella tutto quello che c'è in `Code.gs` e incolla l'intero file [`apps-script/Casa.gs`](https://raw.githubusercontent.com/andreaecristina2023/4giugno2026/main/apps-script/Casa.gs). Salva (icona dischetto).
3. In **Impostazioni progetto** (ingranaggio) controlla che il fuso orario sia `Europe/Rome`.
4. In alto scegli la funzione `setup` e premi **Esegui**. Accetta i permessi (è il tuo script; se compare "app non verificata": Avanzate → Vai a Casa).
5. **Distribuisci → Nuova distribuzione → App web**: "Esegui come: Me", "Chi ha accesso: Chiunque". Copia l'URL che finisce con `/exec`.
6. Nel foglio "Impostazioni", cella B1, c'è la chiave.
7. Sul sito (o nell'app), sezione **Altro → Condivisione tra i telefoni**: incolla URL e chiave, poi "Collega e sincronizza". Ripeti sul telefono di Cristina.

Nel foglio "Voci" vedi tutto in chiaro. Puoi anche aggiungere righe a mano (basta tipo, titolo, data `AAAA-MM-GG`): alla prossima sincronizzazione prendono un id.

Se modifichi lo script dopo, ricorda **Distribuisci → Gestisci distribuzioni → modifica → Nuova versione**, altrimenti l'URL continua a usare il codice vecchio.

## Aggiornare lo script

Quando cambia `apps-script/Casa.gs` (per esempio per l'album foto):

1. Apri lo script (script.google.com, progetto della casa), seleziona tutto il codice e incolla la versione nuova di [`Casa.gs`](https://raw.githubusercontent.com/andreaecristina2023/4giugno2026/main/apps-script/Casa.gs). Salva.
2. Scegli `setup` → **Esegui**: Google chiede i permessi nuovi (per l'album, l'accesso a Drive). La chiave resta la stessa.
3. **Esegui il deployment → Gestisci deployment → matita → Versione: Nuova versione → Esegui il deployment**. L'URL `/exec` non cambia.

Le cartelle "A&C Album" (foto) e "A&C Allegati" (biglietti, documenti di viaggio) vengono create accanto al foglio "Casa". Se l'album non va, esegui la funzione `verificaAlbum`: nel registro trovi il link alla cartella oppure il motivo dell'errore.

## Turni VVF

Calendario → **Turni VVF**: scegli turno (A, B, C, D) e saltoturno (1–8). Il calendario usa la stessa sequenza a 32 giorni di FireOps (`SEQUENZA_TURNI`, riferimento 26/01/2026), verificata identica su 2025–2028: sigla maiuscola = diurno, minuscola = notte (es. B6 / b6). I turni del tuo saltoturno sono segnati come salto. Ogni giorno mostra chi è in servizio (diurno sopra, notte sotto, il tuo turno sottolineato). Toccando un giorno lo cambi (ferie, straordinario, addestramento, corso, presidio rurale, boschiva AIB, cambio turno) con orario e nota. Il turno di oggi e chi è in servizio compaiono nella schermata Oggi e in entrambi i widget.

## Modi e comandi (solo app Android)

In alto, accanto all'ingranaggio, c'è il tasto dei **modi**: mostra il simbolo del modo attivo (🔔, 🏍️, 🚒, 🌙, 🔕…). Toccandolo si apre "Modi e comandi":

| Modo | Cosa fa (modificabile con ✎) |
|---|---|
| 🔔 Normale | Suoneria attiva, Non disturbare spento, volumi medi, rotazione automatica |
| 🏍️ Moto | Suoneria e chiamate al massimo, musica/navigatore al massimo (interfono), rotazione bloccata |
| 🚒 Lavoro | Vibrazione, musica muta |
| 🌙 Notte | Non disturbare "solo priorità", musica muta, sveglia all'80%, rotazione bloccata |
| 🔕 Silenzioso | Silenzio, musica muta |
| 🎵 Solo musica | Suoneria e notifiche in silenzio, musica all'80% |
| ⛔ Non disturbare | Non disturbare "solo priorità" (le eccezioni sono quelle scelte nelle impostazioni del telefono), il resto com'è |
| ⛔ Non disturbare | Attiva il Non disturbare di Android con le eccezioni scelte nelle impostazioni del telefono (preferiti, chiamate ripetute, sveglie); Normale lo spegne |

Ogni modo si può modificare (suoneria, Non disturbare, rotazione schermo, volumi di suoneria, notifiche, chiamate, musica e sveglia: senza spunta il volume non si tocca), eliminare o aggiungere ("Nuovo modo"). I modi sono salvati solo sul telefono: Andrea e Cristina hanno i propri. Sotto c'è l'interruttore rapido **Rotazione schermo** (automatica / bloccata).

Permessi che Android chiede la prima volta (l'app apre da sola la pagina giusta):
- **Accesso a Non disturbare**: per silenzio, vibrazione e Non disturbare.
- **Modifica impostazioni di sistema**: per la rotazione dello schermo.

**⏰ Sveglie**: ora, nome, giorni (L M M G V S D, "lun–ven", "tutti"; nessun giorno = una volta sola) e vibrazione. La sveglia viene creata nell'app **Orologio** del telefono, quindi suona anche ad app chiusa e si posticipa come sempre. L'elenco in A&C ricorda quelle create da qui: "Imposta" la ricrea, ✕ la spegne nell'Orologio (alcuni orologi chiedono conferma). "Apri l'Orologio" mostra tutte le sveglie del telefono.

**Solo sul telefono di Andrea** (Impostazioni → Chi sta usando questo telefono = Andrea):
- **🚒 Modo automatico nei turni**: con il turnario VVF attivo (Calendario → Turni VVF), a inizio turno il telefono passa da solo al modo scelto (predefinito Lavoro) e a fine turno torna al modo di prima (o a quello scelto). Vale per diurni, notti, straordinari, corsi, addestramenti, presidi e AIB con il loro orario; turni attaccati contano come uno solo. Funziona ad app chiusa e dopo il riavvio; i turni vengono riletti ogni volta che apri l'app (copre le 3 settimane successive). Se durante il turno cambi modo a mano, a fine turno non lo tocca.
- **VPN FortiClient**: il tasto mostra se la VPN è collegata. Con **"VPN in un tocco"** un tocco apre FortiClient, preme Connetti (o Disconnetti) e torna alla schermata di prima. Lo fa una piccola app a parte, **A&C VPN** (`A-C-VPN.apk`, nella stessa release), perché usa l'Accessibilità: Google Play Protect blocca l'installazione dal browser delle app con Accessibilità, mentre da computer si installa. Una volta sola: `adb install -r A-C-VPN.apk`; in FortiClient spunta "Salva password" e collegati a mano una volta; Impostazioni → Accessibilità → Servizi installati → **A&C · VPN in un tocco** → attiva. Il servizio riceve solo le schermate di FortiClient e agisce solo nei 25 secondi dopo un tocco in A&C; A&C e A&C VPN si parlano con un permesso di firma (stessa chiave). Se FortiClient chiede un codice (FortiToken/SMS) lo inserisci tu. Senza A&C VPN il tasto apre solo FortiClient. A&C VPN cambia raramente: si reinstalla con adb solo se serve.
- **DNS privato attivo di default**: quando apri A&C e la VPN è spenta, il DNS privato si riaccende da solo con l'indirizzo salvato. Non lo fa se l'hai messo su Disattivato tu (dall'app o dal widget) finché non tocchi Attivo.
- **DNS privato durante la VPN**: se il DNS privato è attivo, al tocco su VPN viene spento un attimo prima di collegare e riacceso con lo stesso indirizzo quando la VPN si scollega (anche se la scolleghi a mano in FortiClient). Se la connessione non parte, torna da solo dopo 3 minuti.
- **DNS privato**: Attivo (con l'indirizzo scritto, es. `dns.adguard-dns.com`) / Disattivato (l'opzione "Disattivato" di Android). Android lo lascia cambiare solo alle app autorizzate dal computer, una volta sola: attiva Debug USB, collega il cavo e lancia
  `adb shell pm grant it.andreaecristina.casa android.permission.WRITE_SECURE_SETTINGS`
  (il permesso resta anche dopo gli aggiornamenti dell'app, si perde solo disinstallandola).

**Widget "A&C Comandi"** (tieni premuto sulla home → Widget → A&C): sopra il modo attivo con ▾ — un tocco apre sopra la home l'**elenco a comparsa** di tutti i modi, si sceglie e si chiude; sotto Rotazione (un tocco la cambia), ⏰ Sveglie (apre l'Orologio) e, per Andrea, VPN (collega/scollega) e DNS (colorato quando è disattivato o in pausa per la VPN, normale quando è attivo).

## Naviga (Google Maps in auto)

Ovunque ci sia un indirizzo o una posizione c'è il tasto **🧭 Naviga**: voci (indirizzo o punto segnato, oppure un indirizzo scritto nelle note della voce), check-in degli hotel, concerti (luogo), hotel e luoghi dei viaggi, segnaposto sulla mappa del viaggio, casa (Impostazioni → anagrafica), e le **note** che contengono coordinate (es. `44.123456, 12.345678` o in gradi °), un link di Google Maps o un indirizzo che inizia con Via, Viale, Piazza, Corso, Largo, Strada, Località… Nell'app Android si apre Google Maps già in **navigazione in auto** (`google.navigation:…&mode=d`); nel browser il link delle indicazioni in auto con avvio della navigazione. Un link corto di Maps (maps.app.goo.gl) si apre in Maps, dove si tocca Avvia.

## Voci

Ripeti e avviso hanno le unità di misura: minuti, ore, giorni, settimane, mesi, anni (la ripetizione va da giorni ad anni). Le categorie Bollo auto/moto, Assicurazione e Revisione mostrano il campo **Targa** e propongono da sole la ripetizione (1 anno, revisione 2 anni). Ci sono anche le categorie Condominio, Viaggi, Concerti, Capelli ed Estetista. La categoria si sceglie per ogni tipo di voce (appuntamenti e promemoria compresi).

## 3. Promemoria

**App Android** — le notifiche vere: la sera prima dei ritiri all'ora scelta (predefinita 20:00), i pagamenti 2 giorni prima e il giorno stesso alle 9, gli appuntamenti con l'anticipo scelto. L'app programma i prossimi 21 giorni ogni volta che la apri o che cambia qualcosa, quindi aprila almeno ogni tanto. Ci sono due **widget**: tieni premuto sulla home → Widget → A&C.
- **A&C**: prossime cose da fare (bidoni, pagamenti, appuntamenti).
- **A&C Rifiuti**: sfondo grigio semitrasparente; "Stasera fuori" sopra i bidoni colorati, a destra un elmetto con i turni VVF del giorno (calcolati nel widget, anche ad app chiusa).
- **A&C Foto**: 12 foto a caso dall'album che cambiano da sole ogni 7 secondi; la scelta si rinnova ogni giorno e dopo ogni caricamento. È dichiarato anche per la schermata di blocco, ma Android lo permette solo su alcuni telefoni: sui Samsung la schermata di blocco accetta solo widget approvati da Samsung (o tramite Good Lock). La notifica delle 20 compare comunque sulla schermata di blocco.

**Bot Telegram** (facoltativo, funziona anche ad app chiusa e per tutti e due):

1. Su Telegram scrivi a `@BotFather` → `/newbot` → copia il token.
2. Apps Script → Impostazioni progetto → **Proprietà script** → aggiungi `TELEGRAM_TOKEN`.
3. Scrivete entrambi un messaggio al bot (oppure aggiungetelo a un gruppo e scrivete lì).
4. Esegui `trovaChatId`: nel registro compaiono gli id. Aggiungi la proprietà `TELEGRAM_CHAT_ID` con gli id separati da virgola.
5. Esegui `installaPromemoria`: ogni sera all'ora dei rifiuti arriva "Stasera fuori…", gli impegni di domani e i pagamenti vicini; ogni mattina alle 7 il riepilogo di oggi e gli arretrati.

**Browser** — senza app, l'avviso compare solo a sito aperto.

## 4. App Android

Ogni modifica al sito su `main` fa partire l'azione **App Android** (scheda Actions), che costruisce `Casa.apk` e lo mette nella release "app". Dal telefono apri il link della release, scarica `Casa.apk` e installalo (Android chiederà di consentire l'installazione da browser/file).

Per poter **aggiornare** l'app senza disinstallarla, la firma deve restare sempre la stessa: aggiungi una volta i segreti `ANDROID_KEYSTORE_B64` e `ANDROID_KEYSTORE_PASSWORD` in Settings → Secrets and variables → Actions. Senza segreti l'app si costruisce lo stesso, ma con una firma diversa ogni volta.

Il progetto Android (Capacitor 8) non è nel repository: viene generato da `android-app/prepara.sh`, che copia il sito, aggiunge widget e plugin nativi (`android-app/native/`) e i permessi.

## Struttura

```
index.html, css/, js/, fonts/, icons/   sito (PWA, funziona offline)
js/core.js                             logica: ricorrenze, rifiuti, festività (usata anche da Apps Script)
js/store.js                            dati locali + sincronizzazione
js/native.js                           notifiche e widget nell'app Android
apps-script/Casa.gs                    backend Google Sheet + bot Telegram
android-app/                           app Android e widget
.github/workflows/android.yml          costruzione dell'APK
```

`apps-script/Casa.gs` contiene in fondo una copia di `js/core.js`: se cambi la logica, aggiorna anche lì. Quando modifichi il sito, alza `VERSIONE` in `sw.js` così i telefoni scaricano i file nuovi.
