// lib/correo/reserva-booking.ts — parser PURO de los avisos de reserva de Booking al propietario.
//
// Nace del caso James Ascott (Luxury, 27→29/08/2026): Smoobu se cayó, la reserva NUNCA llegó a
// `incomes` y la limpieza del 29 no salió en el calendario de Sique Brilla. Dos señales de correo:
//
//  (a) «Booking.com - ⚠️ Nueva reserva no registrada (5569210843, 1/8/2026)» — Booking avisa
//      cuando el channel manager (Smoobu) NO registró la reserva. Igual con «Cancelación no
//      registrada». ⚠️ NO es fiable al 100%: para la de James Ascott NO llegó ningún correo.
//  (b) «¡Nueva reserva! Information about new reservation (2421710882, sábado, 15 de agosto de
//      2020)» — la confirmación ordinaria. Dejó de llegar en 2020 (Smoobu tomó el canal), pero
//      si Booking la reactivara, este parser la entiende igual.
//
// Los patrones están copiados de correos REALES del buzón (regla del repo: el fixture de un
// parser de documento externo se copia del documento real, jamás de memoria).

export interface AvisoReservaBooking {
  /** 'nueva' = reserva que Smoobu debería tener · 'cancelacion' = cancelación que Smoobu debería aplicar */
  tipo: 'nueva' | 'cancelacion'
  /** nº de confirmación de Booking; null = el correo no lo publicó legible */
  ref: string | null
  /** fecha de check-in AAAA-MM-DD; null = el correo no la publicó legible */
  checkIn: string | null
  /** slug prop_* de PROPS_CALENDARIO; null = el nombre del anuncio no casa con ningún piso conocido */
  propertyId: string | null
  /** nombre del anuncio tal y como lo publica Booking (para el aviso, aunque no se mapee) */
  nombrePiso: string | null
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function isoDe(d: number, m: number, y: number): string | null {
  if (!(y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Mapea el nombre del anuncio de Booking al slug del piso. Por PALABRA CLAVE inequívoca —
 * «Luxury Center» (nombre antiguo, ambiguo entre Luxury y Reform) devuelve null a propósito:
 * mejor «piso sin identificar» en el aviso que pintar la reserva en el piso equivocado.
 */
export function pisoDesdeNombre(texto: string): string | null {
  const t = texto.toLowerCase()
  if (/house\s*sevillana|socorro/.test(t)) return 'prop_house_sevillana'
  if (/duplex|dúplex/.test(t)) return 'prop_duplex_center'
  if (/luxury\s*busto/.test(t)) return 'prop_luxury_busto'
  if (/busto\s*reform|reform/.test(t)) return 'prop_busto_reform'
  return null
}

// Asunto real 15/06/2026: «Booking.com - ⚠️ Nueva reserva no registrada (5569210843, 1/8/2026)»
// Asunto real 08/06/2026: «Booking.com - ⚠️ Cancelación no registrada (5394273923, 26/6/2026)»
const RE_NO_REGISTRADA =
  /(nueva reserva|cancelaci[oó]n) no registrada\s*\((\d{6,})\s*,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\)/i

// Asunto real 12/08/2020: «Booking.com - ¡Nueva reserva! Information about new reservation
// (2421710882, sábado, 15 de agosto de 2020)» (también «Nueva reserva de última hora …»).
const RE_NUEVA_2020 =
  /new reservation\s*\((\d{6,})\s*,\s*[^,]*,?\s*(\d{1,2}) de (\w+) de (\d{4})\)/i

/**
 * Reconoce y trocea un aviso de reserva de Booking al propietario. Devuelve null si el correo
 * no es uno de estos avisos (un mensaje de huésped, una factura… siguen su camino normal).
 * `from` debe ser de booking.com — el asunto solo no basta (podría ser un reenvío/phishing).
 */
export function parsearAvisoBooking(correo: { from: string; subject: string; extracto: string }): AvisoReservaBooking | null {
  if (!/@(?:[a-z0-9-]+\.)*booking\.com$/i.test(correo.from.trim())) return null

  const noReg = correo.subject.match(RE_NO_REGISTRADA)
  if (noReg) {
    const nombre = nombrePisoDe(correo.extracto)
    return {
      tipo: /cancelaci/i.test(noReg[1]) ? 'cancelacion' : 'nueva',
      ref: noReg[2],
      checkIn: isoDe(Number(noReg[3]), Number(noReg[4]), Number(noReg[5])),
      propertyId: nombre ? pisoDesdeNombre(nombre) : null,
      nombrePiso: nombre,
    }
  }

  const nueva = correo.subject.match(RE_NUEVA_2020)
  if (nueva) {
    const mes = MESES[nueva[3]?.toLowerCase() ?? ''] ?? 0
    const nombre = nombrePisoDe(correo.extracto)
    return {
      tipo: 'nueva',
      ref: nueva[1],
      checkIn: isoDe(Number(nueva[2]), mes, Number(nueva[4])),
      propertyId: nombre ? pisoDesdeNombre(nombre) : null,
      nombrePiso: nombre,
    }
  }

  return null
}

// En el cuerpo real el nombre del anuncio va en «Hola, Luxury Busto Patio privado Centro:» y en
// la cabecera «Booking.com Luxury Busto Patio privado Centro».
function nombrePisoDe(extracto: string): string | null {
  const hola = extracto.match(/Hola,\s*([^:\n]{3,60}):/i)
  if (hola) return hola[1].trim()
  const cab = extracto.match(/Booking\.com\s+([A-ZÁÉÍÓÚÑ][^\n[]{2,60})/)
  if (cab) return cab[1].trim()
  return null
}

/**
 * Veredicto del vigía tras mirar Smoobu. `enSmoobu === null` significa «no se pudo comprobar»
 * (Smoobu caído / error de red) y NUNCA decide nada — no lo sé ≠ no está.
 *  - nueva:       el problema es que Smoobu NO la tenga.
 *  - cancelacion: el problema es que Smoobu la SIGA teniendo como activa (calendario bloqueado
 *                 con una reserva que ya no existe).
 */
export function veredictoAviso(tipo: 'nueva' | 'cancelacion', enSmoobu: boolean | null): 'ok' | 'problema' | 'sin_comprobar' {
  if (enSmoobu === null) return 'sin_comprobar'
  if (tipo === 'nueva') return enSmoobu ? 'ok' : 'problema'
  return enSmoobu ? 'problema' : 'ok'
}
