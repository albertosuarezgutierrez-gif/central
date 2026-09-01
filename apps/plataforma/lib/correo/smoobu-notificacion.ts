// lib/correo/smoobu-notificacion.ts — el correo con el que SMOOBU avisa de una reserva.
//
// POR QUÉ EXISTE (01/09/2026). El vigía Booking↔Smoobu mandó tres 🚨 «reserva que Smoobu NO
// tiene» y las TRES eran falsas. La reserva 153896946 (Karl Brunelliere, Busto Reform,
// 03→07/09/2026) estaba en Smoobu Y en `incomes` desde el minuto uno — el propio correo que
// disparó la alarma lo decía: lo manda `service@smoobu.com`, dice «Smoobu ha sincronizado esta
// reserva», y el número que el triaje extrajo salía de ESTE enlace:
//
//     https://login.smoobu.com/es/booking/detail/153896946
//
// O sea: se tomó el enlace de Smoobu a la ficha de la reserva como prueba de que Smoobu no la
// tenía. Un correo de `service@smoobu.com` anunciando una reserva es la fuente misma diciendo que
// la tiene: es PRUEBA POSITIVA, jamás una señal de agujero. Tampoco es un mensaje de huésped (su
// «Mensaje del huésped: 1 Double Bed / Non-Smoking» es el campo de peticiones de la OTA), así que
// no se enruta al agente de huéspedes.
//
// Y el canal NO es siempre Booking: el asunto lo publica entre paréntesis (Expedia, Agoda,
// Booking.com, Airbnb…). Quien lo lea debe decir el canal REAL o no decir ninguno — mandar a
// Alberto a la extranet de Booking a buscar una reserva de Expedia es afirmar algo que no se ha
// mirado.
//
// Puro (sin `@/` ni prisma) → testeable con `node --test` (smoobu-notificacion.test.ts).
import { PROPS_CALENDARIO } from '../sivra/constantes.ts'

export type TipoNotifSmoobu = 'nueva' | 'cancelacion' | 'modificacion'

export interface NotificacionSmoobu {
  tipo: TipoNotifSmoobu
  /** Nombre del anuncio tal cual lo escribe Smoobu ("Busto Reform"). null = no se supo leer. */
  piso: string | null
  /** Slug de PROPS_CALENDARIO si el nombre casa; null = no identificado (NO se inventa). */
  propertyId: string | null
  /** Canal publicado entre paréntesis en el asunto ("Expedia"). null = el correo no lo dijo. */
  canal: string | null
  /** ISO 'YYYY-MM-DD'; null si el asunto no traía fechas legibles. */
  checkIn: string | null
  checkOut: string | null
  huesped: string | null
  /** id interno de Smoobu, del enlace del cuerpo. Es lo que guarda `incomes.reservationId`. */
  smoobuId: string | null
}

/** Remitente de las notificaciones de Smoobu (cubre subdominios). */
export function esRemitenteSmoobu(from: string): boolean {
  const dom = (from || '').toLowerCase().trim().split('@')[1] ?? ''
  return dom === 'smoobu.com' || dom.endsWith('.smoobu.com')
}

// Nombres de portal normalizados a como los escribe cada marca. Un canal que no esté aquí se
// devuelve tal cual venga (recortado): decir «Expedia Group» es infinitamente mejor que decir
// «Booking» porque el mapa no lo conocía.
const CANALES: Record<string, string> = {
  'booking': 'Booking.com', 'booking.com': 'Booking.com',
  'expedia': 'Expedia', 'expedia.com': 'Expedia',
  'agoda': 'Agoda', 'agoda.com': 'Agoda',
  'airbnb': 'Airbnb', 'airbnb.com': 'Airbnb',
  'vrbo': 'Vrbo', 'homeaway': 'HomeAway', 'tripadvisor': 'Tripadvisor',
  'homeexchange': 'HomeExchange',
}

/** Normaliza el nombre de un canal. Devuelve null solo si no hay nada que normalizar. */
export function normalizarCanal(bruto: string | null | undefined): string | null {
  const t = (bruto ?? '').trim()
  if (!t) return null
  return CANALES[t.toLowerCase()] ?? t
}

/**
 * Canal publicado entre paréntesis al final del asunto de Smoobu. null = el asunto no lo dice
 * (y entonces no se nombra ningún canal: «no lo sé» no es «Booking»).
 */
export function canalDeAsunto(asunto: string | null | undefined): string | null {
  const m = (asunto ?? '').match(/\(([^()]{2,40})\)\s*$/)
  return m ? normalizarCanal(m[1]) : null
}

/** Nombre de piso → slug de PROPS_CALENDARIO (sin acentos, sin may/min). null si no casa. */
export function propertyIdDePiso(piso: string | null | undefined): string | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const n = norm(piso ?? '')
  if (!n) return null
  return PROPS_CALENDARIO.find(p => norm(p.label) === n)?.id ?? null
}

// «03.09.26» → '2026-09-03'. Devuelve null ante cualquier cosa que no sea una fecha real:
// una fecha mal leída es peor que una fecha ausente (sale un dato plausible y falso).
function fechaEs(dmy: string): string | null {
  const m = dmy.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
  if (!m) return null
  const d = Number(m[1]), mes = Number(m[2])
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null
  const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // Rechaza 31.02: el Date debe volver al mismo día.
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
}

// Asunto real (copiado del correo del 01/09/2026, hilo 1a05dd054bf72a06):
//   «Nueva reserva para Busto Reform: 03.09.26 – 07.09.26, Karl Brunelliere (Expedia)»
// El separador es un GUION LARGO (–), no un guion normal; se aceptan ambos.
const ASUNTO = /^\s*nuev[ao]\s+(reserva|cancelaci[oó]n|modificaci[oó]n)\s+para\s+(.+?):\s*(\d{1,2}\.\d{1,2}\.\d{2,4})\s*[–—-]\s*(\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:,\s*(.*?))?\s*$/i

function tipoDe(palabra: string): TipoNotifSmoobu {
  const p = palabra.toLowerCase()
  if (p.startsWith('cancelaci')) return 'cancelacion'
  if (p.startsWith('modificaci')) return 'modificacion'
  return 'nueva'
}

/**
 * ¿Es este correo la notificación de Smoobu de una reserva? Devuelve lo que el correo publica, o
 * null si no lo es (los reenvíos de mensajes de huésped —«Hemos recibido este mensaje de…»— NO
 * casan a propósito: esos sí son mensajes de huésped y siguen su camino).
 */
export function parsearNotificacionSmoobu(correo: { from: string; subject: string; body?: string }): NotificacionSmoobu | null {
  if (!esRemitenteSmoobu(correo.from)) return null
  const m = (correo.subject || '').match(ASUNTO)
  if (!m) return null

  // La cola del asunto es «Nombre Apellido (Canal)»: el canal se recorta y lo que queda es el
  // huésped. Sin paréntesis, canal = null y el nombre va entero.
  const cola = (m[5] ?? '').trim()
  const canal = canalDeAsunto(correo.subject)
  const huesped = cola.replace(/\s*\([^()]{2,40}\)\s*$/, '').trim() || null

  const piso = m[2].trim() || null
  const idm = (correo.body ?? '').match(/smoobu\.com\/[^\s]*?\/booking\/detail\/(\d+)/i)

  return {
    tipo: tipoDe(m[1]),
    piso,
    propertyId: propertyIdDePiso(piso),
    canal,
    checkIn: fechaEs(m[3]),
    checkOut: fechaEs(m[4]),
    huesped,
    smoobuId: idm ? idm[1] : null,
  }
}
