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

// ——— Línea 🔁 de los avisos de Telegram (lo pidió Alberto, 29/08/2026): el mensaje del huésped
// tiene que poder leerse SIEMPRE en español en los avisos del agente (auto-envíos y propuestas).

// ¿El texto da señal PROPIA de español? detectLang cae al fallback cuando el mensaje no puntúa
// en ningún idioma (un emoji, «Très bien», «Tack»), así que aquí el fallback es 'en': solo
// devuelve true si el español ganó de verdad, no por herencia del idioma de la reserva.
export function pareceEspanol(txt: string): boolean {
  return detectLang(txt, 'en') === 'es'
}

// ¿Hay que pedir traducción del mensaje del huésped? Se decide por el TEXTO, no solo por el
// idioma de respuesta: `ctx.lang` hereda el idioma de la reserva cuando el mensaje no da señal,
// y un «Très bien 👍» en una reserva en español se colaría sin traducir.
export function necesitaTraduccionPregunta(pregunta: string, lang: string): boolean {
  if (!(pregunta || '').trim()) return false
  return lang !== 'es' || !pareceEspanol(pregunta)
}

// Una «traducción» que vuelve igual que el original es que ya estaba en español → sin línea 🔁.
const normFrase = (s: string) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export function traduccionUtil(original: string, traduccion: string): string {
  if (!traduccion || normFrase(traduccion) === normFrase(original)) return ''
  return traduccion
}

// La línea 🔁 del aviso. `imprescindible` = el texto está seguro en otro idioma (lang ≠ es):
// si la traducción falló ahí, el hueco se DECLARA en vez de callarse — un aviso sin la línea se
// lee como «ya estaba en español», que es afirmar algo que no se ha podido comprobar.
export function lineaTraduccion(traduccion: string, imprescindible: boolean, esc: (s: string) => string): string {
  if (traduccion) return `\n<i>🔁 ${esc(traduccion)}</i>`
  return imprescindible ? '\n<i>🔁 (no he podido traducirlo al español)</i>' : ''
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

// ¿Este par pregunta→respuesta enseña un HECHO sobre la vivienda, o es solo cortesía/estilo?
// Un hecho va SIEMPRE al prompt (es permanente); una cortesía solo alimenta el tono y caduca.
// Distinguirlos es lo que evita que «las llaves se dejan en la mesa alta de la cocina» (lo único
// que Alberto llegó a enseñarle de verdad) acabe sepultado bajo veinte «gracias a ti»: en
// `mensajes_aprendizaje` iban al mismo montón y solo se inyectaban las 8 últimas filas del piso.
//
// Conservador a propósito en las DOS direcciones: pedimos que el huésped haya PREGUNTADO algo y que
// la respuesta tenga sustancia. Un falso negativo solo pierde un hecho (se puede volver a enseñar);
// un falso positivo mete ruido permanente en el prompt de todas las conversaciones futuras.
const RE_PREGUNTA = /[?¿]|d[oó]nde|c[oó]mo|cu[aá]l|cu[aá]nt|cu[aá]ndo|qu[eé]\b|hay\b|puedo|podemos|se puede|necesito|where|how|what|which|when|can i|can we|is there|are there|do you have|o[uù]\b|comment|combien|quand|peut|wo\b|wie\b|wann|kann|dove|come\b|quanto|posso/i
const RE_ACUSE = /^(ok|vale|perfecto|genial|estupendo|de acuerdo|entendido|anotado|tomo nota|noted|great|perfect|d\u0027accord|parfait)\b[\s.!,…]*$/i

export function esHechoDelPiso(pregunta: string, respuesta: string): boolean {
  const p = (pregunta || '').trim()
  const r = (respuesta || '').trim()
  if (r.length < 25) return false          // «de nada 😊» no enseña nada
  if (RE_ACUSE.test(r)) return false
  if (!p) return false
  if (esDespedida(p)) return false         // despedida/agradecimiento → es estilo, no hecho
  return RE_PREGUNTA.test(p)
}

// ── Minado del histórico (parte pura) ───────────────────────────────────────
export type MsgMin = { from: 'guest' | 'host'; text: string; automatico: boolean }
export type ParQA = { pregunta: string; respuesta: string }

// Empareja cada pregunta del huésped con la PRIMERA respuesta humana del anfitrión que viene
// después. Descarta los automáticos de Smoobu (confirmaciones, recordatorios: son plantillas, no
// conocimiento) y los pares que no enseñan nada (`esHechoDelPiso`).
export function paresPregRespuesta(msgs: MsgMin[]): ParQA[] {
  const out: ParQA[] = []
  let pendiente = ''
  for (const m of msgs || []) {
    if (!m || !m.text) continue
    if (m.from === 'guest') { pendiente = m.text; continue }
    if (m.automatico) continue          // plantilla del sistema: ni contesta ni interrumpe el par
    if (!pendiente) continue
    if (esHechoDelPiso(pendiente, m.text)) out.push({ pregunta: pendiente, respuesta: m.text })
    pendiente = ''
  }
  return out
}

// Los automáticos de Smoobu/Booking llevan ASUNTO; los mensajes escritos a mano, no.
export function esAutomatico(subject: string, text: string): boolean {
  if ((subject || '').trim() !== '') return true
  return /check.?in online|disponible para tu reserva|self.?check.?in|enregistrement en ligne/i.test(text || '')
}

// ── ¿Por qué escala? Hueco de la GUÍA vs control de calidad CAÍDO ───────────
//
// Los dos escalan igual y hasta ahora se contaban como lo mismo: un `motivo` que casara con
// /no cubre|no se pudo verificar/ pintaba «❓ Esto no lo encuentro en la guía» y anotaba un hueco.
// Pero «no se pudo verificar» es que el clasificador de calidad NO RESPONDIÓ (timeout o caída del
// proveedor): no dice nada sobre la guía. Tratarlo como hueco es convertir un «no lo he podido
// mirar» en un «no lo tengo», que es justo lo que la regla del monorepo prohíbe — y encima ensucia
// `mensajes_guia_gaps` con preguntas que sí estaban cubiertas (caso real 02/09/2026, reserva
// 153122091: «Haré el check in por aquí» se anotó como hueco de House Sevillana con el control caído).
export type EscaladoMin = {
  needs_human?: boolean
  apoyada_en_fuente?: boolean
  categoria?: string
  sentimiento?: string
  motivo?: string
}
export type TipoHueco = 'guia' | 'control_caido' | 'ninguno'

export function tipoHueco(dec: EscaladoMin | null | undefined): TipoHueco {
  if (!dec || !dec.needs_human || dec.apoyada_en_fuente) return 'ninguno'
  // Lo sensible y las recomendaciones escalan por política o por diseño, no por ignorancia.
  if (dec.categoria === 'recomendacion' || dec.sentimiento === 'negativo') return 'ninguno'
  const m = dec.motivo || ''
  // El `motivo` puede venir concatenado (guardrail del importe + escalado). Si en algún punto hubo
  // algo que NO se pudo comprobar, gana eso: no se afirma un hueco que no se ha llegado a ver.
  if (/no se pudo verificar/.test(m)) return 'control_caido'
  if (/no cubre/.test(m)) return 'guia'
  // Consulta a internet (`consulta-web.ts`): el asunto SIGUE siendo un hueco de la guía aunque el
  // dato se haya encontrado fuera. Si esto no contara como hueco, lo que Alberto responda no se
  // guardaría como hecho del piso y el agente pagaría la misma búsqueda cada vez que se lo
  // pregunten. Que la búsqueda fallara no cambia el diagnóstico: el hueco es el mismo.
  if (/no est[áa] en la gu[ií]a del piso/.test(m)) return 'guia'
  return 'ninguno'
}

// ── Dato personal dentro de un HECHO del piso ──────────────────────────────
//
// Un hecho se inyecta en el prompt de TODAS las conversaciones futuras de ese piso, así que un
// teléfono, un IBAN o un email colados ahí dejan de ser un dato de una reserva y pasan a ser algo
// que el agente puede repetirle a cualquier huésped. Caso real (31/08/2026, `mensajes_hechos` id=3):
// se guardó como hecho permanente de House Sevillana la respuesta entera de Alberto a Raquel,
// con su móvil de Bizum dentro. Esta guarda es la última red antes de escribir.
const RE_TELEFONO = /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){9,}/
const RE_IBAN = /\b[A-Z]{2}\d{2}[\s]?(?:[A-Z0-9]{4}[\s]?){3,7}[A-Z0-9]{1,4}\b/
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/

export function contieneDatoPersonal(txt: string): boolean {
  const t = txt || ''
  return RE_EMAIL.test(t) || RE_IBAN.test(t) || RE_TELEFONO.test(t)
}

// ── Destilado del HECHO (parte pura) ───────────────────────────────────────
//
// Lo que se guardaba como «hecho del piso» era la RESPUESTA ENTERA de Alberto, carta incluida.
// Medido el 02/09/2026 en `mensajes_hechos`: «¡Hola, Claudio! Gracias por escribirnos…», «Hi Maria,
// I can confirm that your reservation for Luxury Busto (16 Oct 2026 – 18 Oct 2026)…», y un tercero
// con el móvil de Bizum. Eso no es conocimiento del piso: es correspondencia con UN huésped, y va al
// prompt de TODAS las conversaciones futuras como si fuera la guía. Tres daños a la vez — ruido, un
// dato personal repetible a cualquiera, y un estado de UN DÍA («nuestro parking está ocupado»)
// convertido en característica permanente de la vivienda.
//
// Por eso el hecho se DESTILA (una frase, sin nombres ni datos de una reserva) y esta función decide
// si lo destilado sirve. Conservadora a propósito: ante la duda no se guarda nada. Un hecho perdido
// se vuelve a enseñar; un hecho falso o personal se le cuenta a todos los huéspedes que vengan.
const RE_NADA = /^(nada|ninguno|ninguna|none|n\/a|-|—)\b/i
const MIN_HECHO = 15
const MAX_HECHO = 400

export function interpretarDestilado(bruto: string): string {
  const t = (bruto || '').trim().replace(/^["'«»]+|["'«»]+$/g, '').trim()
  if (!t || RE_NADA.test(t)) return ''
  if (t.length < MIN_HECHO || t.length > MAX_HECHO) return ''
  // Varias líneas = el modelo se puso a redactar en vez de destilar; una carta no es un hecho.
  if (t.split('\n').filter(l => l.trim()).length > 2) return ''
  if (contieneDatoPersonal(t)) return ''
  return t
}
