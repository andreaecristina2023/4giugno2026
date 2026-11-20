// Catalogo dei prodotti da supermercato: suggerimenti per la lista della spesa.
// Le voci nuove scritte dall'utente vengono salvate nel database come «prodotto» e compaiono qui sotto.
var CATALOGO_SPESA = [
  // ortofrutta
  "Mele", "Pere", "Banane", "Arance", "Mandarini", "Limoni", "Clementine", "Kiwi", "Fragole", "Uva", "Pesche", "Albicocche", "Susine", "Ciliegie", "Melone", "Anguria", "Ananas", "Mango", "Avocado", "Pompelmo", "Lamponi", "Mirtilli", "Fichi", "Melograno",
  "Pomodori", "Pomodorini", "Insalata", "Lattuga", "Rucola", "Spinaci", "Bietole", "Radicchio", "Valerianella", "Cavolo nero", "Cavolfiore", "Broccoli", "Verza", "Cavolini di Bruxelles", "Carote", "Patate", "Patate dolci", "Cipolle", "Cipollotti", "Scalogno", "Aglio", "Zucchine", "Melanzane", "Peperoni", "Peperoncino fresco", "Finocchi", "Sedano", "Cetrioli", "Fagiolini", "Piselli freschi", "Asparagi", "Carciofi", "Zucca", "Porri", "Funghi champignon", "Funghi porcini", "Ravanelli", "Barbabietola", "Zenzero", "Prezzemolo", "Basilico", "Rosmarino", "Salvia", "Menta", "Erba cipollina", "Timo", "Origano fresco",
  // latticini e uova
  "Latte intero", "Latte parzialmente scremato", "Latte senza lattosio", "Latte di soia", "Latte di avena", "Latte di mandorla", "Panna da cucina", "Panna fresca", "Burro", "Margarina", "Yogurt bianco", "Yogurt greco", "Yogurt alla frutta", "Yogurt vegetale", "Mozzarella", "Mozzarella di bufala", "Stracchino", "Robiola", "Ricotta", "Mascarpone", "Parmigiano Reggiano", "Grana Padano", "Pecorino", "Gorgonzola", "Taleggio", "Fontina", "Scamorza", "Provolone", "Emmental", "Formaggio spalmabile", "Philadelphia", "Crescenza", "Feta", "Burrata", "Caciotta", "Formaggio grattugiato", "Uova", "Uova bio", "Uova a terra",
  // carne e pesce
  "Petto di pollo", "Coscia di pollo", "Fettine di pollo", "Macinato misto", "Macinato di manzo", "Bistecca di manzo", "Fesa di tacchino", "Prosciutto cotto", "Prosciutto crudo", "Speck", "Salame", "Mortadella", "Bresaola", "Wurstel", "Salsiccia", "Hamburger", "Cotoletta", "Pancetta", "Lardons", "Tonno in scatola", "Tonno fresco", "Salmone", "Salmone affumicato", "Merluzzo", "Orata", "Branzino", "Gamberi", "Cozze", "Vongole", "Calamari", "Polpo", "Filetti di nasello", "Baccalà", "Bastoncini di pesce", "Platessa", "Sgombro", "Acciughe",
  // pane e forno
  "Pane comune", "Pane integrale", "Pane di segale", "Pancarré", "Panini", "Panini per hamburger", "Grissini", "Taralli", "Crackers", "Fette biscottate", "Biscotti secchi", "Cornetti", "Brioche", "Pizza surgelata", "Piadina", "Tortillas", "Focaccia", "Pane a cassetta",
  // pasta e cereali
  "Spaghetti", "Penne", "Fusilli", "Rigatoni", "Tagliatelle", "Lasagne", "Gnocchi", "Riso", "Riso basmati", "Riso arborio", "Farro", "Orzo", "Quinoa", "Couscous", "Polenta", "Farina 00", "Farina integrale", "Farina di mais", "Pangrattato", "Fiocchi d'avena", "Corn flakes", "Muesli", "Cereali", "Pasta fresca", "Pasta all'uovo", "Pasta senza glutine",
  // conserve e sughi
  "Passata di pomodoro", "Pomodori pelati", "Polpa di pomodoro", "Concentrato di pomodoro", "Sugo pronto", "Pesto", "Ragù", "Ceci in scatola", "Fagioli cannellini", "Lenticchie", "Fagioli borlotti", "Piselli in scatola", "Mais in scatola", "Olive verdi", "Olive nere", "Capperi", "Sottaceti", "Carciofini sott'olio", "Peperoni sott'olio", "Pomodori secchi", "Marmellata", "Miele", "Nutella", "Crema di nocciole", "Confettura di albicocche", "Sciroppo d'acero", "Brodo vegetale", "Dado da brodo", "Brodo di carne",
  // condimenti e dispensa
  "Olio extravergine d'oliva", "Olio di semi", "Olio di girasole", "Aceto balsamico", "Aceto di mele", "Aceto bianco", "Aceto di vino rosso", "Sale fino", "Sale grosso", "Pepe nero", "Zucchero", "Zucchero di canna", "Dolcificante", "Farina per dolci", "Lievito di birra", "Lievito in polvere", "Vanillina", "Cacao amaro", "Cioccolato fondente", "Maizena", "Noci", "Mandorle", "Nocciole", "Pinoli", "Uvetta", "Frutta secca mista", "Semi di chia", "Semi di lino", "Curry", "Paprika", "Cannella", "Noce moscata", "Origano secco", "Peperoncino in polvere", "Salsa di soia", "Ketchup", "Maionese", "Senape", "Salsa barbecue", "Salsa Worcestershire", "Tabasco",
  // surgelati
  "Piselli surgelati", "Spinaci surgelati", "Minestrone surgelato", "Verdure surgelate", "Patate fritte surgelate", "Pesce surgelato", "Gelato", "Bastoncini di merluzzo surgelati", "Frutti di bosco surgelati", "Sofficini", "Pizza margherita surgelata",
  // bevande
  "Acqua naturale", "Acqua frizzante", "Coca-Cola", "Aranciata", "Chinotto", "Tè freddo", "Succo d'arancia", "Succo di mela", "Succo multifrutta", "Birra", "Vino rosso", "Vino bianco", "Prosecco", "Caffè in capsule", "Caffè macinato", "Caffè in grani", "Orzo solubile", "Tè", "Tisana", "Camomilla", "Latte di cocco", "Energy drink", "Acqua tonica", "Gazzosa", "Spumante",
  // dolci e snack
  "Biscotti frollini", "Biscotti al cioccolato", "Merendine", "Cioccolatini", "Tavoletta di cioccolato", "Patatine", "Popcorn", "Cracker salati", "Noccioline", "Caramelle", "Gomme da masticare", "Torta", "Crostata", "Pan di Spagna", "Savoiardi", "Wafer", "Gelatina", "Budino", "Panna spray",
  // casa e pulizia
  "Detersivo piatti", "Detersivo lavatrice", "Ammorbidente", "Candeggina", "Detersivo pavimenti", "Spugne", "Carta assorbente", "Carta igienica", "Fazzoletti", "Sacchi per la spazzatura", "Sacchetti per freezer", "Pellicola trasparente", "Carta forno", "Alluminio", "Guanti in lattice", "Detergente multiuso", "Anticalcare spray", "Deodorante per ambiente", "Sgrassatore", "Panni in microfibra", "Scopa", "Lampadine", "Pile",
  // cura della persona
  "Shampoo", "Balsamo", "Bagnoschiuma", "Sapone", "Dentifricio", "Spazzolino", "Filo interdentale", "Collutorio", "Deodorante", "Crema per le mani", "Crema viso", "Crema solare", "Rasoi", "Schiuma da barba", "Assorbenti", "Cotton fioc", "Dischetti di cotone", "Salviette struccanti", "Cerotti",
  // bambini e animali
  "Pannolini", "Salviettine per bambini", "Latte in polvere per neonati", "Omogeneizzati", "Crocchette per cani", "Crocchette per gatti", "Lettiera per gatti", "Snack per cani", "Cibo umido per gatti",
  // varie
  "Batterie", "Fiammiferi", "Accendino", "Candele", "Tovaglioli", "Bicchieri di carta", "Piatti di carta", "Posate di plastica"
];
