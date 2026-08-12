// apps/housesevillana/app/parking/traducciones.ts
//
// Los tres idiomas viven en la MISMA fila. No son tres diccionarios que haya que mantener
// sincronizados a mano: son una lista de tríos, y de ahí se derivan. Así es imposible que
// el inglés cubra una frase que el italiano no — el fallo silencioso de siempre, que deja
// un párrafo en español solo en un idioma y solo lo ve el huésped que entra por ahí.
//
// La clave es la cadena EXACTA del HTML español (`contenido.ts`). Si alguien la retoca ahí
// y no aquí, el test de `app/i18n/traducciones.test.ts` lo canta.
//
// Regla al traducir un párrafo que lleva <strong> dentro: la traducción tiene que llevar
// los MISMOS tags. El test cuenta etiquetas antes y después; si no cuadran, es que la
// traducción se ha comido el marcado.

type Trio = readonly [es: string, en: string, it: string]

const PARES: readonly Trio[] = [
  // ── Metadatos ────────────────────────────────────────────────────────────────
  [
    'Casa con parking privado en el centro de Sevilla | House Sevillana',
    'House with private parking in central Seville | House Sevillana',
    'Casa con parcheggio privato nel centro di Siviglia | House Sevillana',
  ],
  [
    'Alojamiento en el casco histórico de Sevilla con plaza de garaje privada en el propio edificio. 290 m², 6 dormitorios, hasta 12 personas. Llega en coche sin buscar aparcamiento.',
    'Accommodation in Seville&#39;s historic centre with a private garage space in the building itself. 290 m², 6 bedrooms, sleeps up to 12. Drive in without hunting for a parking space.',
    'Alloggio nel centro storico di Siviglia con posto auto privato nello stesso edificio. 290 m², 6 camere, fino a 12 persone. Arrivi in auto senza cercare parcheggio.',
  ],
  [
    'Plaza de garaje privada en el propio edificio, en pleno casco histórico. Llega en coche y olvídate de aparcar.',
    'A private garage space in the building itself, right in the historic centre. Drive here and forget about parking.',
    'Posto auto privato nello stesso edificio, in pieno centro storico. Arrivi in auto e ti dimentichi del parcheggio.',
  ],

  // ── Datos estructurados (bloque entero: se traduce de una pieza) ─────────────
  [
    '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"¿House Sevillana tiene parking privado?","acceptedAnswer":{"@type":"Answer","text":"Sí. Hay una plaza de garaje privada en el mismo edificio, reservable junto con la estancia. Es de las pocas casas turísticas del casco histórico de Sevilla con aparcamiento propio."}},{"@type":"Question","name":"¿Afecta la Zona de Bajas Emisiones de Sevilla a mi coche?","acceptedAnswer":{"@type":"Answer","text":"La Zona de Bajas Emisiones de Sevilla es únicamente la Isla de la Cartuja, al noroeste de la ciudad, y solo restringe de lunes a viernes no festivos de 7:00 a 19:00. Los vehículos con distintivo 0, ECO, C o B acceden libremente. El casco histórico, donde está House Sevillana, no forma parte de esa ZBE: tiene su propio régimen de tráfico restringido, así que conviene consultar la ruta de llegada al reservar."}},{"@type":"Question","name":"¿Cuánto cuesta la plaza de garaje?","acceptedAnswer":{"@type":"Answer","text":"Las condiciones de la plaza se confirman directamente con el propietario al reservar. Reservando en housesevillana.es hablas con Alberto sin intermediarios."}}]}',
    '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Does House Sevillana have private parking?","acceptedAnswer":{"@type":"Answer","text":"Yes. There is a private garage space in the same building, bookable together with your stay. It is one of the few licensed holiday homes in Seville\'s historic centre with parking of its own."}},{"@type":"Question","name":"Does Seville\'s Low Emission Zone affect my car?","acceptedAnswer":{"@type":"Answer","text":"Seville\'s Low Emission Zone covers only Isla de la Cartuja, to the north-west of the city, and it restricts access solely Monday to Friday on working days, from 07:00 to 19:00. Vehicles with a 0, ECO, C or B emissions label enter freely. The historic centre, where House Sevillana is, is not part of that zone: it has its own restricted-traffic rules, so it is worth checking your arrival route when you book."}},{"@type":"Question","name":"How much does the garage space cost?","acceptedAnswer":{"@type":"Answer","text":"The terms for the space are confirmed directly with the owner when you book. Booking at housesevillana.es means talking to Alberto with nobody in between."}}]}',
    '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"House Sevillana ha un parcheggio privato?","acceptedAnswer":{"@type":"Answer","text":"Sì. C\'è un posto auto privato nello stesso edificio, prenotabile insieme al soggiorno. È una delle poche case vacanza del centro storico di Siviglia con parcheggio proprio."}},{"@type":"Question","name":"La Zona a Basse Emissioni di Siviglia riguarda la mia auto?","acceptedAnswer":{"@type":"Answer","text":"La Zona a Basse Emissioni di Siviglia comprende soltanto l\'Isla de la Cartuja, a nord-ovest della città, e limita l\'accesso solo dal lunedì al venerdì non festivi, dalle 7:00 alle 19:00. I veicoli con bollino 0, ECO, C o B entrano liberamente. Il centro storico, dove si trova House Sevillana, non fa parte di quella zona: ha regole di traffico limitato proprie, quindi conviene chiedere il percorso di arrivo al momento della prenotazione."}},{"@type":"Question","name":"Quanto costa il posto auto?","acceptedAnswer":{"@type":"Answer","text":"Le condizioni del posto auto si confermano direttamente con il proprietario al momento della prenotazione. Prenotando su housesevillana.es parli con Alberto senza intermediari."}}]}',
  ],

  // ── Navegación ───────────────────────────────────────────────────────────────
  ['Reservar', 'Book now', 'Prenota'],
  ['Inicio', 'Home', 'Home'],

  // ── Portada de la página ─────────────────────────────────────────────────────
  [
    'Llega en coche al centro de Sevilla',
    'Drive right into central Seville',
    'Arriva in auto nel centro di Siviglia',
  ],
  [
    'Plaza de garaje privada en el propio edificio, en pleno casco histórico. Aparcas una vez y el resto del viaje es a pie.',
    'A private garage space in the building itself, right in the historic centre. Park once and do the rest of the trip on foot.',
    'Posto auto privato nello stesso edificio, in pieno centro storico. Parcheggi una volta e il resto del viaggio è a piedi.',
  ],
  [
    'Quien viene a Sevilla en coche descubre pronto el mismo problema: el casco histórico es un laberinto de calles estrechas, con tráfico restringido y prácticamente sin sitio donde dejar el coche. La mayoría de los alojamientos del centro resuelven esto mandándote a un aparcamiento público a diez minutos andando, con maletas.',
    'Anyone who drives to Seville runs into the same problem: the historic centre is a maze of narrow streets with restricted traffic and almost nowhere to leave the car. Most places to stay in the centre solve this by sending you to a public car park ten minutes away on foot, luggage in hand.',
    'Chi arriva a Siviglia in auto scopre presto lo stesso problema: il centro storico è un labirinto di strade strette, a traffico limitato e praticamente senza posto dove lasciare l&#39;auto. La maggior parte degli alloggi del centro risolve mandandoti in un parcheggio pubblico a dieci minuti a piedi, con le valigie.',
  ],
  [
    '<strong>House Sevillana tiene una plaza de garaje privada en el propio edificio</strong>, reservable junto con la estancia. Es de las pocas casas turísticas del casco antiguo que puede decir eso, y es lo que más agradecen los huéspedes que llegan conduciendo.',
    '<strong>House Sevillana has a private garage space in the building itself</strong>, bookable together with your stay. It is one of the few licensed holiday homes in the old town that can say that, and it is what guests arriving by car appreciate most.',
    '<strong>House Sevillana ha un posto auto privato nello stesso edificio</strong>, prenotabile insieme al soggiorno. È una delle poche case vacanza del centro storico che può dirlo, ed è ciò che apprezzano di più gli ospiti che arrivano in auto.',
  ],

  // ── Bloque de ventajas ───────────────────────────────────────────────────────
  [
    'Por qué importa tanto en Sevilla',
    'Why it matters so much in Seville',
    'Perché conta così tanto a Siviglia',
  ],
  ['🚗 Aparcas dentro del edificio', '🚗 You park inside the building', '🚗 Parcheggi dentro l&#39;edificio'],
  [
    'Del coche a la casa, sin arrastrar maletas por la calle ni buscar hueco de madrugada.',
    'Straight from the car to the house — no dragging suitcases down the street, no circling for a space at midnight.',
    'Dall&#39;auto alla casa, senza trascinare le valigie per strada né cercare posto a notte fonda.',
  ],
  ['🚶 Todo a pie desde la puerta', '🚶 Everything on foot from the door', '🚶 Tutto a piedi dalla porta'],
  [
    'Catedral a 10 min, Real Alcázar a 12, Torre del Oro a 14 y Plaza de España a 15. El coche se queda quieto.',
    'Cathedral 10 min away, Real Alcázar 12, Torre del Oro 14 and Plaza de España 15. The car stays put.',
    'Cattedrale a 10 min, Real Alcázar a 12, Torre del Oro a 14 e Plaza de España a 15. L&#39;auto resta ferma.',
  ],
  ['✈️ Aeropuerto a 11 km', '✈️ Airport 11 km away', '✈️ Aeroporto a 11 km'],
  [
    'SVQ está a 16-20 min en taxi o VTC. Si alquilas coche allí, ya sabes dónde lo dejas.',
    'SVQ is 16-20 minutes away by taxi or ride-hailing. If you rent a car there, you already know where it goes.',
    'SVQ è a 16-20 min in taxi o NCC. Se noleggi l&#39;auto lì, sai già dove lasciarla.',
  ],
  ['🧳 Pensado para grupos', '🧳 Built for groups', '🧳 Pensato per gruppi'],
  [
    '290 m², 6 dormitorios y 4 baños para hasta 12 personas. La casa entera para vosotros.',
    '290 m², 6 bedrooms and 4 bathrooms for up to 12 people. The whole house to yourselves.',
    '290 m², 6 camere e 4 bagni per un massimo di 12 persone. Tutta la casa per voi.',
  ],

  // ── Tráfico y ZBE ────────────────────────────────────────────────────────────
  [
    'Coche y tráfico en Sevilla: lo que conviene saber antes de venir',
    'Driving in Seville: what you should know before you come',
    'Auto e traffico a Siviglia: cosa sapere prima di partire',
  ],
  [
    'Circula mucha información confusa sobre esto, así que va claro y separado:',
    'There is a lot of confusing information about this, so here it is plainly and separately:',
    'Su questo circolano molte informazioni confuse, quindi mettiamole in chiaro e separate:',
  ],
  [
    'La <strong>Zona de Bajas Emisiones de Sevilla es únicamente la Isla de la Cartuja</strong>, al noroeste de la ciudad. Solo restringe de lunes a viernes no festivos, de 7:00 a 19:00, y los vehículos con distintivo 0, ECO, C o B entran sin limitación. Sábados, domingos y festivos no hay restricción a ninguna hora.',
    'Seville&#39;s <strong>Low Emission Zone covers only Isla de la Cartuja</strong>, to the north-west of the city. It restricts access solely Monday to Friday on working days, from 07:00 to 19:00, and vehicles with a 0, ECO, C or B emissions label enter without limitation. On Saturdays, Sundays and public holidays there is no restriction at any time.',
    'La <strong>Zona a Basse Emissioni di Siviglia comprende soltanto l&#39;Isla de la Cartuja</strong>, a nord-ovest della città. Limita l&#39;accesso solo dal lunedì al venerdì non festivi, dalle 7:00 alle 19:00, e i veicoli con bollino 0, ECO, C o B entrano senza limitazioni. Sabato, domenica e festivi non c&#39;è alcuna restrizione a nessun orario.',
  ],
  [
    'El <strong>casco histórico —donde está House Sevillana— no es esa ZBE</strong>. Tiene su propio régimen de acceso restringido, con reglas distintas. Confundir las dos cosas es el error más habitual, y a quien llega en coche le puede costar una multa.',
    'The <strong>historic centre — where House Sevillana is — is not that Low Emission Zone</strong>. It has its own restricted-access rules, which are different. Mixing the two up is the most common mistake, and for anyone arriving by car it can mean a fine.',
    'Il <strong>centro storico —dove si trova House Sevillana— non è quella zona</strong>. Ha regole di accesso limitato proprie e diverse. Confondere le due cose è l&#39;errore più comune e, a chi arriva in auto, può costare una multa.',
  ],
  [
    '<strong>Lo honesto:</strong> la ruta exacta de entrada hasta el garaje, las condiciones de la plaza y si hace falta comunicar la matrícula dependen de tu vehículo y del día de llegada. No los ponemos aquí a medias: te los confirma Alberto al reservar, por escrito y antes de que salgas de casa.',
    '<strong>The honest answer:</strong> the exact route in to the garage, the terms for the space and whether you need to give us your number plate all depend on your vehicle and your arrival day. We are not going to half-answer that here: Alberto confirms it when you book, in writing and before you set off.',
    '<strong>Per essere onesti:</strong> il percorso esatto fino al garage, le condizioni del posto auto e se serve comunicare la targa dipendono dal tuo veicolo e dal giorno di arrivo. Non lo scriviamo qui a metà: te lo conferma Alberto al momento della prenotazione, per iscritto e prima che tu parta.',
  ],
  [
    'Es justamente lo que un portal de reservas no puede darte: en housesevillana.es hablas con el propietario, no con un centro de atención al cliente.',
    'That is precisely what a booking portal cannot give you: at housesevillana.es you talk to the owner, not to a call centre.',
    'È esattamente ciò che un portale di prenotazioni non può darti: su housesevillana.es parli con il proprietario, non con un call center.',
  ],

  // ── Preguntas frecuentes ─────────────────────────────────────────────────────
  [
    'Preguntas frecuentes sobre el parking',
    'Frequently asked questions about parking',
    'Domande frequenti sul parcheggio',
  ],
  [
    '¿La plaza está incluida en el precio?',
    'Is the space included in the price?',
    'Il posto auto è incluso nel prezzo?',
  ],
  [
    'Las condiciones de la plaza se confirman con el propietario al hacer la reserva. Como reservas directamente, la respuesta te llega de quien decide, sin intermediarios.',
    'The terms for the space are confirmed with the owner when you book. Because you book direct, the answer comes from the person who decides, with nobody in between.',
    'Le condizioni del posto auto si confermano con il proprietario al momento della prenotazione. Prenotando direttamente, la risposta arriva da chi decide, senza intermediari.',
  ],
  ['¿Cuántos coches caben?', 'How many cars fit?', 'Quante auto ci stanno?'],
  [
    'Es una plaza de garaje privada en el edificio. Si viajáis en varios coches, dilo al reservar y Alberto te indica las alternativas del entorno antes de que llegues.',
    'It is one private garage space in the building. If you are travelling in more than one car, say so when you book and Alberto will tell you the nearby alternatives before you arrive.',
    'È un posto auto privato nell&#39;edificio. Se viaggiate con più auto, dillo al momento della prenotazione e Alberto ti indica le alternative in zona prima che arriviate.',
  ],
  [
    '¿Y si vengo en furgoneta o con un coche grande?',
    'What if I come in a van or a large car?',
    'E se arrivo con un furgone o con un&#39;auto grande?',
  ],
  [
    'Consúltalo antes de reservar indicando el modelo. Preferimos decírtelo con antelación a que te encuentres el problema con el equipaje ya cargado.',
    'Ask before booking and tell us the model. We would much rather warn you in advance than have you discover the problem with the luggage already loaded.',
    'Chiedi prima di prenotare indicando il modello. Preferiamo dirtelo in anticipo piuttosto che farti scoprire il problema con i bagagli già caricati.',
  ],
  [
    '¿Necesito el coche para moverme por Sevilla?',
    'Do I need the car to get around Seville?',
    'Mi serve l&#39;auto per muovermi a Siviglia?',
  ],
  [
    'No. Desde la casa se llega andando a los principales monumentos en menos de 15 minutos. El parking es para llegar y para las excursiones de un día, no para el día a día.',
    'No. From the house you can walk to the main monuments in under 15 minutes. The parking is for getting here and for day trips, not for daily use.',
    'No. Dalla casa si raggiungono a piedi i monumenti principali in meno di 15 minuti. Il parcheggio serve per arrivare e per le gite di un giorno, non per gli spostamenti quotidiani.',
  ],
  [
    '¿Es realmente una casa turística legal?',
    'Is it a properly licensed holiday home?',
    'È davvero una casa vacanze in regola?',
  ],
  [
    'Sí. House Sevillana está acreditada con el número de registro VFT/SE/01179 de la Junta de Andalucía.',
    'Yes. House Sevillana holds registration number VFT/SE/01179 from the regional government of Andalusia.',
    'Sì. House Sevillana è registrata con il numero VFT/SE/01179 della Junta de Andalucía.',
  ],

  // ── Cierre ───────────────────────────────────────────────────────────────────
  [
    'Qué hacer con el coche una vez estás aquí',
    'What to do with the car once you are here',
    'Cosa fare con l&#39;auto una volta qui',
  ],
  [
    'Teniendo dónde dejarlo, el coche deja de ser un estorbo y pasa a ser útil para salir de la ciudad: Itálica, Carmona, Jerez o el Parque Nacional de Doñana están todos a menos de dos horas. Vuelves por la tarde y tienes tu plaza esperando, que en el centro de Sevilla no es poca cosa.',
    'Once you have somewhere to leave it, the car stops being a nuisance and becomes useful for getting out of the city: Itálica, Carmona, Jerez and Doñana National Park are all under two hours away. You come back in the evening and your space is waiting, which in central Seville is no small thing.',
    'Avendo dove lasciarla, l&#39;auto smette di essere un intralcio e diventa utile per uscire dalla città: Itálica, Carmona, Jerez o il Parco Nazionale di Doñana sono tutti a meno di due ore. Torni la sera e il tuo posto ti aspetta, che nel centro di Siviglia non è poco.',
  ],
  [
    'Ven en coche sin preocuparte de aparcar',
    'Come by car without worrying about parking',
    'Vieni in auto senza pensare al parcheggio',
  ],
  [
    '290 m² · 6 dormitorios · Garaje privado · Reserva directa sin comisiones',
    '290 m² · 6 bedrooms · Private garage · Book direct, no fees',
    '290 m² · 6 camere · Garage privato · Prenotazione diretta senza commissioni',
  ],
  [
    'Consultar disponibilidad',
    'Check availability',
    'Verifica la disponibilità',
  ],
]

export const EN: Record<string, string> = Object.fromEntries(PARES.map(([es, en]) => [es, en]))
export const IT: Record<string, string> = Object.fromEntries(PARES.map(([es, , it]) => [es, it]))
