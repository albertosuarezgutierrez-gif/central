// lib/sivra/agente-huesped/reglas.ts — reglas deterministas puras (extraídas de reply/route.ts).
// Sin imports externos para ser testeables con `node --test` sin dependencias.

export const PARKING_SPOTS: Record<string, number> = {
  prop_house_sevillana: 1,
  prop_busto_reform: 0,
  prop_duplex_center: 0,
  prop_luxury_busto: 1,
  all: 0,
}

export function extractEarlyTime(text: string): { type: 'early_checkout' | 'early_checkin_request', time: string } | null {
  const t = text.toLowerCase()
  const checkoutPatterns = [
    /(?:salgo|salimos|saldremos|we.?(?:check|leave)|checkout|check.?out|leaving|departing|leaving|we.?leave).*?(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?/i,
    /(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(?:salgo|salimos|saldremos|we.?leave|check.?out)/i,
  ]
  const checkinPatterns = [
    /(?:llego|llegamos|arrivo|arrive|arriving|check.?in|coming).*?(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?/i,
    /(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(?:llego|llegamos|arrive|check.?in)/i,
    /(?:puedo|podemos|can i|can we).*?(?:llegar|entrar|check.?in|arrive).*?(?:a las?|at|@)\s*(\d{1,2})(?::(\d{2}))?/i,
  ]
  for (const p of checkoutPatterns) {
    const m = t.match(p)
    if (m) { const h = parseInt(m[1]); const min = m[2] ? m[2].padStart(2,'0') : '00'; if (h >= 6 && h < 12) return { type: 'early_checkout', time: `${h.toString().padStart(2,'0')}:${min}` } }
  }
  for (const p of checkinPatterns) {
    const m = t.match(p)
    if (m) { const h = parseInt(m[1]); const min = m[2] ? m[2].padStart(2,'0') : '00'; if (h >= 8 && h < 15) return { type: 'early_checkin_request', time: `${h.toString().padStart(2,'0')}:${min}` } }
  }
  return null
}

export function detectCategory(text: string): string | null {
  const t = text.toLowerCase()
  if (/wifi|wi-fi|wlan|internet|contraseña|password|clave/.test(t)) return 'wifi'
  if (/llave|key|clé|schlüssel|chiave|lockbox|código|code|caja|puerta|abrir|entrar|acceso/.test(t)) return 'acceso'
  if (/check.?in|llegada|arrival|hora de entrada|from what time|a qué hora llegar/.test(t)) return 'checkin'
  // Equipaje ANTES que checkout: "dónde dejar las maletas" contiene "dejar" (patrón de checkout).
  if (/maleta|equipaje|luggage|consigna|locker|baggage|valig|bagagl|gep[aä]ck|guardar (las |mis )?(maletas|bolsas|cosas)/.test(t)) return 'equipaje'
  if (/check.?out|salida|departure|hora de salida|dejar/.test(t)) return 'checkout'
  if (/parking|aparcar|aparcamiento|coche|voiture|auto|car|garaje|garage|plaza/.test(t)) return 'parking'
  if (/normas|rules|règles|regeln|regole|fumar|smoking|fiesta|party|silencio/.test(t)) return 'normas'
  if (/emergencia|urgencia|problema|avería|contacto|teléfono|phone/.test(t)) return 'contacto'
  if (/toallas|towels|sábanas|linen|ropa de cama/.test(t)) return 'faq'
  if (/supermercado|supermarket|tienda|shop|compra|comida|mercado/.test(t)) return 'faq'
  return null
}

// Detecta el idioma en que ESCRIBE el huésped (es lo que mandará la respuesta). El regex anterior
// solo miraba tildes/keywords → "Nos iremos sobre las 10.30" (español sin tildes) caía a inglés.
// Ahora puntúa marcadores ES vs EN; si no hay señal clara, usa `fallback` (p.ej. idioma de Smoobu).
export function detectLang(
  text: string,
  fallback: 'es' | 'en' | 'fr' | 'de' | 'it' = 'en',
): 'es' | 'en' | 'fr' | 'de' | 'it' {
  const t = text || ''
  // Idiomas menos frecuentes: marcadores distintivos (van primero).
  if (/\b(bonjour|merci|est-ce|vous|nous|comment|quand|où|je voudrais)\b/i.test(t)) return 'fr'
  if (/\b(guten|danke|bitte|ich|wir|haben|sind|wie|wann|wo|möchte|können)\b/i.test(t)) return 'de'
  if (/\b(ciao|grazie|prego|buongiorno|come|quando|dove|vorrei|posso)\b/i.test(t)) return 'it'

  // Español vs inglés por puntuación + palabras frecuentes.
  let es = 0, en = 0
  if (/[áéíóúüñ¿¡]/i.test(t)) es += 2
  const esW = t.match(/\b(hola|gracias|buenos|buenas|dias|d[ií]as|tardes|noches|nos|vamos|iremos|salimos|saldremos|llegamos|llego|llegar|llegaremos|salida|entrada|puedo|podemos|queria|quiero|necesito|donde|d[oó]nde|cuando|cu[aá]ndo|qu[eé]|como|c[oó]mo|hora|sobre|las|los|una|para|con|esta|est[aá]|estamos|habitacion|habitaci[oó]n|llave|llaves|reserva|apartamento|manana|ma[ñn]ana|aproximadamente|tambien|tambi[eé]n|muchas)\b/gi)
  const enW = t.match(/\b(the|you|your|i'd|i'm|we'd|we're|can|could|would|like|please|is|are|at|this|that|hi|hello|thanks|thank|what|when|where|which|time|arrive|arriving|leave|leaving|will|need|want|able|stay|early|late|to|request|there|have|our)\b/gi)
  es += esW ? esW.length : 0
  en += enW ? enW.length : 0
  if (es === en) return fallback
  return es > en ? 'es' : 'en'
}

// ¿Es una petición de LATE CHECK-OUT (salir más tarde de la hora oficial)? Distinto de una pregunta
// meramente informativa ("¿a qué hora es el check-out?"), que NO debe forzar el escalado a Alberto.
// Dos frentes: (a) palabras clave típicas de "salir/quedarnos más tarde"; (b) comparación explícita de
// horas ("a las 12 en vez de las 11") — la forma más habitual de pedirlo sin decir la palabra "tarde".
const RE_LATE_CHECKOUT_KEYWORDS = /late\s*check.?out|salida\s*tard[ií]a|salir\s*(un poco\s*)?m[aá]s\s*tarde|irnos?\s*(un poco\s*)?m[aá]s\s*tarde|quedar(nos)?\s*(un poco\s*)?m[aá]s(\s*tiempo)?|ampliar\s*(la\s*)?salida|retrasar\s*(la\s*)?salida|leave\s*(a bit\s*)?later|stay\s*(a bit\s*)?longer|later\s*check.?out|extend(er)?\s*(the\s*)?check.?out|check.?out\s*plus\s*tard|partir\s*plus\s*tard|sp[aä]ter\s*(aus)?check.?out/i
const RE_LATE_CHECKOUT_COMPARACION = /(salir|irnos|marcharnos|check.?out|leave|leaving).{0,30}(en vez de|en lugar de|instead of|rather than|au lieu de|later than).{0,15}\d{1,2}([:.]\d{2})?/i

export function esSolicitudLateCheckout(text: string): boolean {
  const t = text || ''
  return RE_LATE_CHECKOUT_KEYWORDS.test(t) || RE_LATE_CHECKOUT_COMPARACION.test(t)
}

// ¿Es una DESPEDIDA / agradecimiento de fin de estancia? (el huésped ya se ha ido, se está yendo, o
// agradece/valora la estancia). Es la señal de "mensaje de cortesía, siempre igual y de riesgo mínimo"
// que autoriza el auto-envío de una respuesta cálida sin pasar por Alberto.
//
// Distinto de `esCierre` (que exige que TODO el mensaje sea una fórmula corta tipo "gracias"/"ok"):
// aquí basta con que el mensaje CONTENGA una señal clara de despedida o valoración positiva de la
// estancia, aunque lleve más texto ("ya hemos dejado el Dúplex", "muchas gracias por todo, ha sido
// genial"). Precisión > cobertura a propósito: un falso negativo solo hace que el mensaje se PROPONGA
// (comportamiento actual, sin daño); y las guardas de seguridad (esSensible / sentimiento negativo /
// guardrail / escalado IA) siguen bloqueando cualquier auto-envío aunque el detector se pase.
const RE_DESPEDIDA = new RegExp([
  // ES — el huésped ya ha salido / se va del alojamiento (pasado o "ya + presente")
  '(ya\\s+)?(nos\\s+)?hemos\\s+(dejad[oa]s?|salido|ido|marchad[oa]s?|abandonad[oa]s?)',
  'ya\\s+(nos\\s+)?(dejamos|salimos|marchamos|vamos|fuimos)\\b',
  'ya\\s+nos\\s+(vamos|fuimos|marchamos|hemos ido)\\b',
  'acab(?:amos|o)\\s+de\\s+(dejar|salir|marchar|irnos|irme|abandonar)',
  // ES — agradecimiento / valoración de la estancia
  'gracias\\s+por\\s+todo',
  'ha\\s+sido\\s+(un placer|genial|estupend|perfect|maravillos|incre[ií]ble|fant[aá]stic|una experiencia)',
  'todo\\s+(ha\\s+sido\\s+|estuvo\\s+|fue\\s+)?(perfect|genial|estupend|fenomenal|de lujo|maravillos|muy bien)',
  '(nos|me)\\s+ha\\s+encantado',
  'lo\\s+(hemos|he)\\s+pasado\\s+(genial|muy bien|de maravilla|fenomenal)',
  'encantad[oa]s?\\s+con\\s+(la estancia|el (piso|apartamento|d[uú]plex))',
  // EN — leaving / checked out / thanks / positive stay
  "we('ve| have)?\\s*(already\\s+)?(left|checked\\s*out|departed)",
  "(we are|we're)\\s+(leaving|heading out|checking out)",
  'thank(s| you)?\\s+(so much\\s+|you\\s+)?for\\s+everything',
  'everything\\s+was\\s+(great|perfect|wonderful|amazing|lovely|fantastic)',
  'we\\s+had\\s+a\\s+(great|wonderful|lovely|fantastic|amazing|perfect)\\s+(stay|time)',
  '(we\\s+)?loved\\s+(our\\s+stay|the\\s+(apartment|flat|place|stay)|it)',
  // FR / DE / IT (ligero)
  'merci\\s+pour\\s+tout',
  'tout\\s+(était|etait)\\s+parfait',
  'nous\\s+(avons\\s+)?(quitté|quitte|partons|sommes partis)',
  'grazie\\s+(di|per)\\s+tutto',
  'tutto\\s+(era\\s+)?perfetto',
  'abbiamo\\s+lasciato',
  'danke\\s+für\\s+alles',
  'alles\\s+war\\s+(perfekt|toll|super|wunderbar)',
].join('|'), 'i')

export function esDespedida(text: string): boolean {
  return RE_DESPEDIDA.test(text || '')
}
