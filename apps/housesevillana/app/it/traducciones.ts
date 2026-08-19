// apps/housesevillana/app/it/traducciones.ts
//
// Diccionario ES→IT de la landing. Se aplica sobre el MISMO HTML de `app/route.ts`
// en vez de mantener una segunda copia del fichero, por dos razones:
//
//   1. El agente SEO de sivra (`/api/seo-refresh`) reescribe `app/route.ts` sola cada
//      lunes por la GitHub Contents API. Con dos copias, la inglesa se quedaría atrás
//      en silencio a la primera pasada.
//   2. Un cambio de diseño o de precio se hace una vez y aparece en los dos idiomas.
//
// Por qué existe esto (GA4, 12 meses a 11/08/2026): de 82 usuarios, el **11% navega en italiano**
// (tercer idioma tras el inglés con 72% y el español con 14,6%); Italia es ademas el 10% de los usuarios. Por países, EE.UU. 34%, España 17%,
// Canadá 10%, Italia 10%. La web era monolingüe en español: la inmensa mayoría del poco
// tráfico que llega no entiende la página a la que llega.
//
// ⚠️ Las claves son las cadenas EXACTAS del HTML, con sus entidades (`&oacute;`, `&mdash;`…).
// No las "arregles" a caracteres acentuados: dejarían de casar y el texto se quedaría en
// español sin avisar. El test `traducciones.test.ts` falla si alguna clave no aparece.
//
// El orden importa: se aplican de la más larga a la más corta para que una frase larga no
// quede troceada por una sustitución corta que sea subcadena suya.

export const TRADUCCIONES: Record<string, string> = {
  // El <title> y las descripciones NO están aquí: los escribe `META` en `route.ts` por
  // etiqueta, porque el agente SEO reescribe esas frases en el español cada lunes y una
  // clave de diccionario dejaría de casar en silencio. Ver `../i18n/motor`.
  'La casa':
    'La casa',
  'Fotos':
    'Foto',
  'Ubicaci&oacute;n':
    'Posizione',
  'Reservar directo':
    'Prenota diretto',
  '&#9733; Reserva directa &middot; Sin comisiones':
    '&#9733; Prenotazione diretta &middot; Senza commissioni',
  'Casa con':
    'Una casa con',
  'en el coraz&oacute;n':
    'nel cuore',
  'de Sevilla':
    'di Siviglia',
  '290 m&sup2; reformados en el casco hist&oacute;rico. 6 dormitorios, 4 ba&ntilde;os, terraza, patio andaluz y parking privado &mdash; para grupos y familias de hasta 12 personas.':
    '290 m&sup2; ristrutturati nel centro storico. 6 camere, 4 bagni, terrazza, patio andaluso e parcheggio privato &mdash; per gruppi e famiglie fino a 12 persone.',
  '6 dorm &middot; 4 ba&ntilde;os':
    '6 camere &middot; 4 bagni',
  'Terraza + Patio':
    'Terrazza + Patio',
  'Hasta 12 personas':
    'Fino a 12 persone',
  '8,6/10':
    '8,6/10',
  'Consultar disponibilidad':
    'Verifica disponibilità',
  'Ver la casa':
    'Scopri la casa',
  'La propiedad':
    'La proprietà',
  'Dorm.':
    'Camere',
  'Ba&ntilde;os':
    'Bagni',
  'Hu&eacute;spedes':
    'Ospiti',
  'Muy bien valorado':
    'Molto apprezzata',
  'Booking.com &middot; 51 rese&ntilde;as':
    'Booking.com &middot; 51 recensioni',
  'Ver disponibilidad &#8594;':
    'Vedi disponibilità &#8594;',
  'Parking privado':
    'Parcheggio privato',
  '&mdash; el &uacute;nico del barrio':
    '&mdash; l\'unico della zona',
  'Confirmaci&oacute;n inmediata':
    'Conferma immediata',
  'Sin comisiones &mdash;':
    'Senza commissioni &mdash;',
  'ahorra hasta un 22%':
    'risparmia fino al 22%',
  'vs Booking':
    'rispetto a Booking',
  '&middot; 51 rese&ntilde;as verificadas':
    '&middot; 51 recensioni verificate',
  'Una casa sevillana para vivirla':
    'Una casa sivigliana da vivere',
  '290 m&sup2; reformados con materiales nobles en el coraz&oacute;n del casco hist&oacute;rico. Pensada para grupos y familias que quieren espacio, comodidad y autenticidad.':
    '290 m&sup2; ristrutturati con materiali pregiati nel cuore del centro storico. Pensata per gruppi e famiglie che cercano spazio, comfort e autenticità.',
  'Parking privado en el edificio':
    'Parcheggio privato nell\'edificio',
  'Rars&iacute;simo en el casco antiguo de Sevilla. 1 plaza de garaje en el propio edificio, reservable con tu estancia. Aparcar en zona hist&oacute;rica ya no es un problema.':
    'Rarissimo nel centro storico di Siviglia. Un posto auto nell\'edificio stesso, prenotabile con il soggiorno. Parcheggiare nel centro storico smette di essere un problema.',
  '6 dormitorios dobles':
    '6 camere matrimoniali',
  'Todos con camas de matrimonio. Capacidad real para hasta 12 personas sin perder comodidad ni privacidad.':
    'Tutte con letto matrimoniale. Spazio reale per 12 persone senza rinunciare a comfort e privacy.',
  '4 ba&ntilde;os completos':
    '4 bagni completi',
  'Con ducha o ba&ntilde;era, toallas y art&iacute;culos de bienvenida incluidos para todos los hu&eacute;spedes.':
    'Con doccia o vasca, asciugamani e prodotti di benvenuto inclusi per tutti gli ospiti.',
  'Patio andaluz aut&eacute;ntico':
    'Autentico patio andaluso',
  'Patio sevillano con azulejos t&iacute;picos y fuente interior. El lugar favorito de todos los que nos visitan.':
    'Un patio sivigliano con azulejos tradizionali e fontana. L\'angolo preferito da chi ci viene.',
  'Terraza con vistas':
    'Terrazza panoramica',
  'Azotea privada con vistas al casco hist&oacute;rico. El lugar ideal para las noches de verano sevillano.':
    'Un terrazzo privato affacciato sul centro storico. Il posto giusto per le sere d\'estate a Siviglia.',
  'Cocina totalmente equipada':
    'Cucina completamente attrezzata',
  'Horno, microondas, nevera grande, cafetera y utensilios completos. Lista para cocinar para 12 personas.':
    'Forno, microonde, frigorifero grande, macchina del caffè e utensili completi. Pronta per cucinare per 12.',
  'La casa por dentro':
    'La casa dall\'interno',
  'Haz clic en cualquier foto para ampliarla':
    'Clicca su una foto per ingrandirla',
  'En el coraz&oacute;n del casco hist&oacute;rico':
    'Nel cuore del centro storico',
  'Calle Socorro 24, barrio de San Juli&aacute;n (41003 Sevilla). A pasos del Palacio de las Due&ntilde;as y la Iglesia de San Luis de los Franceses.':
    'Calle Socorro 24, quartiere San Juli&aacute;n (41003 Siviglia). A due passi dal Palacio de las Due&ntilde;as e dalla chiesa di San Luis de los Franceses.',
  'Palacio de las Due&ntilde;as':
    'Palacio de las Due&ntilde;as',
  'San Luis de los Franceses':
    'San Luis de los Franceses',
  'Catedral de Sevilla':
    'Cattedrale di Siviglia',
  'Real Alc&aacute;zar':
    'Real Alc&aacute;zar',
  'Torre del Oro':
    'Torre del Oro',
  'Plaza de Espa&ntilde;a':
    'Plaza de Espa&ntilde;a',
  'Barrio de Triana':
    'Quartiere di Triana',
  'Estaci&oacute;n Santa Justa':
    'Stazione Santa Justa',
  'Aeropuerto SVQ':
    'Aeroporto SVQ',
  '2 min a pie':
    '2 min a piedi',
  '4 min a pie':
    '4 min a piedi',
  '10 min a pie':
    '10 min a piedi',
  '12 min a pie':
    '12 min a piedi',
  '14 min a pie':
    '14 min a piedi',
  '15 min a pie':
    '15 min a piedi',
  '20 min a pie':
    '20 min a piedi',
  '25 min a pie':
    '25 min a piedi',
  '20 min en taxi':
    '20 min in taxi',
  'Preguntas frecuentes':
    'Domande frequenti',
  'Todo lo que necesitas saber':
    'Tutto quello che c\'è da sapere',
  '&iquest;No encuentras tu respuesta? Escr&iacute;benos por WhatsApp y te contestamos hoy mismo.':
    'Non trovi la tua risposta? Scrivici su WhatsApp e ti rispondiamo in giornata.',
  'Preguntar por WhatsApp':
    'Chiedi su WhatsApp',
  '&iquest;Tiene parking privado House Sevillana?':
    'House Sevillana ha un parcheggio privato?',
  'S&iacute;. Dispone de una plaza de garaje privado en el mismo edificio, reservable con tu estancia. Aparcar en el casco antiguo de Sevilla es muy complicado y costoso &mdash; esta es nuestra ventaja m&aacute;s valorada por los hu&eacute;spedes que llegan en coche.':
    'Sì. C\'è un posto auto privato nell\'edificio stesso, prenotabile con il soggiorno. Parcheggiare nel centro storico di Siviglia è complicato e costoso &mdash; è la caratteristica più apprezzata da chi arriva in auto.',
  '&iquest;Para cu&aacute;ntas personas es House Sevillana?':
    'Quante persone ospita House Sevillana?',
  '6 dormitorios dobles para hasta 12 personas. Perfecta para grupos de amigos, familias numerosas multigeneracionales o varias parejas que viajan juntas a Sevilla. Si eres menos de 6 personas, tambi&eacute;n es una opci&oacute;n excepcional por el espacio y el precio por persona.':
    'Sei camere matrimoniali per un massimo di 12 ospiti. Ideale per gruppi di amici, famiglie numerose multigenerazionali o più coppie in viaggio insieme a Siviglia. Anche per gruppi più piccoli resta un\'ottima scelta, per lo spazio e il prezzo a persona.',
  '&iquest;A qu&eacute; distancia est&aacute; la Catedral de Sevilla?':
    'Quanto dista la Cattedrale di Siviglia?',
  'La Catedral y la Giralda est&aacute;n a unos 10 minutos andando. El Real Alc&aacute;zar a 12 minutos, la Torre del Oro a 14 y la Plaza de Espa&ntilde;a a 15 minutos a pie. House Sevillana est&aacute; en el barrio de San Juli&aacute;n, en pleno casco antiguo, a menos de 5 minutos del Palacio de las Due&ntilde;as.':
    'La Cattedrale e la Giralda sono a circa 10 minuti a piedi. Il Real Alc&aacute;zar a 12 minuti, la Torre del Oro a 14 e Plaza de Espa&ntilde;a a 15. House Sevillana si trova nel quartiere San Juli&aacute;n, in pieno centro storico, a meno di 5 minuti dal Palacio de las Due&ntilde;as.',
  '&iquest;Se admiten ni&ntilde;os? &iquest;Y mascotas?':
    'Sono ammessi bambini? E animali?',
  'Se admiten ni&ntilde;os de todas las edades. La casa es ideal para familias multigeneracionales gracias a sus dimensiones y 4 ba&ntilde;os. Las mascotas no est&aacute;n permitidas en la propiedad.':
    'I bambini di tutte le età sono i benvenuti. Le dimensioni della casa e i suoi 4 bagni la rendono ideale per famiglie multigenerazionali. Gli animali non sono ammessi.',
  '&iquest;Se permiten despedidas de soltero o fiestas?':
    'Sono ammesse feste o addii al celibato/nubilato?',
  'No. Las despedidas de soltero/a y eventos similares no est&aacute;n permitidos. Hay silencio obligatorio entre las 21:00 y las 09:00 h. Se aplica un dep&oacute;sito de garant&iacute;a de hasta 150 &euro; que se devuelve tras el check-out si no hay desperfectos.':
    'No. Addii al celibato o al nubilato ed eventi simili non sono consentiti. Il silenzio è obbligatorio tra le 21:00 e le 09:00. Si applica un deposito cauzionale fino a 150 &euro;, restituito dopo il check-out se non ci sono danni.',
  '&iquest;Cu&aacute;les son los horarios de check-in y check-out?':
    'Quali sono gli orari di check-in e check-out?',
  'Check-in a partir de las 15:00 h. Check-out hasta las 12:00 h. Si necesitas horario flexible &mdash; llegada tarde por el avi&oacute;n o salida despu&eacute;s de comer &mdash; cons&uacute;ltalo directamente con el propietario al reservar.':
    'Check-in dalle 15:00. Check-out entro le 12:00. Se ti serve flessibilità &mdash; un arrivo tardi per il volo o una partenza dopo pranzo &mdash; chiedilo direttamente al proprietario al momento della prenotazione.',
  '&iquest;C&oacute;mo llego desde el aeropuerto de Sevilla?':
    'Come arrivo dall\'aeroporto di Siviglia?',
  'El aeropuerto SVQ est&aacute; a unos 11 km. En taxi o VTC son aproximadamente 16&ndash;20 minutos seg&uacute;n tr&aacute;fico. Tambi&eacute;n puedes coger el autob&uacute;s EA hasta el centro (35&ndash;40 min, sale desde la terminal). Si vienes en coche, tendr&aacute;s tu plaza de parking esperando.':
    'L\'aeroporto SVQ dista circa 11 km &mdash; all\'incirca 16&ndash;20 minuti in taxi o NCC, a seconda del traffico. C\'è anche l\'autobus EA per il centro (35&ndash;40 min, dal terminal). Se arrivi in auto, il tuo posto auto ti aspetta.',
  '&iquest;Hay restaurantes y supermercados cerca?':
    'Ci sono ristoranti e negozi nelle vicinanze?',
  'A pocos metros encontrar&aacute;s La Parcer&iacute;a Caf&eacute;, Ojal&aacute; Tapas y Vinos y el Restaurante Condend&ecirc; (200 m). El Mercado de la Encarnaci&oacute;n (Las Setas) est&aacute; a 10 minutos andando con puestos de frutas, verduras y productos locales.':
    'A pochi passi trovi La Parcer&iacute;a Caf&eacute;, Ojal&aacute; Tapas y Vinos e il Restaurante Condend&ecirc; (200 m). Il mercato dell\'Encarnaci&oacute;n (Las Setas) è a 10 minuti a piedi, con banchi di frutta, verdura e prodotti locali.',
  '&iquest;Cu&aacute;l es la pol&iacute;tica de cancelaci&oacute;n?':
    'Qual è la politica di cancellazione?',
  'Las condiciones exactas se muestran en el motor de reservas seg&uacute;n las fechas elegidas. Reservando directamente puedes hablar con el propietario para condiciones m&aacute;s flexibles &mdash; algo imposible a trav&eacute;s de las plataformas.':
    'Le condizioni esatte compaiono nel motore di prenotazione in base alle date scelte. Prenotando direttamente puoi parlare con il proprietario per condizioni più flessibili &mdash; cosa impossibile tramite le piattaforme.',
  '&iquest;Por qu&eacute; reservar aqu&iacute; y no en Booking.com?':
    'Perché prenotare qui e non su Booking.com?',
  'Booking.com cobra entre un 15% y un 22% de comisi&oacute;n que repercute en el precio final. Reservando en esta web obtienes el mejor precio garantizado, confirmaci&oacute;n inmediata y trato directo con el propietario para cualquier necesidad antes o durante tu estancia. Sin intermediarios, sin sorpresas.':
    'Booking.com applica una commissione tra il 15% e il 22%, che finisce nel prezzo finale. Prenotando su questo sito ottieni la tariffa migliore, la conferma immediata e un contatto diretto con il proprietario per qualsiasi esigenza prima o durante il soggiorno. Senza intermediari, senza sorprese.',
  'Mejor precio garantizado':
    'Miglior prezzo garantito',
  'Por qu&eacute; reservar aqu&iacute; y no en Booking':
    'Perché prenotare qui e non su Booking',
  'Los portales a&ntilde;aden entre un 15% y un 22% al precio de tu estancia. Reservar directamente tiene ventajas reales que van m&aacute;s all&aacute; del dinero.':
    'I portali aggiungono tra il 15% e il 22% al prezzo del soggiorno. Prenotare direttamente ha vantaggi concreti che vanno oltre il denaro.',
  'Hasta un 22% m&aacute;s barato':
    'Fino al 22% in meno',
  'Sin comisiones de Booking, Airbnb ni Expedia. El ahorro va &iacute;ntegro a tu bolsillo. En una semana de estancia puede suponer 200&euro; o m&aacute;s.':
    'Nessuna commissione di Booking, Airbnb o Expedia. Il risparmio va tutto in tasca tua &mdash; su una settimana può valere 200&euro; o più.',
  'Trato directo con el propietario':
    'Rapporto diretto con il proprietario',
  'Hablas con Alberto, no con un call center. Flexible con horarios de llegada, parking, peticiones especiales y necesidades del grupo.':
    'Parli con Alberto, non con un call center. Flessibile su orari di arrivo, parcheggio, richieste particolari e necessità del gruppo.',
  'Sin esperas ni burocracia. Tu reserva confirmada al instante por WhatsApp o email. Condiciones de cancelaci&oacute;n negociables directamente.':
    'Niente attese né burocrazia. La prenotazione è confermata subito via WhatsApp o email, e le condizioni di cancellazione si concordano direttamente.',
  'Ver disponibilidad y precios':
    'Vedi disponibilità e prezzi',
  'o ll&aacute;manos al':
    'oppure chiamaci al',
  'Reserva directa':
    'Prenotazione diretta',
  'Comprueba disponibilidad':
    'Verifica la disponibilità',
  'Reserva directamente sin intermediarios. Sin comisiones. Confirmaci&oacute;n inmediata.':
    'Prenota direttamente, senza intermediari. Senza commissioni. Conferma immediata.',
  'Rese&ntilde;as':
    'Recensioni',
  'Lo que dicen nuestros hu&eacute;spedes':
    'Cosa dicono i nostri ospiti',
  '"Espectacular. El patio andaluz es un sue&ntilde;o. Dormimos 10 personas comod&iacute;simas y el parking fue un plus enorme en el casco hist&oacute;rico."':
    '"Spettacolare. Il patio andaluso è un sogno. Abbiamo dormito in dieci comodissimi e il parcheggio è stato un enorme vantaggio nel centro storico."',
  'Casa tur&iacute;stica en el casco hist&oacute;rico de Sevilla. 290 m&sup2;, 6 dormitorios, parking privado. Reserva directa sin comisiones.':
    'Casa vacanze con licenza nel centro storico di Siviglia. 290 m&sup2;, 6 camere, parcheggio privato. Prenotazione diretta senza commissioni.',
  'Caracter&iacute;sticas':
    'Caratteristiche',
  'Galer&iacute;a':
    'Galleria',
  'Reservar':
    'Prenota',
  'Contacto':
    'Contatti',
  'Calle Socorro 24, Sevilla':
    'Calle Socorro 24, Siviglia',
  'VFT/SE/01179 &middot; Registro de Turismo de Andaluc&iacute;a':
    'VFT/SE/01179 &middot; Registro del Turismo dell\'Andalusia',
  'Llamar':
    'Chiama',
  'Sigue leyendo':
    'Continua a leggere',
  'M&aacute;s sobre la casa y el barrio':
    'Altro sulla casa e sul quartiere',
  'Qu&eacute; ver en Sevilla':
    'Cosa vedere a Siviglia',
  'El barrio de la Macarena':
    'Il quartiere della Macarena',
  'Casa con parking en el centro':
    'Casa con parcheggio in centro',
  'Comprobar disponibilidad':
    'Verifica disponibilità',
}
