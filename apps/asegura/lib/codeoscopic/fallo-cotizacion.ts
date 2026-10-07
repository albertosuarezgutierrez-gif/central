// La respuesta HTTP de un `cotizar()` que NO dio precio. PURO, sin alias `@/` para poder probarlo.
// `gastado: '0,00€'` solo con PRUEBA de no-cargo (`sinCargo`); sin ella, el cuerpo no lleva cifra y la
// pantalla dice «no se sabe si se ha cobrado» (timeout, 5xx, red, tope sin libro...).
import type { ResultadoCotizacion } from './cotizar.ts'

export function respuestaFalloCotizacion(
  r: Extract<ResultadoCotizacion, { ok: false }>,
): { status: number; cuerpo: Record<string, unknown> } {
  if (r.sinCargo === true) {
    const validacion = r.claveVendor === 'validacion'
    return {
      status: validacion ? 422 : 502,
      cuerpo: { error: r.mensaje, razon: r.razon, ...(validacion ? { causa: 'validacion' } : {}), gastado: '0,00€' },
    }
  }
  // 402 cuando el freno es el TOPE: no es un fallo, es el tope haciendo su trabajo.
  return {
    status: r.razon === 'tope' ? 402 : r.razon === 'vendor' ? 502 : 503,
    cuerpo: { error: r.mensaje, razon: r.razon },
  }
}
