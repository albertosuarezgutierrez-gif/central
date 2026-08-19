// apps/housesevillana/app/en/traducciones.ts
//
// Diccionario ES→EN de la landing. Se aplica sobre el MISMO HTML de `app/route.ts`
// en vez de mantener una segunda copia del fichero, por dos razones:
//
//   1. El agente SEO de sivra (`/api/seo-refresh`) reescribe `app/route.ts` sola cada
//      lunes por la GitHub Contents API. Con dos copias, la inglesa se quedaría atrás
//      en silencio a la primera pasada.
//   2. Un cambio de diseño o de precio se hace una vez y aparece en los dos idiomas.
//
// Por qué existe esto (GA4, 12 meses a 11/08/2026): de 82 usuarios, el **72% navega en
// inglés**, 14,6% en español y 11% en italiano. Por países, EE.UU. 34%, España 17%,
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
  // ── Head, navegación y hero ──────────────────────────────────────────────────
  // El <title> y las descripciones NO están aquí: los escribe `META` en `route.ts` por
  // etiqueta, porque el agente SEO reescribe esas frases en el español cada lunes y una
  // clave de diccionario dejaría de casar en silencio. Ver `../i18n/motor`.
  'La casa': 'The house',
  'Fotos': 'Photos',
  'Ubicaci&oacute;n': 'Location',
  'Reservar directo': 'Book direct',
  '&#9733; Reserva directa &middot; Sin comisiones': '&#9733; Book direct &middot; No fees',
  'Casa con': 'A house with',
  'en el coraz&oacute;n': 'in the heart',
  'de Sevilla': 'of Seville',
  '290 m&sup2; reformados en el casco hist&oacute;rico. 6 dormitorios, 4 ba&ntilde;os, terraza, patio andaluz y parking privado &mdash; para grupos y familias de hasta 12 personas.':
    '290 m&sup2; refurbished in the historic centre. 6 bedrooms, 4 bathrooms, a roof terrace, an Andalusian courtyard and private parking &mdash; for groups and families of up to 12.',
  '6 dorm &middot; 4 ba&ntilde;os': '6 bed &middot; 4 bath',
  'Terraza + Patio': 'Terrace + Courtyard',
  'Hasta 12 personas': 'Up to 12 guests',
  '8,6/10': '8.6/10',
  'Consultar disponibilidad': 'Check availability',
  'Ver la casa': 'See the house',
  'La propiedad': 'The property',
  'Dorm.': 'Beds',
  'Ba&ntilde;os': 'Baths',
  'Hu&eacute;spedes': 'Guests',
  'Muy bien valorado': 'Highly rated',
  'Booking.com &middot; 51 rese&ntilde;as': 'Booking.com &middot; 51 reviews',
  'Ver disponibilidad &#8594;': 'See availability &#8594;',
  'Parking privado': 'Private parking',
  '&mdash; el &uacute;nico del barrio': '&mdash; the only one in the area',
  'Confirmaci&oacute;n inmediata': 'Instant confirmation',
  'Sin comisiones</strong> &mdash; el mejor precio est&aacute; aqu&iacute;':
    'No booking fees</strong> &mdash; the best rate is right here',
  '&middot; 51 rese&ntilde;as verificadas': '&middot; 51 verified reviews',

  // ── La casa ──────────────────────────────────────────────────────────────────
  'Una casa sevillana para vivirla': 'A Sevillian house made for living in',
  '290 m&sup2; reformados con materiales nobles en el coraz&oacute;n del casco hist&oacute;rico. Pensada para grupos y familias que quieren espacio, comodidad y autenticidad.':
    '290 m&sup2; refurbished with fine materials in the heart of the historic centre. Designed for groups and families who want space, comfort and something genuine.',
  'Parking privado en el edificio': 'Private parking in the building',
  'Rars&iacute;simo en el casco antiguo de Sevilla. 1 plaza de garaje en el propio edificio, reservable con tu estancia. Aparcar en zona hist&oacute;rica ya no es un problema.':
    'Extremely rare in Seville&#39;s old town. One garage space in the building itself, bookable with your stay. Parking in the historic centre stops being a problem.',
  '6 dormitorios dobles': '6 double bedrooms',
  'Todos con camas de matrimonio. Capacidad real para hasta 12 personas sin perder comodidad ni privacidad.':
    'All with double beds. Genuine room for up to 12 people without losing comfort or privacy.',
  '4 ba&ntilde;os completos': '4 full bathrooms',
  'Con ducha o ba&ntilde;era, toallas y art&iacute;culos de bienvenida incluidos para todos los hu&eacute;spedes.':
    'With shower or bath, towels and welcome amenities included for every guest.',
  'Patio andaluz aut&eacute;ntico': 'Authentic Andalusian courtyard',
  'Patio sevillano con azulejos t&iacute;picos y fuente interior. El lugar favorito de todos los que nos visitan.':
    'A Sevillian courtyard with traditional azulejo tiles and a fountain. Everyone&#39;s favourite corner of the house.',
  'Terraza con vistas': 'Roof terrace with views',
  'Azotea privada con vistas al casco hist&oacute;rico. El lugar ideal para las noches de verano sevillano.':
    'A private rooftop overlooking the old town. The place to be on a Seville summer night.',
  'Cocina totalmente equipada': 'Fully equipped kitchen',
  'Horno, microondas, nevera grande, cafetera y utensilios completos. Lista para cocinar para 12 personas.':
    'Oven, microwave, large fridge, coffee machine and a full set of utensils. Ready to cook for 12.',
  'La casa por dentro': 'Inside the house',
  'Haz clic en cualquier foto para ampliarla': 'Click any photo to enlarge it',

  // ── Ubicación ────────────────────────────────────────────────────────────────
  'En el coraz&oacute;n del casco hist&oacute;rico': 'In the heart of the historic centre',
  'Calle Socorro 24, barrio de San Juli&aacute;n (41003 Sevilla). A pasos del Palacio de las Due&ntilde;as y la Iglesia de San Luis de los Franceses.':
    'Calle Socorro 24, San Juli&aacute;n quarter (41003 Seville). Steps from Palacio de las Due&ntilde;as and the church of San Luis de los Franceses.',
  'Palacio de las Due&ntilde;as': 'Palacio de las Due&ntilde;as',
  'San Luis de los Franceses': 'San Luis de los Franceses',
  'Catedral de Sevilla': 'Seville Cathedral',
  'Real Alc&aacute;zar': 'Royal Alc&aacute;zar',
  'Torre del Oro': 'Torre del Oro',
  'Plaza de Espa&ntilde;a': 'Plaza de Espa&ntilde;a',
  'Barrio de Triana': 'Triana district',
  'Estaci&oacute;n Santa Justa': 'Santa Justa station',
  'Aeropuerto SVQ': 'SVQ airport',
  '2 min a pie': '2 min walk',
  '4 min a pie': '4 min walk',
  '10 min a pie': '10 min walk',
  '12 min a pie': '12 min walk',
  '14 min a pie': '14 min walk',
  '15 min a pie': '15 min walk',
  '20 min a pie': '20 min walk',
  '25 min a pie': '25 min walk',
  '20 min en taxi': '20 min by taxi',

  // ── FAQ ──────────────────────────────────────────────────────────────────────
  'Preguntas frecuentes': 'Frequently asked questions',
  'Todo lo que necesitas saber': 'Everything you need to know',
  '&iquest;No encuentras tu respuesta? Escr&iacute;benos por WhatsApp y te contestamos hoy mismo.':
    'Cannot find your answer? Message us on WhatsApp and we will reply the same day.',
  'Preguntar por WhatsApp': 'Ask on WhatsApp',
  '&iquest;Tiene parking privado House Sevillana?': 'Does House Sevillana have private parking?',
  'S&iacute;. Dispone de una plaza de garaje privado en el mismo edificio, reservable con tu estancia. Aparcar en el casco antiguo de Sevilla es muy complicado y costoso &mdash; esta es nuestra ventaja m&aacute;s valorada por los hu&eacute;spedes que llegan en coche.':
    'Yes. There is a private garage space in the building itself, bookable with your stay. Parking in Seville&#39;s old town is difficult and expensive &mdash; this is the feature guests arriving by car value most.',
  '&iquest;Para cu&aacute;ntas personas es House Sevillana?': 'How many people does House Sevillana sleep?',
  '6 dormitorios dobles para hasta 12 personas. Perfecta para grupos de amigos, familias numerosas multigeneracionales o varias parejas que viajan juntas a Sevilla. Si eres menos de 6 personas, tambi&eacute;n es una opci&oacute;n excepcional por el espacio y el precio por persona.':
    'Six double bedrooms for up to 12 guests. Ideal for groups of friends, large multi-generational families or several couples travelling to Seville together. For smaller parties it still works beautifully, given the space and the price per person.',
  '&iquest;A qu&eacute; distancia est&aacute; la Catedral de Sevilla?': 'How far is Seville Cathedral?',
  'La Catedral y la Giralda est&aacute;n a unos 10 minutos andando. El Real Alc&aacute;zar a 12 minutos, la Torre del Oro a 14 y la Plaza de Espa&ntilde;a a 15 minutos a pie. House Sevillana est&aacute; en el barrio de San Juli&aacute;n, en pleno casco antiguo, a menos de 5 minutos del Palacio de las Due&ntilde;as.':
    'The Cathedral and the Giralda are about a 10-minute walk. The Royal Alc&aacute;zar is 12 minutes, the Torre del Oro 14 and Plaza de Espa&ntilde;a 15. House Sevillana sits in the San Juli&aacute;n quarter, right inside the old town, under 5 minutes from Palacio de las Due&ntilde;as.',
  '&iquest;Se admiten ni&ntilde;os? &iquest;Y mascotas?': 'Are children allowed? And pets?',
  'Se admiten ni&ntilde;os de todas las edades. La casa es ideal para familias multigeneracionales gracias a sus dimensiones y 4 ba&ntilde;os. Las mascotas no est&aacute;n permitidas en la propiedad.':
    'Children of all ages are welcome. The size of the house and its 4 bathrooms make it ideal for multi-generational families. Pets are not allowed.',
  '&iquest;Se permiten despedidas de soltero o fiestas?': 'Are stag or hen parties allowed?',
  'No. Las despedidas de soltero/a y eventos similares no est&aacute;n permitidos. Hay silencio obligatorio entre las 21:00 y las 09:00 h. Se aplica un dep&oacute;sito de garant&iacute;a de hasta 150 &euro; que se devuelve tras el check-out si no hay desperfectos.':
    'No. Stag and hen parties and similar events are not permitted. Quiet hours are enforced between 21:00 and 09:00. A security deposit of up to 150 &euro; applies and is returned after check-out if there is no damage.',
  '&iquest;Cu&aacute;les son los horarios de check-in y check-out?': 'What are the check-in and check-out times?',
  'Check-in a partir de las 15:00 h. Check-out hasta las 12:00 h. Si necesitas horario flexible &mdash; llegada tarde por el avi&oacute;n o salida despu&eacute;s de comer &mdash; cons&uacute;ltalo directamente con el propietario al reservar.':
    'Check-in from 15:00. Check-out by 12:00. If you need flexibility &mdash; a late arrival because of a flight, or a departure after lunch &mdash; just ask the owner directly when you book.',
  '&iquest;C&oacute;mo llego desde el aeropuerto de Sevilla?': 'How do I get here from Seville airport?',
  'El aeropuerto SVQ est&aacute; a unos 11 km. En taxi o VTC son aproximadamente 16&ndash;20 minutos seg&uacute;n tr&aacute;fico. Tambi&eacute;n puedes coger el autob&uacute;s EA hasta el centro (35&ndash;40 min, sale desde la terminal). Si vienes en coche, tendr&aacute;s tu plaza de parking esperando.':
    'SVQ airport is about 11 km away &mdash; roughly 16&ndash;20 minutes by taxi or ride-hailing, depending on traffic. You can also take the EA bus into the centre (35&ndash;40 min, from the terminal). If you drive, your parking space will be waiting.',
  '&iquest;Hay restaurantes y supermercados cerca?': 'Are there restaurants and shops nearby?',
  'A pocos metros encontrar&aacute;s La Parcer&iacute;a Caf&eacute;, Ojal&aacute; Tapas y Vinos y el Restaurante Condend&ecirc; (200 m). El Mercado de la Encarnaci&oacute;n (Las Setas) est&aacute; a 10 minutos andando con puestos de frutas, verduras y productos locales.':
    'A few steps away you&#39;ll find La Parcer&iacute;a Caf&eacute;, Ojal&aacute; Tapas y Vinos and Restaurante Condend&ecirc; (200 m). The Encarnaci&oacute;n market (Las Setas) is a 10-minute walk, with fruit, vegetable and local produce stalls.',
  '&iquest;Cu&aacute;l es la pol&iacute;tica de cancelaci&oacute;n?': 'What is the cancellation policy?',
  'Las condiciones exactas se muestran en el motor de reservas seg&uacute;n las fechas elegidas. Reservando directamente puedes hablar con el propietario para condiciones m&aacute;s flexibles &mdash; algo imposible a trav&eacute;s de las plataformas.':
    'The exact terms are shown in the booking engine for your chosen dates. Booking direct means you can talk to the owner about more flexible terms &mdash; something the platforms simply don&#39;t allow.',
  '&iquest;Por qu&eacute; reservar aqu&iacute; y no en Booking.com?': 'Why book here instead of Booking.com?',
  'Booking.com cobra entre un 15% y un 22% de comisi&oacute;n que repercute en el precio final. Reservando en esta web obtienes el mejor precio garantizado, confirmaci&oacute;n inmediata y trato directo con el propietario para cualquier necesidad antes o durante tu estancia. Sin intermediarios, sin sorpresas.':
    'Booking.com charges between 15% and 22% commission, and that lands in the final price. Booking on this site gets you the best available rate, instant confirmation and a direct line to the owner for anything you need before or during your stay. No middlemen, no surprises.',

  // ── Reserva directa ──────────────────────────────────────────────────────────
  'Mejor precio garantizado': 'Best rate guaranteed',
  'Por qu&eacute; reservar aqu&iacute; y no en Booking': 'Why book here instead of Booking',
  'La comisi&oacute;n que cobran los portales acaba en el precio que pagas t&uacute;. Aqu&iacute; no hay intermediario &mdash; y reservar directamente tiene adem&aacute;s ventajas que van m&aacute;s all&aacute; del dinero.':
    'The commission the portals charge ends up in the price you pay. Here there is no middleman &mdash; and booking direct also brings advantages that go beyond the money.',
  'Siempre m&aacute;s barato que en los portales': 'Always cheaper than the portals',
  'Aqu&iacute; no hay comisi&oacute;n de Booking, Airbnb ni Expedia, y ese ahorro se descuenta de tu precio. No es una promoci&oacute;n puntual: el descuento por reserva directa se aplica siempre, a cualquier fecha y cualquier estancia.':
    'There is no Booking, Airbnb or Expedia commission here, and that saving comes off your price. It is not a one-off promotion: the direct-booking discount applies always, on any date and any stay.',
  'Trato directo con el propietario': 'Deal directly with the owner',
  'Hablas con Alberto, no con un call center. Flexible con horarios de llegada, parking, peticiones especiales y necesidades del grupo.':
    'You talk to Alberto, not a call centre. Flexible on arrival times, parking, special requests and whatever your group needs.',
  'Sin esperas ni burocracia. Tu reserva confirmada al instante por WhatsApp o email. Condiciones de cancelaci&oacute;n negociables directamente.':
    'No waiting, no paperwork. Your booking is confirmed instantly by WhatsApp or email, and cancellation terms can be agreed directly.',
  'Ver disponibilidad y precios': 'See availability and rates',
  'o ll&aacute;manos al': 'or call us on',
  'Reserva directa': 'Direct booking',
  'Comprueba disponibilidad': 'Check availability',
  'Reserva directamente sin intermediarios. El descuento por reserva directa ya viene aplicado en el precio que ves &mdash; no necesitas ning&uacute;n c&oacute;digo. Confirmaci&oacute;n inmediata.':
    'Book direct, with no middlemen. The direct-booking discount is already applied to the price you see &mdash; you do not need any code. Instant confirmation.',

  // ── Reseñas ──────────────────────────────────────────────────────────────────
  'Rese&ntilde;as': 'Reviews',
  'Lo que dicen nuestros hu&eacute;spedes': 'What our guests say',
  '"Espectacular. El patio andaluz es un sue&ntilde;o. Dormimos 10 personas comod&iacute;simas y el parking fue un plus enorme en el casco hist&oacute;rico."':
    '"Spectacular. The Andalusian courtyard is a dream. Ten of us slept very comfortably, and the parking was a huge plus in the historic centre."',

  // ── Pie ──────────────────────────────────────────────────────────────────────
  'Casa tur&iacute;stica en el casco hist&oacute;rico de Sevilla. 290 m&sup2;, 6 dormitorios, parking privado. Reserva directa sin comisiones.':
    'Licensed holiday home in Seville&#39;s historic centre. 290 m&sup2;, 6 bedrooms, private parking. Book direct with no fees.',
  'Caracter&iacute;sticas': 'Features',
  'Galer&iacute;a': 'Gallery',
  'Reservar': 'Book',
  'Contacto': 'Contact',
  'Calle Socorro 24, Sevilla': 'Calle Socorro 24, Seville',
  '&copy; House Sevillana &middot; Todos los derechos reservados':
    '&copy; House Sevillana &middot; All rights reserved',
  'VFT/SE/01179 &middot; Registro de Turismo de Andaluc&iacute;a':
    'VFT/SE/01179 &middot; Andalusian Tourism Registry',
  'Llamar': 'Call',
  'Sigue leyendo': 'Keep reading',
  'M&aacute;s sobre la casa y el barrio': 'More about the house and the area',
  'Qu&eacute; ver en Sevilla': 'What to see in Seville',
  'El barrio de la Macarena': 'The Macarena quarter',
  'Casa con parking en el centro': 'House with parking in the centre',
  'Comprobar disponibilidad': 'Check availability',
}

/**
 * Traduce el HTML español al inglés.
 *
 * Sustituye de la cadena más larga a la más corta a propósito: si «La casa» se aplicase
 * antes que «La casa por dentro», la segunda quedaría medio traducida.
 */
export function traducir(html: string): string {
  let out = html
  for (const es of Object.keys(TRADUCCIONES).sort((a, b) => b.length - a.length)) {
    out = out.split(es).join(TRADUCCIONES[es])
  }
  return out
}
