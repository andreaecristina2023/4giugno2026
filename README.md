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
| Viaggi | Ogni viaggio con inizio/fine, voli, hotel e documenti (eVisa, passaporto…) con i file allegati; avvisa se un documento scade prima del rientro. Su ogni volo il tasto **⏰ Sveglia**. In fondo **Monitora prezzi**: il prezzo dei voli da Google Flights controllato ogni mattina |
| Concerti | Data, ora, cantante, luogo, prezzo e biglietti digitali (PDF o foto) da aprire anche senza rete |
| Album | Foto di casa (carosello di foto a caso che scorre da solo + griglia per mese di scatto letto dai metadati EXIF, presentazione a schermo intero), salvate nel Google Drive (cartella "A&C Album") |
| Modi (🔔 in alto, solo app) | Modi audio Normale, Moto, Lavoro, Notte, Silenzioso, Solo musica e personalizzati; rotazione schermo; sveglie; per Andrea modo automatico nei turni, VPN FortiClient e DNS privato |
| Luci (💡, dal tasto dei modi) | Luci e prese Tuya / Smart Life: accendi, luminosità, bianco, colore, scene; tasto Luce e Colori luci nel widget "A&C Comandi" |
| Impostazioni (⚙ in alto) | Chi usa il telefono, casa, collegamento al foglio, QR code per l'altro telefono, notifiche, backup; in fondo le **aree personali** di Andrea e Cristina: dati (telefono, nascita, email, codice fiscale), documenti e **file e PDF** (curriculum, certificati, attestati, contratti…) salvati nel Drive (cartella "A&C Allegati") |

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

**Dalla seconda volta in poi basta un tasto:** A&C → **Altro → Script del foglio → ⟳ Aggiorna lo script**. Lo script scarica da GitHub l'ultima versione di `apps-script/Casa.gs` (e del manifest, se non chiede permessi nuovi), sostituisce il proprio codice, crea una versione nuova e la pubblica sulla stessa app web: l'URL `/exec` non cambia. **↶ Versione precedente** riporta l'app web alla versione di prima. Dall'editor si può fare lo stesso eseguendo `aggiornaScript`.

Attenzione: così chi può modificare questo repository GitHub può cambiare anche lo script, che lavora con l'account Google del proprietario. Tieni il repository solo tuo.

**La prima volta (una sola), a mano:**

1. Vai su [script.google.com/home/usersettings](https://script.google.com/home/usersettings) e accendi **API Google Apps Script**.
2. Apri lo script (script.google.com, progetto della casa). In **Impostazioni progetto** (ingranaggio) spunta **Mostra il file manifest "appsscript.json" nell'editor**.
3. Nel file `appsscript.json` incolla [`appsscript.json`](https://raw.githubusercontent.com/andreaecristina2023/4giugno2026/main/apps-script/appsscript.json) (contiene i permessi, compreso quello per aggiornarsi, e il servizio Drive per l'OCR). Nel file del codice seleziona tutto e incolla [`Casa.gs`](https://raw.githubusercontent.com/andreaecristina2023/4giugno2026/main/apps-script/Casa.gs). Salva.
4. Scegli `setup` → **Esegui** e accetta tutti i permessi ("Seleziona tutto"). La chiave resta la stessa.
5. **Esegui il deployment → Gestisci deployment → matita → Versione: Nuova versione → Esegui il deployment**.

Se una versione futura chiede permessi nuovi, il tasto lo dice: in quel caso ripeti i passi 3–5.

Le cartelle "A&C Album" (foto) e "A&C Allegati" (biglietti, documenti di viaggio) vengono create accanto al foglio "Casa". Se l'album non va, esegui la funzione `verificaAlbum`: nel registro trovi il link alla cartella oppure il motivo dell'errore.

**💡 Luce con la sveglia** (sveglie del turnario, solo app): *Niente*, *💡 Con la sveglia* (quando suona la luce si accende in bianco) o *🌅 Alba* (5–30 minuti prima si accende arancio al minimo e sale piano fino al bianco all'ora della sveglia; notifica silenziosa con "Ferma la luce"). Si scelgono luminosità e bianco finale (caldo ↔ freddo) e, se ci sono più luci con ★, quale. Serve il telefono sul Wi-Fi di casa con le luci in modalità Wi-Fi; fuori casa la sveglia suona lo stesso. "Prova la luce" / "Prova l'alba (40 secondi)" per vedere l'effetto; la prova del suono non accende la luce.

## Turni VVF

Calendario → **Turni VVF**: scegli turno (A, B, C, D) e saltoturno (1–8). Il calendario usa la stessa sequenza a 32 giorni di FireOps (`SEQUENZA_TURNI`, riferimento 26/01/2026), verificata identica su 2025–2028: sigla maiuscola = diurno, minuscola = notte (es. B6 / b6). I turni del tuo saltoturno sono segnati come salto. Ogni giorno mostra chi è in servizio (diurno sopra, notte sotto, il tuo turno sottolineato). Toccando un giorno lo cambi (ferie, permesso, malattia, recupero, congedo, straordinario, addestramento, corso, presidio rurale, boschiva AIB, cambio turno) con orario e nota; per le assenze puoi segnare più turni in una volta. Il turno di oggi e chi è in servizio compaiono nella schermata Oggi e in entrambi i widget.

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

**🚒 Sveglie dal turnario** (solo Andrea, in Sveglie → "Segui il turnario"): una sveglia la mattina dei giorni di **diurno** e una il **giorno dopo la notte** (smonto), ognuna con il suo orario. Seguono il turnario VVF: non suonano nei giorni con ferie, permesso, malattia, recupero, congedo, salto turno o cambiati a mano. Si sentono anche con Non disturbare: se il "Non disturbare" bloccherebbe le sveglie (silenzio totale o sveglie escluse), mentre suona A&C passa a "solo sveglie" e poi rimette com'era (serve l'accesso a Non disturbare); se il volume della sveglia è quasi a zero lo alza al 70% per quella volta. Suonano in A&C (l'Orologio di Android non accetta sveglie in una data precisa): suono da sveglia che si ripete, anche con Non disturbare, schermata con **Spegni / Posticipa 10 minuti** anche a telefono bloccato (su Android 14+ va consentita la "notifica a schermo intero": l'app mostra il tasto). Smettono da sole dopo 10 minuti. **Suono**: 🔔 suoneria della sveglia del telefono, 🎵 un brano scelto dal telefono (mp3, m4a…, in loop al volume della sveglia) oppure 🟢 Spotify (incolla il link di un brano o di una playlist: alla sveglia si apre Spotify e parte la musica; Spotify non lascia avviare la riproduzione alle altre app in modo garantito, quindi la suoneria resta finché la musica non parte davvero; a telefono sbloccato c'è il tasto "▶ Spotify" nella notifica). Per le sveglie dell'Orologio il suono si sceglie nell'Orologio (quello Samsung accetta anche brani di Spotify). Funzionano ad app chiusa e dopo il riavvio; i turni si rileggono ogni volta che apri A&C (coprono le 3 settimane successive). "Prova il suono" fa suonare subito.

**Solo sul telefono di Andrea** (Impostazioni → Chi sta usando questo telefono = Andrea):
- **🚒 Modo automatico nei turni**: con il turnario VVF attivo (Calendario → Turni VVF), a inizio turno il telefono passa da solo al modo scelto (predefinito Lavoro) e a fine turno torna al modo di prima (o a quello scelto). Vale per diurni, notti, straordinari, corsi, addestramenti, presidi e AIB con il loro orario; turni attaccati contano come uno solo. Funziona ad app chiusa e dopo il riavvio; i turni vengono riletti ogni volta che apri l'app (copre le 3 settimane successive). Se durante il turno cambi modo a mano, a fine turno non lo tocca.
- **VPN FortiClient**: il tasto mostra se la VPN è collegata. Con **"VPN in un tocco"** un tocco apre FortiClient, preme Connetti (o Disconnetti) e torna alla schermata di prima. Lo fa una piccola app a parte, **A&C VPN** (`A-C-VPN.apk`, nella stessa release), perché usa l'Accessibilità: Google Play Protect blocca l'installazione dal browser delle app con Accessibilità, mentre da computer si installa. Una volta sola: `adb install -r A-C-VPN.apk`; in FortiClient spunta "Salva password" e collegati a mano una volta; Impostazioni → Accessibilità → Servizi installati → **A&C · VPN in un tocco** → attiva. Il servizio riceve solo le schermate di FortiClient e agisce solo nei 25 secondi dopo un tocco in A&C; A&C e A&C VPN si parlano con un permesso di firma (stessa chiave). Se FortiClient chiede un codice (FortiToken/SMS) lo inserisci tu. Senza A&C VPN il tasto apre solo FortiClient. A&C VPN cambia raramente: si reinstalla con adb solo se serve.
- **DNS privato attivo di default**: quando apri A&C e la VPN è spenta, il DNS privato si riaccende da solo con l'indirizzo salvato. Non lo fa se l'hai messo su Disattivato tu (dall'app o dal widget) finché non tocchi Attivo.
- **DNS privato durante la VPN**: se il DNS privato è attivo, al tocco su VPN viene spento un attimo prima di collegare e riacceso con lo stesso indirizzo quando la VPN si scollega (anche se la scolleghi a mano in FortiClient). Se la connessione non parte, torna da solo dopo 3 minuti.
- **DNS privato**: Attivo (con l'indirizzo scritto, es. `dns.adguard-dns.com`) / Disattivato (l'opzione "Disattivato" di Android). Android lo lascia cambiare solo alle app autorizzate dal computer, una volta sola: attiva Debug USB, collega il cavo e lancia
  `adb shell pm grant it.andreaecristina.casa android.permission.WRITE_SECURE_SETTINGS`
  (il permesso resta anche dopo gli aggiornamenti dell'app, si perde solo disinstallandola).

**Widget "A&C Comandi"** (tieni premuto sulla home → Widget → A&C): sopra una barra compatta con il modo attivo e ▾ — un tocco apre sopra la home l'**elenco a comparsa** dei modi (icona e nome), si sceglie e si chiude; sotto sei tasti grandi su tre colonne e due righe: **Rotazione** (un tocco la cambia), **⏰ Sveglie** (apre l'Orologio), **💡 Luce** / per Andrea **VPN** (collega/scollega) e **DNS** (colorato quando è disattivato o in pausa per la VPN, normale quando è attivo), **🎨 Colori luci**. Se il widget c'era già, allargalo a 4×3 per vederlo bene.

## Monitora prezzi dei voli

Viaggi → in fondo **Monitora prezzi** → "+ Monitora un volo" (oppure "📉 Monitora il prezzo" dentro un viaggio, che prende aeroporti e date dal primo volo). Per ogni tratta: aeroporti (codici di 3 lettere, anche più d'uno separati da virgola, es. `BLQ, FRL`), andata, ritorno (vuoto = solo andata), **date esatte o ±3 giorni**, adulti, scali e una soglia in euro.

- I prezzi arrivano da **Google Flights** tramite [SerpApi](https://serpapi.com): piano gratuito di 250 ricerche al mese. Ogni tratta usa **una ricerca al giorno**, anche con ±3 giorni (il calendario prezzi di Google dà il prezzo di ogni giorno di partenza con la stessa durata del viaggio). Con 8 tratte attive si resta nel gratuito.
- **Chiave**: registrati su serpapi.com, copia la chiave da *Api Key* e incollala in Viaggi → Monitora prezzi → ⚙. Lo script la salva (proprietà `SERPAPI_KEY`) e attiva da solo il controllo di **ogni mattina verso le 7** (`controllaPrezziVoli`; si può installare anche a mano con `installaPrezziVoli`).
- Lo storico finisce nel foglio **PrezziVoli**. Nella scheda della tratta: prezzo di oggi, livello (basso / nella media / alto) e fascia tipica secondo Google, compagnia e orari del volo più economico, grafico con lo storico di Google Flights e i controlli di A&C, la soglia, e per ±3 giorni il prezzo di ogni giorno. "Apri in Google Flights" porta alla ricerca per comprare; "↻ Controlla ora" fa una ricerca subito.
- **Avvisi** quando il prezzo scende sotto la soglia o cala del 10% o più: notifica con l'**aereo** sul telefono (quando l'app si apre e legge i prezzi nuovi) e, se il bot è attivo, messaggio Telegram subito dopo il controllo del mattino.

## Sveglia per il volo e icona aereo

Ogni volo ha il tasto **⏰ Sveglia**: propone 3 ore prima della partenza (tasti 2, 3, 4, 5 ore prima, oppure giorno e ora a mano). Suona in A&C come le sveglie del turnario (stesso suono scelto in Modi → Sveglie, schermata Spegni / Posticipa anche a telefono bloccato), anche ad app chiusa. Vale solo per il telefono su cui la imposti; dopo il tocco il tasto mostra giorno e ora. Le notifiche dei voli (3 ore prima) e delle partenze hanno l'icona dell'aereo al posto della casetta; nel widget A&C i voli hanno ✈.

## 💡 Luci (Tuya / Smart Life)

Dal tasto dei modi (🔈 in alto) → **💡 Luci → Apri**: una scheda per ogni luce o presa dell'account Smart Life / Tuya Smart con interruttore, luminosità, bianco caldo/freddo, colore (barra della tonalità e colori pronti, "B" = torna al bianco) e stato (non raggiungibile se offline); sotto le scene **Tap-to-Run** con ▶. Funziona anche dal browser. Le luci passano dallo script del foglio di casa, che parla con il cloud Tuya: le chiavi Tuya stanno solo nello script.

**Nel widget "A&C Comandi"**: il tasto **💡 Luce** accende o spegne la prima luce con ★ (giallo se accesa, ⚠ se non raggiungibile); **🎨 Colori luci** apre una finestrella con tutte le luci con ★ (massimo 6): interruttore, colori pronti, bianco, luminosità e bianco caldo/freddo. Toccando il nome di una luce nella finestrella diventa quella del tasto Luce. Lo stato si riallinea ogni mezz'ora e dopo ogni comando. Il vecchio widget separato "A&C Luci" non c'è più.

**Due modi di collegarle:**
- **📶 Wi-Fi di casa (solo app, consigliato):** A&C chiede a Tuya **una volta** la chiave locale di ogni luce e poi la comanda direttamente sulla rete di casa (protocollo Tuya locale 3.3/3.4/3.5, porta 6668), senza cloud: più veloce, va anche senza internet e non dipende dalla prova Tuya (che dopo può anche scadere). Funziona solo con il telefono sul Wi-Fi di casa. La luce viene cercata da sola (annunci UDP 6666/6667/7000, oppure provando gli indirizzi della rete). La chiave cambia solo se resetti la luce e la riassoci all'app: in quel caso rileggila. Le scene Tap-to-Run in questo modo non ci sono.
- **Script del foglio (cloud):** le chiavi stanno nello script e le luci vanno anche da fuori casa e dal browser, con le scene; la prova IoT Core va rinnovata.

**Configurazione (una volta, dal computer):**

1. Vai su [iot.tuya.com](https://iot.tuya.com) e crea un account sviluppatore (gratuito).
2. **Cloud → Development → Create Cloud Project**: nome "A&C", Industry *Smart Home*, Development Method *Smart Home*, Data Center **Central Europe**. Nella pagina dei servizi lascia **IoT Core** (con Authorization e Smart Home Scene Linkage) e conferma.
3. Nel progetto: **Devices → Link App Account → Add App Account**: compare un QR. Nell'app **Smart Life** o **Tuya Smart**: Io/Profilo → icona di scansione in alto → inquadra il QR e conferma. I dispositivi compaiono nella scheda Devices.
4. Nel progetto: **Overview** → copia **Access ID** e **Access Secret**.
5. **Wi-Fi di casa:** con il telefono sul Wi-Fi di casa, in A&C **💡 Luci → ⚙ Collegamento Tuya** → incolla Access ID e Access Secret → **📶 Leggi le luci con le chiavi**. Access ID e Secret vanno nello script del foglio (non restano sul telefono) e lo script tiene anche una copia delle chiavi locali: **sull'altro telefono basta aprire 💡 Luci** (o ⚙ → **📶 Prendi le luci dal foglio di casa**), senza chiavi e anche dopo la scadenza della prova Tuya. Fatto: i passi 6–8 servono solo per il modo con lo script. Dallo stesso foglio: **🔎 Cerca di nuovo sul Wi-Fi** (se il router dà un altro indirizzo alla luce) e **Togli la modalità Wi-Fi**.
5. *(Solo script)* Aggiorna lo script (sezione "Aggiornare lo script": la prima volta a mano, poi con il tasto ⟳ Aggiorna lo script).
6. In A&C: **💡 Luci → ⚙ Collegamento Tuya** → incolla Access ID e Access Secret, data center Europa centrale → **Salva nello script**. In alternativa mettile a mano nelle proprietà script `TUYA_ID`, `TUYA_SECRET` (e `TUYA_REGIONE`: `eu`, `weu`, `us`, `ueaz`, `in`, `cn`).
7. Se qualcosa non va: nell'editor dello script esegui **`verificaTuya`** e guarda il registro (dice se le chiavi sono giuste, quante luci vede, oppure cosa manca).

La prova gratuita di Tuya (servizio IoT Core) dura un mese e va **rinnovata**: Cloud → Cloud Services → IoT Core → *Extend Trial Period* (modulo da compilare, di solito accettato in poche ore, fino a 6 mesi alla volta). Quando scade, A&C mostra il messaggio "periodo di prova scaduto".

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
js/viaggi.js, js/prezzi.js             viaggi, concerti, sveglie dei voli, monitoraggio prezzi
js/native.js                           notifiche e widget nell'app Android
apps-script/Casa.gs                    backend Google Sheet + bot Telegram
android-app/                           app Android e widget
.github/workflows/android.yml          costruzione dell'APK
```

`apps-script/Casa.gs` contiene in fondo una copia di `js/core.js`: se cambi la logica, aggiorna anche lì. Quando modifichi il sito, alza `VERSIONE` in `sw.js` così i telefoni scaricano i file nuovi.
