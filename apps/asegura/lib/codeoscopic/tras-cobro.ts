// Tras un 200 de `POST /insurances` el cargo (0,50 €) ya está hecho. PURO, sin BD.
// Si la respuesta no se puede interpretar (sin `projectId`…), NO se vuelve a cobrar al reintentar: la reserva se
// cierra como facturable y el mensaje lo dice claro.
import { leerCotizacion, type Cotizacion } from './respuesta.ts'

export const MENSAJE_COBRADA_ILEGIBLE =
  'La compañía respondió y la cotización YA ESTÁ COBRADA (0,50 €), pero la respuesta no se ha podido interpretar. ' +
  'Reintenta SIN pagar: no vuelvas a cotizar; recupera el proyecto ya creado en Avant2 desde la búsqueda de proyectos.'

export function leerTrasCobro(
  crudo: unknown,
  leer: (raw: unknown) => Cotizacion = leerCotizacion,
): { ok: true; cotizacion: Cotizacion } | { ok: false; mensaje: string } {
  try {
    return { ok: true, cotizacion: leer(crudo) }
  } catch (e) {
    return { ok: false, mensaje: `${MENSAJE_COBRADA_ILEGIBLE} (${e instanceof Error ? e.message : String(e)})` }
  }
}
