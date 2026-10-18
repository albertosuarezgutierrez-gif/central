// lib/sivra/agente-huesped/cambio-horario.ts — entrada anticipada, salida tardía y maletas. PURO.
//
// Origen (03/10/2026): un huésped de House Sevillana pidió dejar el equipaje / quedarse hasta las
// 15:00 el día de salida. Se clasificó «equipaje», salió AUTOMÁTICO y prometió un «coste según la
// hora» que no existe. Decisiones de Alberto:
//  - Cualquier petición de cambio de horario (entrar antes, salir más tarde, guardar maletas antes de
//    la entrada o después de la salida) NO se auto-envía NUNCA: siempre propuesta por Telegram.
//  - Es GRATIS: ningún texto de estos mensajes menciona coste, precio ni suplemento.
//  - Estos mensajes NO piden reseña (Booking/Airbnb prohíben vincular un favor a una reseña).
//  - El semáforo (`evaluarCambioHorario`) dice si el piso lo permite; la decisión es de Alberto.
//
// Sin BD, sin red, sin `@/`: el tipo de datos que decide si un huésped recibe una promesa tiene que
// poder probarse sin levantar nada (`cambio-horario.test.ts`).
import { CONSIGNA_POR_ZONA, zonaDePiso } from './equipaje.ts'

export type TipoCambio = 'entrada' | 'salida'
export type Semaforo = 'rojo' | 'verde' | 'amarillo'

/** Fechas YYYY-MM-DD. `null` = NO SE SABE (≠ «no hay»): el semáforo nunca será verde con un null. */
export type ReservaHorario = {
  reservationId: string | null
  checkIn: string | null
  checkOut: string | null
  huesped?: string | null
}

export type Colindante = ReservaHorario & { relacion: 'entra_mismo_dia' | 'sale_mismo_dia' | 'duerme_antes' }

export type EvaluacionHorario = { semaforo: Semaforo; motivo: string; colindante?: Colindante }

const FECHA = /^\d{4}-\d{2}-\d{2}$/
// Además del formato, la fecha debe existir en el calendario ("2026-13-45" haría lanzar a toISOString).
const fechaOk = (f: string | null | undefined): f is string => {
  if (typeof f !== 'string' || !FECHA.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const fmt = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`
const quien = (r: ReservaHorario) => `${r.huesped ? r.huesped + ' · ' : ''}reserva ${r.reservationId ?? '?'}`

/**
 * ¿Lo permite el calendario del piso?
 *  - salida tardía + otra entrada el mismo día del check-out → rojo
 *  - salida tardía sin entrada ese día → amarillo (hace falta el OK de la limpieza, nunca verde)
 *  - entrada anticipada + otra reserva SALE ese día → rojo (solo se pueden dejar las maletas)
 *  - entrada anticipada con la noche anterior vacía → verde (piso limpio de antes)
 *  - cualquier dato desconocido (lista o fechas null) → amarillo, jamás verde
 * `reservasMismaPropiedad` = reservas del MISMO piso, sin canceladas y deduplicadas por reservationId
 * (la propia reserva puede venir incluida: se descarta por id). `null` = no se pudo leer.
 */
export function evaluarCambioHorario(p: {
  tipo: TipoCambio
  reserva: ReservaHorario
  reservasMismaPropiedad: ReservaHorario[] | null
}): EvaluacionHorario {
  const { tipo, reserva, reservasMismaPropiedad } = p
  const desconocido = (motivo: string): EvaluacionHorario => ({ semaforo: 'amarillo', motivo })
  const SIN_DATO = 'No he podido comprobar la ocupación del piso (dato desconocido): confírmalo antes de prometer nada.'

  const fechaClave = tipo === 'salida' ? reserva.checkOut : reserva.checkIn
  if (!fechaOk(fechaClave)) return desconocido(SIN_DATO)
  if (reservasMismaPropiedad === null) return desconocido(SIN_DATO)

  const otras = reservasMismaPropiedad.filter(r =>
    !(r.reservationId != null && reserva.reservationId != null && String(r.reservationId) === String(reserva.reservationId)))

  let hayDesconocida = false
  if (tipo === 'salida') {
    for (const r of otras) {
      if (!fechaOk(r.checkIn)) { hayDesconocida = true; continue }
      if (r.checkIn === fechaClave) {
        return {
          semaforo: 'rojo',
          motivo: `Entra otra reserva el mismo día de la salida (${fmt(fechaClave)}): no hay margen para salir más tarde.`,
          colindante: { ...r, relacion: 'entra_mismo_dia' },
        }
      }
    }
    if (hayDesconocida) return desconocido(SIN_DATO)
    return { semaforo: 'amarillo', motivo: `Ese día (${fmt(fechaClave)}) no entra nadie según el calendario, pero salir más tarde requiere el OK de la limpieza.` }
  }

  // tipo === 'entrada'
  const vispera = diaAnterior(fechaClave)
  let duerme: ReservaHorario | null = null
  for (const r of otras) {
    if (!fechaOk(r.checkIn) || !fechaOk(r.checkOut)) { hayDesconocida = true; continue }
    if (r.checkOut === fechaClave && r.checkIn < fechaClave) {
      return {
        semaforo: 'rojo',
        motivo: `Otra reserva sale ese mismo día (${fmt(fechaClave)}): el piso sigue ocupado y hay que limpiarlo — solo se podrían dejar las maletas.`,
        colindante: { ...r, relacion: 'sale_mismo_dia' },
      }
    }
    if (r.checkIn <= vispera && r.checkOut > fechaClave) duerme = r // se solapa con la llegada: dato raro
    else if (r.checkIn <= vispera && r.checkOut > vispera && r.checkOut !== fechaClave) duerme = r
  }
  if (duerme) return { semaforo: 'amarillo', motivo: `Otra reserva duerme la noche anterior y no sale ese día (${quien(duerme)}): revisa el calendario antes de prometer nada.`, colindante: { ...duerme, relacion: 'duerme_antes' } }
  if (hayDesconocida) return desconocido(SIN_DATO)
  return { semaforo: 'verde', motivo: `La noche anterior (${fmt(vispera)}) está vacía: el piso está limpio de antes.` }
}

// ───────────────────────────── DETECCIÓN (ES / EN / IT / FR / DE) ─────────────────────────────

// Hora explícita en inglés («3pm», «15:00», «noon»). Una cifra suelta («until 5 October») NO cuenta.
const HORA_EN = String.raw`\d{1,2}(?::\d{2}|\s*(?:am|pm|a\.m|p\.m|h\b|uhr|o.?clock))|noon|midday`

const RE_ENTRADA = new RegExp([
  'early\\s*check.?in', 'check.?in\\s*(earlier|early|anticipad[oa]|anticipato|plus\\s*t[oô]t)',
  '(enter|get\\s*in)\\s*(a\\s*bit\\s*|a\\s*little\\s*)?(earlier|early)',
  // «arrive early» a secas es ambiguo (llegar temprano ≠ pedir entrar antes): exige una hora o contexto de check-in.
  `(arrive|arrival|come)\\s*(a\\s*bit\\s*|a\\s*little\\s*)?(earlier|early)(?=[^.?!]{0,60}(${HORA_EN}|check.?in|room|apartment|flat|access))`,
  'entrada\\s*anticipad', 'entrar\\s*(un\\s*poco\\s*)?antes', 'adelantar\\s*(la\\s*)?(entrada|llegada|check)',
  '(llegar|llegamos)\\s*(un\\s*poco\\s*)?antes.{0,40}(entrar|check|dejar|equipaje|maleta)',
  'arriv[eé]e\\s*anticip', 'arriver\\s*plus\\s*t[oô]t', 'entrer\\s*plus\\s*t[oô]t', 'enregistrement\\s*anticip',
  'fr(ü|ue)her\\s*(einchecken|anreisen|ankommen|rein)', 'fr(ü|ue)hes?\\s*check.?in',
  'entrare\\s*prima', 'arrivare\\s*prima', 'entrata\\s*anticipata', 'anticipare\\s*(il\\s*)?check',
].join('|'), 'iu')

const RE_SALIDA = new RegExp([
  'late\\s*check.?out', 'later\\s*check.?out', 'late\\s*departure', 'salida\\s*tard[ií]a',
  '(salir|irnos|marcharnos|dejar\\s*(el\\s*)?(apartamento|piso|alojamiento))\\s*(un\\s*poco\\s*)?(m[aá]s\\s*tarde|despu[eé]s)',
  'quedar(nos)?\\s*(un\\s*poco\\s*)?m[aá]s\\s*(de\\s*)?(tiempo|tarde|rato)', 'quedar(nos)?\\s*hasta\\s*las?\\s*\\d{1,2}', 'quedar(nos)?\\s*hasta\\s*\\d{1,2}\\s*(:|h\\b|horas|pm|am|de\\s*la)', '(ampliar|retrasar|alargar)\\s*(la\\s*)?(salida|estancia)',
  '(leave|check\\s*out|checkout|stay)\\s*(a\\s*bit\\s*|a\\s*little\\s*)?(later|longer|past)',
  `(leave|check\\s*out|checkout|stay)\\s*(until|till)\\s*(${HORA_EN})`, 'd[eé]part\\s*tardif', 'partir\\s*plus\\s*tard', 'check.?out\\s*(plus\\s*tard|tardif)',
  'rester\\s*plus\\s*longtemps', 'rester\\s*jusqu.{0,3}\\d', 'prolonger\\s*(le\\s*)?s[eé]jour',
  'sp[aä]ter(es)?\\s*(aus)?check.?out', 'sp[aä]ter\\s*(abreisen|ausziehen|auschecken)', 'l[aä]nger\\s*bleiben',
  'sp[aä]te(r|s)?\\s*abreise', 'check.?out\\s*(tardivo|posticipato)', 'partire\\s*pi[uù]\\s*tardi',
  'uscire\\s*pi[uù]\\s*tardi', 'restare\\s*pi[uù]\\s*a\\s*lungo', 'restare\\s*fino\\s*alle?\\s*\\d', 'posticipare\\s*(il\\s*)?(check.?out|partenza)',
].join('|'), 'iu')

// «hasta las 15 … el día de salida»: una hora límite junto a una referencia a la salida.
const RE_HASTA_HORA = /(hasta|until|till|bis|jusqu|fino\s*a|by)\s*(las?|les|l'|alle|ore|um)?\s*\d{1,2}/iu
const RE_CTX_SALIDA = /salida|check.?out|d[ií]a\s*que\s*(nos\s*)?(vamos|salimos|nos\s*fuimos)|departure|abreise|d[eé]part|partenza|ultimo\s*d[ií]a/iu

// Maletas SOLO con un verbo de dejar/guardar cerca («¿hay ascensor para las maletas?» NO es una petición).
const VERBO_MALETAS = String.raw`dej\p{L}*|guard\p{L}*|deposit\p{L}*|d[eé]pos\p{L}*|laiss\p{L}*|lasci\p{L}*|lass\p{L}*|abstell\p{L}*|aufbewahr\p{L}*|leav\p{L}*|left|keep\p{L}*|stor\p{L}*|drop\p{L}*`
const NOMBRE_MALETAS = String.raw`maleta\p{L}*|equipaje\p{L}*|luggage|baggage|bags?|suitcase\p{L}*|valig\p{L}*|bagagl\p{L}*|bagage\p{L}*|valise\p{L}*|gep[aä]ck|koffer\p{L}*`
const RE_EQUIPAJE = new RegExp(
  `\\b(?:${VERBO_MALETAS})\\b[^.?!]{0,40}?\\b(?:${NOMBRE_MALETAS})\\b|\\b(?:${NOMBRE_MALETAS})\\b[^.?!]{0,40}?\\b(?:${VERBO_MALETAS})\\b`, 'iu')

// ── ANUNCIO de hora (sin pedirla) y ACEPTACIÓN en la respuesta (Maria, 18/10/2026) ──
// «Saldremos a las 12:00» no lleva ninguna palabra de petición («tarde», «quedarnos», «late checkout»),
// así que nada lo detectaba: el bot contestó «tomo nota de que saldréis a las 12:00» y autorizó una salida
// tardía por su cuenta. Un huésped que ANUNCIA una hora posterior a la oficial está pidiendo un permiso.
export const HORA_SALIDA_OFICIAL_DEFECTO = '11:00' // todos los pisos (`horarios.ts`); solo si no llega la de la reserva
export type HorarioOficial = { checkIn?: string | null; checkOut?: string | null }

const minutos = (hhmm?: string | null): number | null => {
  const m = (hhmm || '').match(/^(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null
}
// Verbos de SALIR / quedarse / dejar el piso (ES·EN·IT·FR·DE). Amplio a propósito: solo decide qué frases se
// miran; un falso positivo cuesta una revisión por Telegram, un falso negativo una autorización que es de Alberto.
const VERBO_SALIDA = /\b(sal(?:go|gamos|gan?|gas|ir\p{L}*|[ií]\p{L}*|dr\p{L}*|e|en|es|ed)|nos\s+(?:vamos|iremos|marchamos|marcharemos|vais|vayamos)|os\s+(?:vais|ir[eé]is|marcha[ií]s|qued\p{L}*)|irnos|iros|marcha\p{L}*|vay\p{L}*|queda\p{L}*|dej\p{L}*\s+(?:(?:el|la|los|las)\s+)?(?:piso|apartamento|alojamiento|casa|habitaci\p{L}+|llaves?)|abandon\p{L}*|desaloj\p{L}*|entreg\p{L}*|liber\p{L}*|check.?out|check\s+out|leav\p{L}*|left|stay\p{L}*|vacat\p{L}*|depart\p{L}*|partiamo|partiremo|partir(?!\s+de\b)\p{L}*|uscir\p{L}*|usciamo|rest(?:are|iamo)|lasci\p{L}*|abreis\p{L}*|reis\p{L}*|fahr\p{L}*|abfahr\p{L}*|auscheck\p{L}*|verlass\p{L}*|bleib\p{L}*|part(?:ons|irons|ez)|quitt\p{L}*|d[eé]part)\b/iu
// Verbos de ENTRAR / llegar / acceder (infinitivos y conjugaciones).
const VERBO_ENTRADA = /\b(entr\p{L}*|acce[sd]\p{L}*|lleg\p{L}*|instal\p{L}*|ingres\p{L}*|check.?in|check\s+in|arriv\p{L}*|enter\p{L}*|get\s+in|come\s+in|ankomm\p{L}*|anreis\p{L}*|einchecken|arrivare|arrivo)\b/iu

const PALABRA_MEDIODIA = /\b(?:mediod[ií]a|noon|midday|mezzogiorno|midi|mittag)\b/giu
const SUFIJO_TARDE = /^\s*(?:de\s+la\s+(?:tarde|noche)|del?\s+(?:mediod[ií]a|la\s+tarde|la\s+noche)|della?\s+(?:sera|pomeriggio|notte)|du\s+(?:soir|apr[eè]s.midi)|de\s+l.apr[eè]s.midi|nachmittags|abends|in\s+the\s+(?:afternoon|evening)|at\s+night)/iu
const SUFIJO_MANANA = /^\s*(?:de\s+la\s+ma[ñn]ana|della\s+mattina|du\s+matin|morgens|in\s+the\s+morning)/iu
const CTX_HORA_AMPLIO = /(?:\b(?:a|hasta|until|till|by|at|around|about|sobre|um|bis|gegen|alle|verso|vers|desde|from|ab|dopo|[àa]|jusqu['’]?[àa])\s*(?:las?|les|l['’]|ore|the)?|\b(?:con|por|para|antes\s+de|despu[eé]s\s+de|pasadas|en\s+torno\s+a|no\s+later\s+than)\s+(?:las?|les))\s*$/iu
const SIGUE_NOMBRE = /^\s*(?:personas?|adultos?|ni[ñn]os?|maletas?|noches?|d[ií]as?|hu[eé]spedes|people|guests?|adults?|nights?|bags?|days?|persone|notti|ospiti|euros?|€|%)/iu

/**
 * TODAS las horas (en minutos) de un texto: «12:00», «13h», «1 pm», «a la 1», «12 del mediodía», y las palabras
 * mediodía/noon/midday/mezzogiorno/midi = 12:00. Rango 0-23:59 (sin tope superior). Una cifra suelta
 * («2 maletas») solo cuenta con marca (minutos/sufijo) o con preposición de hora delante.
 * `tardeSiAmbiguo`: «a la 1»/«a las 3» sin am/pm se leen como 13-15 h (salida: el caso conservador).
 */
export function horasEnTexto(texto: string, tardeSiAmbiguo = false): number[] {
  const t = texto || ''
  const out: number[] = []
  for (const w of t.matchAll(PALABRA_MEDIODIA)) { void w; out.push(12 * 60) }
  const re = /(?<![\d/.:])(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?(?:\s*(a\.?m\.?|p\.?m\.?|uhr|horas?|hrs?|h(?![a-zà-ÿ])))?(?!\d)/giu
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    let h = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const suf = (m[3] || '').toLowerCase()
    if (isNaN(h) || h > 23 || min > 59) continue
    const resto = t.slice(m.index + m[0].length)
    const marcada = !!m[2] || !!suf
    if (!marcada && (!CTX_HORA_AMPLIO.test(t.slice(Math.max(0, m.index - 22), m.index)) || SIGUE_NOMBRE.test(resto))) continue
    const pm = suf.startsWith('p') || SUFIJO_TARDE.test(resto)
    const am = suf.startsWith('a') || SUFIJO_MANANA.test(resto)
    if (pm && h < 12) h += 12
    else if (am && h === 12) h = 0
    else if (!pm && !am && tardeSiAmbiguo && h >= 1 && h <= 3) h += 12
    out.push(h * 60 + min)
  }
  return out
}

// Un punto entre dos cifras («11.30») es una hora, no el fin de una frase.
const frases = (texto: string) => (texto || '').split(/(?<=[?!\n])|(?<=\D\.)|(?<=\d\.)(?!\d)/u)
// Cláusulas dentro de una frase (coma/punto y coma fuera de cifras, «y», «and»…): «la entrada es a las 15:00 y podéis salir a las 15:00».
const clausulas = (frase: string) => frase.split(/;|(?<!\d),|,(?!\d)|\s+(?:y|e|and|und|et)\s+/iu)

/** Horas de las frases del texto que contienen `verbo` (TODAS las de cada frase, no solo la primera). */
function horasPorFrase(texto: string, verbo: RegExp, tardeSiAmbiguo: boolean): number[] {
  const out: number[] = []
  for (const frase of frases(texto)) if (verbo.test(frase)) out.push(...horasEnTexto(frase, tardeSiAmbiguo))
  return out
}

/** ¿El huésped ANUNCIA una salida posterior a la hora oficial («saldremos a las 12:00»)? */
export function anunciaSalidaTardia(texto: string, checkOut?: string | null): boolean {
  const lim = minutos(checkOut) ?? minutos(HORA_SALIDA_OFICIAL_DEFECTO)!
  return horasPorFrase(texto, VERBO_SALIDA, true).some(h => h > lim)
}

/**
 * ¿El BORRADOR del bot acepta/confirma una hora fuera de la oficial («tomo nota de que saldréis a las
 * 12:00»)? Sin depender de un verbo: SALIDA = cualquier hora posterior al check-out que no sea la de entrada
 * oficial (las respuestas citan «la entrada es a las 15:00»); además, la detección por verbo de salida.
 * ENTRADA = hora anterior al check-in junto a un verbo de entrar (solo si se conoce el check-in).
 * Conservador: un falso positivo solo manda el borrador a Telegram. Red de seguridad si el modelo se salta el prompt.
 */
export function respuestaConfirmaHorario(reply: string, horario: HorarioOficial = {}): 'salida' | 'entrada' | null {
  const lim = minutos(horario.checkOut) ?? minutos(HORA_SALIDA_OFICIAL_DEFECTO)!
  const ini = minutos(horario.checkIn)
  const exenta = ini ?? 15 * 60 // sin check-in conocido se asume 15:00; la rama por verbo cubre un «hasta las 15:00»
  for (const frase of frases(reply)) for (const cl of clausulas(frase)) {
    // Cláusula PURA de entrada («la entrada es a las 15:00»): solo ahí la hora de check-in está exenta, y las
    // horas anteriores al check-in son asunto de ENTRADA (se miran abajo). Con un verbo de salir NUNCA hay exención.
    const entradaPura = VERBO_ENTRADA.test(cl) && !VERBO_SALIDA.test(cl)
    if (horasEnTexto(cl, true).some(h => h > lim && !(entradaPura && (h === exenta || (ini !== null && h < ini))))) return 'salida'
  }
  if (ini !== null) {
    for (const frase of frases(reply)) for (const cl of clausulas(frase)) {
      if (!VERBO_ENTRADA.test(cl) || VERBO_SALIDA.test(cl)) continue // «la entrada es a las 15:00 y la salida a las 11:00»
      if (horasEnTexto(cl, false).some(h => h < ini)) return 'entrada'
    }
  }
  return null
}

export type PeticionHorario = { tipo: 'entrada' | 'salida' | 'equipaje' }

/**
 * ¿Es una petición de cambio de horario o de guardar maletas? Conservador a propósito: un falso
 * positivo solo convierte un mensaje en PROPUESTA por Telegram (sin daño); un falso negativo deja salir
 * solo una promesa sobre el horario del piso. `categoria` es la de `detectCategory`/`dec.categoria`.
 */
export function peticionCambioHorario(texto: string, categoria?: string | null, horario: HorarioOficial = {}): PeticionHorario | null {
  const t = texto || ''
  if (categoria === 'early_checkin') return { tipo: 'entrada' }
  if (categoria === 'late_checkout') return { tipo: 'salida' }
  if (RE_ENTRADA.test(t)) return { tipo: 'entrada' }
  if (RE_SALIDA.test(t)) return { tipo: 'salida' }
  if (RE_HASTA_HORA.test(t) && RE_CTX_SALIDA.test(t)) return { tipo: 'salida' }
  if (anunciaSalidaTardia(t, horario.checkOut)) return { tipo: 'salida' }
  if (categoria === 'equipaje' || RE_EQUIPAJE.test(t)) return { tipo: 'equipaje' }
  return null
}

export const mencionaMaletas = (texto: string): boolean => RE_EQUIPAJE.test(texto || '')

const RE_ANTES_ENTRADA = /antes\s*(de(l)?\s*)?(la\s*)?(check.?in|entrada|llegada)|before\s*(the\s*)?check.?in|vor\s*dem\s*check.?in|avant\s*(le\s*)?check.?in|prima\s*del\s*check.?in/iu
const RE_DESPUES_SALIDA = /despu[eé]s\s*(de(l)?\s*)?(la\s*)?(check.?out|salida)|after\s*(the\s*)?check.?out|d[ií]a\s*(de\s*(la\s*)?)?salida|day\s*of\s*(check.?out|departure)|nach\s*dem\s*check.?out|apr[eè]s\s*(le\s*)?check.?out|dopo\s*il\s*check.?out/iu

/**
 * «equipaje» no dice si es antes de entrar o después de salir: lo dice el texto, y si no, el momento
 * (`hoy` ≤ llegada → antes de entrar; si no → el día de salida). Fechas YYYY-MM-DD.
 */
export function resolverTipo(pet: PeticionHorario, texto: string, o: { hoy: string; checkIn: string | null }): TipoCambio {
  if (pet.tipo !== 'equipaje') return pet.tipo
  if (RE_ANTES_ENTRADA.test(texto || '')) return 'entrada'
  if (RE_DESPUES_SALIDA.test(texto || '')) return 'salida'
  return fechaOk(o.checkIn) && o.hoy <= o.checkIn ? 'entrada' : 'salida'
}

// ───────────────────────────── HORA PEDIDA Y CONTRAOFERTA ─────────────────────────────

const CONTEXTO_HORA = /(a\s*las?|a\s*la|hasta(\s*las?)?|until|till|by|at|around|about|sobre(\s*las?)?|um|bis|gegen|alle(\s*ore)?|fino\s*alle|verso|[àa]|jusqu['’]?[àa]|vers|desde(\s*las?)?|from|ab|dopo\s*le)\s*$/iu

/** Primera hora pedida («a las 15:00», «until 3pm», «um 15 Uhr»…) como 'HH:MM', o null. Rango 06–23. */
export function extraerHoraPedida(texto: string): string | null {
  const t = texto || ''
  const re = /(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|uhr|horas?|hrs?|h)?(?![\d])/giu
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const ini = m.index
    if (ini > 0 && /[\d/]/.test(t[ini - 1])) continue // parte de una fecha o de un número mayor
    let h = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const suf = (m[3] || '').toLowerCase()
    if (isNaN(h) || h > 24 || min > 59) continue
    const conMarca = !!m[2] || !!suf || CONTEXTO_HORA.test(t.slice(Math.max(0, ini - 14), ini))
    if (!conMarca) continue // «2 personas», «3 maletas»: no es una hora
    if (suf.startsWith('p') && h < 12) h += 12
    if (suf.startsWith('a') && h === 12) h = 0
    if (!m[2] && !suf && h < 8) continue // «hasta las 3» sin am/pm: ambiguo → no se adivina
    if (h < 6 || h > 23) continue
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return null
}

/**
 * Contraoferta (hora entera, 13 o 14) para el botón `🕐`. Salida: 14 si pide 15:00 o más, 13 si no.
 * Entrada: 13 si pide a las 12 o antes, 14 si no. null si coincide con lo que ya pidió (botón redundante).
 */
export function contraoferta(tipo: TipoCambio, horaPedida: string | null): number | null {
  const pedida = horaPedida ? parseInt(horaPedida.slice(0, 2), 10) * 60 + parseInt(horaPedida.slice(3, 5), 10) : null
  const hh = tipo === 'salida'
    ? (pedida !== null && pedida >= 15 * 60 ? 14 : 13)
    : (pedida === null || pedida <= 12 * 60 ? 13 : 14)
  return pedida !== null && pedida === hh * 60 ? null : hh
}

// ───────────────────────────── BOTONES (callback_data ≤ 64 bytes) ─────────────────────────────

export type BotonCH = { texto: string; callback: string }
export const LIMITE_CALLBACK = 64

/** Telegram rechaza un `callback_data` > 64 BYTES (y el aviso entero falla): se comprueba al construir. */
export function asegurarCallback(cb: string): string {
  if (Buffer.byteLength(cb, 'utf8') > LIMITE_CALLBACK) throw new Error(`callback_data > ${LIMITE_CALLBACK} bytes: ${cb}`)
  return cb
}

/**
 * Botones de la propuesta. Prefijo `hsp_` (mismo emisor autorizado que el resto): `hsp_chsi:<id>:<HHMM>`,
 * `hsp_chhasta:<id>:<HH>`, `hsp_chno:<id>`, `hsp_chlimp:<id>`. En ROJO no se ofrecen los «sí»: el piso
 * no lo permite y el «no» ya va redactado (si Alberto quiere hacer una excepción, ✏️ Modificar).
 */
export function botonesCambioHorario(p: {
  bookingId: string; tipo: TipoCambio; semaforo: Semaforo; horaPedida: string | null
}): BotonCH[][] {
  const filas: BotonCH[][] = []
  if (p.semaforo !== 'rojo') {
    const fila: BotonCH[] = []
    if (p.horaPedida) fila.push({ texto: `✅ Sí, ${p.horaPedida}`, callback: `hsp_chsi:${p.bookingId}:${p.horaPedida.replace(':', '')}` })
    const c = contraoferta(p.tipo, p.horaPedida)
    if (c !== null) fila.push({ texto: p.tipo === 'salida' ? `🕐 Sí, hasta ${c}` : `🕐 Sí, desde ${c}`, callback: `hsp_chhasta:${p.bookingId}:${c}` })
    if (fila.length) filas.push(fila)
  }
  filas.push([{ texto: '❌ No', callback: `hsp_chno:${p.bookingId}` }])
  filas.push([{ texto: '🧹 Consultar limpieza', callback: `hsp_chlimp:${p.bookingId}` }])
  for (const b of filas.flat()) asegurarCallback(b.callback)
  return filas
}

/** 'HHMM' (callback) → 'HH:MM'; null si no es una hora válida. */
export function horaDeCallback(arg: string | undefined): string | null {
  const m = (arg || '').match(/^(\d{2})(\d{2})$/) || (arg || '').match(/^(\d{1,2})()$/)
  if (!m) return null
  const h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0
  if (h < 0 || h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// ───────────────────────────── TEXTOS (español; se traducen al idioma del huésped) ─────────────────────────────
// 🚨 Sin coste / precio / suplemento / «gratis» y SIN petición de reseña — lo vigila el test.

const saludo = (nombre?: string | null) => {
  const n = (nombre || '').trim().split(/\s+/)[0]
  return n ? `Hola ${n}:` : 'Hola:'
}

export function textoAceptacion(p: { tipo: TipoCambio; hora: string; nombre?: string | null }): string {
  return p.tipo === 'salida'
    ? `${saludo(p.nombre)}\n\n¡Perfecto! Podéis quedaros en el apartamento hasta las ${p.hora} el día de la salida. Cuando os marchéis, escribidnos por aquí para que coordinemos la limpieza. ¡Gracias!`
    : `${saludo(p.nombre)}\n\n¡Perfecto! Podéis entrar a partir de las ${p.hora} el día de la llegada. Si cambia vuestra hora de llegada, avisadnos por aquí. ¡Gracias!`
}

/** Consignas de la zona del piso (de `equipaje.ts`); vacío = piso sin zona → texto genérico. */
export function consignasDePiso(propertyId: string): string[] {
  const zona = zonaDePiso(propertyId)
  return zona ? CONSIGNA_POR_ZONA[zona].map(c => `- ${c.nombre} — ${c.web} (${c.nota})`) : []
}

export function textoNegativa(p: {
  tipo: TipoCambio; semaforo: Semaforo; propertyId: string; nombre?: string | null; ofrecerMaletas?: boolean
}): string {
  const motivo = p.tipo === 'salida'
    ? (p.semaforo === 'rojo' ? ' porque ese día entra otro huésped y tenemos que preparar el apartamento' : '')
    : (p.semaforo === 'rojo' ? ' porque el apartamento sigue ocupado hasta la salida de los huéspedes anteriores y tenemos que prepararlo' : '')
  const accion = p.tipo === 'salida' ? 'ampliar la hora de salida' : 'adelantar la hora de entrada'
  let t = `${saludo(p.nombre)}\n\nGracias por escribirnos. Lamentablemente no podemos ${accion}${motivo}.`
  if (p.ofrecerMaletas ?? p.semaforo === 'rojo') {
    const lista = consignasDePiso(p.propertyId)
    t += lista.length
      ? ` Si queréis, podéis dejar el equipaje en una consigna cercana:\n${lista.join('\n')}`
      : ' En la zona hay consignas de equipaje; si os interesa, os facilitamos las opciones por aquí.'
  }
  return t
}

/** Instrucción para la tarea de limpieza y fecha en la que se crea. */
export function tareaLimpieza(p: { tipo: TipoCambio; hora: string; checkIn: string | null; checkOut: string | null; huesped?: string | null; reservationId: string }): { fecha: string | null; texto: string } {
  const quien = `${p.huesped ? p.huesped + ', ' : ''}reserva ${p.reservationId}`
  return p.tipo === 'salida'
    ? { fecha: p.checkOut, texto: `Salida tardía ${p.hora} — limpiar después (${quien})` }
    : { fecha: p.checkIn, texto: `Entrada anticipada ${p.hora} — piso listo antes (${quien})` }
}

/** Bloque para el prompt de la IA en estas peticiones (la IA solo redacta; no decide ni promete). */
export const BLOQUE_PROMPT_CAMBIO_HORARIO =
  'CAMBIO DE HORARIO / MALETAS: el huésped pide entrar antes, salir más tarde o dejar el equipaje fuera del horario de su estancia. ' +
  'Esto lo decide SIEMPRE el anfitrión, no tú: NO lo confirmes ni lo niegues; dile con amabilidad que lo consultas con el equipo y se lo confirmas en breve. ' +
  'PROHIBIDO mencionar coste, precio, tarifa, suplemento, cargo o «según la hora» (no existe ningún coste), y PROHIBIDO ofrecerlo como servicio de pago. ' +
  'PROHIBIDO pedir o mencionar una reseña o valoración en este mensaje.'
