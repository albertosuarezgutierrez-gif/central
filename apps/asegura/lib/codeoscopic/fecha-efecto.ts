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
