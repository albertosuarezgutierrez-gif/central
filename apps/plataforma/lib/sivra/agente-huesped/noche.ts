// lib/sivra/agente-huesped/noche.ts — MODO NOCHE del agente de huéspedes (política, pura y testeada).
//
// El problema que resuelve (decisión de Alberto, 05/09/2026): fuera del horario de atención
// (09:00–21:00) el agente sigue auto-enviando lo que está apoyado en una fuente, pero todo lo que
// ESCALA se queda como borrador en Telegram hasta que Alberto lo ve. Si escala a las 23:30, el
// huésped no recibe NADA hasta las 09:00 — y desde el código ese silencio es idéntico a una
// conversación atendida. Caso que lo dispara: Mafalda (Luxury Busto, 154265696), que preguntaba a
// medianoche si podía llegar a las 23:30.
//
// Lo que NO se hace: dar autonomía a las respuestas que el sistema marcó `needs_human`. Eso sería
// soltar sin supervisión justo lo que el agente dijo que no sabía contestar, y en las horas en las
// que nadie lo corrige. El modo noche NO redacta: solo acusa recibo y escala.
//
// Escalera, en tres peldaños:
//   1. Cualquier escalado de noche → ACUSE de recibo inmediato al huésped (texto fijo, sin IA).
//   2. Si además es una URGENCIA de acceso o avería → aviso que despierta a Alberto por Telegram.
//   3. Si a los MINUTOS_ULTIMO_RECURSO nadie ha contestado → se le dice al huésped que contacte con
//      el servicio de atención de su portal de reserva. Es el ÚLTIMO recurso a propósito: el portal
//      no puede abrir una puerta ni conoce el código de acceso, y una llamada suya abre un caso
//      contra el anfitrión. Va después de intentar despertar a Alberto, nunca en su lugar.
//
// Los textos son CONSTANTES por idioma, no generados: el acuse es la red de seguridad y no puede
// depender de la IA ni del clasificador, que son justo lo que puede estar caído a esa hora.
//
// Sin imports a propósito: los módulos puros de esta carpeta se testean con `node --test`, que no
// resuelve un import relativo sin extensión. El horario se declara aquí y `noche.test.ts` comprueba
// que sigue coincidiendo con el `HORARIO_ATENCION` de `llegada.ts` (que es el que ve el agente en la
// ficha del piso): si alguien cambia uno y no el otro, el test lo caza en vez de dejar que el acuse
// prometa un horario distinto del que le decimos al huésped.

/** Minutos que esperamos a que Alberto responda antes de derivar al portal de reserva. */
export const MINUTOS_ULTIMO_RECURSO = 15

/** Hora (0-23) en Europe/Madrid para una fecha dada. */
export function horaMadrid(d: Date = new Date()): number {
  return parseInt(d.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }), 10)
}

/** ¿Estamos fuera del horario de atención (21:00–09:00 hora de España)? */
export function esModoNoche(d: Date = new Date()): boolean {
  const h = horaMadrid(d)
  return h < 9 || h >= 21
}

// URGENCIA = el huésped no puede entrar o hay una avería que no admite esperar a las 09:00. Solo
// esto despierta a Alberto; lo demás recibe el acuse y espera. Conservador a propósito y en varios
// idiomas: un falso positivo cuesta una notificación de madrugada, un falso negativo cuesta un
// huésped en la calle.
const RE_URGENCIA = new RegExp([
  // acceso
  'no (puedo|podemos|consigo|conseguimos|logro|logramos) (entrar|abrir|acceder)',
  'no (se )?abre', 'no me abre', 'la (puerta|cerradura) no', 'cerradura', 'estamos (fuera|en la calle)',
  'el c[oó]digo no (funciona|va|sirve)', 'no funciona el c[oó]digo', 'sin llave', 'no tengo (las )?llaves?',
  "can'?t (get in|open|enter)", 'cannot (get in|open|enter)', 'locked out', "door (won'?t|doesn'?t) open",
  "(code|key|lock) (doesn'?t|does not) work", 'not able to (get in|enter)',
  'je ne peux pas entrer', 'la porte ne s.ouvre', 'serrure', 'le code ne fonctionne',
  'non riesco a (entrare|aprire)', 'la porta non si apre', 'il codice non funziona',
  'komm(e|en|t) nicht (rein|hinein|herein)', 'die t[uü]r (geht|l[aä]sst) sich nicht',
  // avería
  'no hay (luz|agua|electricidad|calefacci[oó]n)', 'sin (luz|agua|electricidad)', 'se ha ido la luz',
  'fuga de agua', 'inundaci[oó]n', 'se est[aá] inundando', 'huele a gas', '\\bhumo\\b', 'incendio',
  'no (power|electricity|water|hot water)', 'water leak', 'flood(ing|ed)', 'gas (smell|leak)', '\\bsmoke\\b', '\\bfire\\b(?!works|place|wood)',
  'pas d.(eau|[eé]lectricit[eé])', 'fuite d.eau',
  'non c.[eè] (luce|acqua)', 'perdita d.acqua',
  'kein (strom|wasser)', 'wasserschaden',
].join('|'), 'i')

/** ¿El mensaje del huésped es una urgencia de acceso o avería? */
export function esUrgenciaNocturna(texto: string): boolean {
  return RE_URGENCIA.test(texto || '')
}

type Idioma = 'es' | 'en' | 'fr' | 'it' | 'de' | 'pt'
function normalizarIdioma(lang: string): Idioma {
  const l = (lang || '').slice(0, 2).toLowerCase()
  return (['es', 'en', 'fr', 'it', 'de', 'pt'] as const).includes(l as Idioma) ? (l as Idioma) : 'en'
}

/** Horario de atención al huésped. Debe coincidir con `HORARIO_ATENCION` de `llegada.ts`. */
export const HORARIO = { desde: '09:00', hasta: '21:00' } as const

const H = `${HORARIO.desde}–${HORARIO.hasta}`

const ACUSE: Record<Idioma, { normal: string; urgente: string }> = {
  es: {
    normal: `Hemos recibido tu mensaje. Ahora mismo estamos fuera del horario de atención (${H}, hora de España), así que te respondemos a primera hora de la mañana. Gracias por la paciencia.`,
    urgente: `Hemos recibido tu mensaje y ya hemos avisado al anfitrión, aunque estamos fuera del horario de atención (${H}, hora de España). Danos unos minutos, por favor.`,
  },
  en: {
    normal: `We've received your message. We're currently outside our support hours (${H}, Spanish time), so we'll get back to you first thing in the morning. Thanks for your patience.`,
    urgente: `We've received your message and have already alerted the host, even though we're outside our support hours (${H}, Spanish time). Please give us a few minutes.`,
  },
  fr: {
    normal: `Nous avons bien reçu votre message. Nous sommes actuellement en dehors de nos horaires d'assistance (${H}, heure espagnole) ; nous vous répondrons dès demain matin. Merci de votre patience.`,
    urgente: `Nous avons bien reçu votre message et avons déjà prévenu l'hôte, même si nous sommes en dehors de nos horaires d'assistance (${H}, heure espagnole). Merci de patienter quelques minutes.`,
  },
  it: {
    normal: `Abbiamo ricevuto il tuo messaggio. Al momento siamo fuori dall'orario di assistenza (${H}, ora spagnola), quindi ti risponderemo domattina presto. Grazie per la pazienza.`,
    urgente: `Abbiamo ricevuto il tuo messaggio e abbiamo già avvisato l'host, anche se siamo fuori dall'orario di assistenza (${H}, ora spagnola). Ti chiediamo qualche minuto.`,
  },
  de: {
    normal: `Wir haben Ihre Nachricht erhalten. Wir sind gerade außerhalb unserer Servicezeiten (${H}, spanische Zeit) und melden uns morgen früh bei Ihnen. Danke für Ihre Geduld.`,
    urgente: `Wir haben Ihre Nachricht erhalten und den Gastgeber bereits benachrichtigt, obwohl wir außerhalb unserer Servicezeiten sind (${H}, spanische Zeit). Bitte geben Sie uns ein paar Minuten.`,
  },
  pt: {
    normal: `Recebemos a sua mensagem. Estamos fora do horário de atendimento (${H}, hora de Espanha), por isso respondemos logo pela manhã. Obrigado pela paciência.`,
    urgente: `Recebemos a sua mensagem e já avisámos o anfitrião, embora estejamos fora do horário de atendimento (${H}, hora de Espanha). Dê-nos alguns minutos, por favor.`,
  },
}

const ULTIMO_RECURSO: Record<Idioma, string> = {
  es: 'Seguimos intentando localizar al anfitrión. Si el asunto no puede esperar a mañana, contacta también con el servicio de atención de tu portal de reserva (Booking, Airbnb…) desde la app o la web de tu reserva: ellos pueden localizarnos por otra vía. Sentimos mucho el contratiempo.',
  en: "We're still trying to reach the host. If this can't wait until morning, please also contact the customer service of your booking platform (Booking, Airbnb…) from the app or website of your reservation — they can reach us through another channel. We're very sorry for the trouble.",
  fr: "Nous essayons toujours de joindre l'hôte. Si cela ne peut pas attendre demain matin, contactez également le service client de votre plateforme de réservation (Booking, Airbnb…) depuis l'application ou le site de votre réservation : ils peuvent nous joindre autrement. Nous sommes vraiment désolés.",
  it: "Stiamo ancora cercando di contattare l'host. Se non può aspettare domattina, contatta anche il servizio clienti del portale di prenotazione (Booking, Airbnb…) dall'app o dal sito della tua prenotazione: possono raggiungerci per un'altra via. Ci scusiamo molto.",
  de: 'Wir versuchen weiterhin, den Gastgeber zu erreichen. Falls es nicht bis morgen früh warten kann, wenden Sie sich bitte auch an den Kundenservice Ihrer Buchungsplattform (Booking, Airbnb…) über die App oder Website Ihrer Reservierung — sie können uns auf anderem Weg erreichen. Wir bitten die Unannehmlichkeiten zu entschuldigen.',
  pt: 'Continuamos a tentar contactar o anfitrião. Se o assunto não puder esperar até amanhã, contacte também o serviço de apoio ao cliente do seu portal de reserva (Booking, Airbnb…) através da app ou do site da sua reserva: eles conseguem contactar-nos por outra via. Lamentamos muito o contratempo.',
}

/** Acuse de recibo nocturno, en el idioma del huésped. */
export function textoAcuse(lang: string, urgente: boolean): string {
  const t = ACUSE[normalizarIdioma(lang)]
  return urgente ? t.urgente : t.normal
}

/** Último recurso: derivar al portal de reserva tras MINUTOS_ULTIMO_RECURSO sin respuesta. */
export function textoUltimoRecurso(lang: string): string {
  return ULTIMO_RECURSO[normalizarIdioma(lang)]
}
