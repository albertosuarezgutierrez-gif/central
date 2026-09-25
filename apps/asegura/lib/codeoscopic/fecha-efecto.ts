// La fecha de efecto de un proyecto Codeoscopic tiene DOS cepos y ninguno se
// puede arreglar después de pagar el `POST /insurances`:
//
//   1. No puede estar a más de 90 días vista (11-12/09/2026, «>90 días»).
//   2. No puede ser ANTERIOR a hoy (13/09/2026, décimo 400 real, proyecto
//      40685666): se cotizó el 12/09 con efecto 12/09 y al día siguiente el
//      ReRate contestó «The effective date cannot be before today.»
//
// `effectiveDate` es de solo lectura tras el POST inicial (`actualizarFechaEfecto`
// lo tiene medido dos veces), así que un proyecto con la fecha ya pasada está
// MUERTO: ni ReRate ni Submit lo aceptarán nunca y la única salida es descartarlo
// y cotizar de cero (0,50€). Esto lo detecta GRATIS — sobre la relectura del
// proyecto o sobre la `peticion` guardada — para que ninguna pantalla ofrezca un
// botón sin salida. PURO, para poder verlo fallar en un test.

export const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/

/** Lo más lejos que la compañía admite la fecha de efecto (cepo 1, medido 11-12/09/2026). */
export const MAX_DIAS_VISTA = 90

/** `f` (aaaa-mm-dd) más `n` días, en aaaa-mm-dd. Aritmética en UTC a propósito: sin horas no hay DST. */
export function sumarDias(f: string, n: number): string {
  const d = new Date(`${f}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Hoy en Madrid, `YYYY-MM-DD`. El vendor decide «hoy» en hora española; el
 *  servidor corre en UTC y entre las 22:00 y las 00:00 UTC ya es mañana aquí. */
export function hoyEnMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/**
 * `true` SOLO cuando la fecha consta, tiene forma ISO y es anterior a `hoy`.
 * Sin fecha (el vendor no la trae) NO se afirma nada: `false`, y que sea el
 * ReRate quien hable — un «no lo sé» no se pinta como «caducada» ni como «viva».
 */
export function fechaEfectoCaducada(fechaEfecto: string | null | undefined, hoy: string = hoyEnMadrid()): boolean {
  if (!fechaEfecto || !RE_FECHA_ISO.test(fechaEfecto)) return false
  return fechaEfecto < hoy
}

/** El hueco tal y como lo pinta la pantalla de emisión (misma forma que `reparosDe`). */
export function reparoFechaCaducada(fechaEfecto: string, hoy: string = hoyEnMadrid()): { campo: 'fechaEfecto'; motivo: string } {
  return {
    campo: 'fechaEfecto',
    motivo:
      `el proyecto se cotizó con fecha de efecto ${fechaEfecto} y hoy es ${hoy}: la compañía no confirma ni ` +
      'emite con una fecha de efecto ya pasada, y esa fecha no se puede cambiar en un proyecto ya creado',
  }
}

export function mensajeFechaCaducada(fechaEfecto: string, projectId: string, hoy: string = hoyEnMadrid()): string {
  return (
    `La cotización del proyecto ${projectId} ha caducado: se pidió con fecha de efecto ${fechaEfecto} y hoy es ${hoy}. ` +
    'La compañía no acepta una fecha de efecto anterior a hoy y el proyecto no la deja cambiar. ' +
    'No se ha gastado nada. Hay que descartarla y pedir precio de cero (0,50€) con la fecha de efecto correcta — ' +
    'y confirmar y emitir antes de que pase ese día.'
  )
}

/**
 * La regla ENTERA de la fecha de efecto, para aplicarla ANTES de pagar (`revisarDatosAuto`)
 * y no descubrirla a 0,50€ en el ReRate: `null` si vale; si no, el motivo en castellano.
 * Una fecha sin forma ISO no es asunto de esta función (`revisarDatosAuto` ya la reprocha).
 */
export function motivoFechaEfectoInvalida(fechaEfecto: string, hoy: string = hoyEnMadrid()): string | null {
  if (!RE_FECHA_ISO.test(fechaEfecto)) return null
  if (fechaEfecto < hoy) {
    return `no puede ser anterior a hoy (${hoy}): la compañía no confirma ni emite con una fecha de efecto pasada`
  }
  const tope = sumarDias(hoy, MAX_DIAS_VISTA)
  if (fechaEfecto > tope) {
    return `no puede estar a más de ${MAX_DIAS_VISTA} días vista (como muy tarde el ${tope}): la compañía la rechaza al confirmar el precio`
  }
  return null
}

/**
 * La fecha de efecto de la OFERTA aceptada dentro del proyecto crudo (`GET
 * /insurances/{id}`), si el vendor la trae. Desde el 25/09/2026 la fecha se
 * mueve en el ReRate (`mainQuote.effectiveDate`), así que la del proyecto puede
 * quedarse con la vieja mientras la oferta que se va a emitir ya lleva la nueva.
 * Busca en profundidad un objeto con `id` = `offerId` y `effectiveDate` ISO.
 * `null` = no encontrada: el llamador cae a la del proyecto (lo de siempre).
 */
export function fechaEfectoDeOferta(crudo: unknown, offerId: string | null | undefined): string | null {
  if (!offerId) return null
  const pila: unknown[] = [crudo]
  let vistos = 0
  while (pila.length > 0 && vistos < 5000) {
    const v = pila.pop()
    vistos++
    if (Array.isArray(v)) {
      for (const x of v) pila.push(x)
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const id = typeof o.id === 'number' ? String(o.id) : o.id
      const fecha = typeof o.effectiveDate === 'string' ? o.effectiveDate.slice(0, 10) : null
      if (id === offerId && fecha && RE_FECHA_ISO.test(fecha)) return fecha
      for (const x of Object.values(o)) if (x && typeof x === 'object') pila.push(x)
    }
  }
  return null
}
