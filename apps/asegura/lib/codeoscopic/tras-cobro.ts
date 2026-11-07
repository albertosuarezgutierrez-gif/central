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

/** `projectId` del 200 cobrado aunque la respuesta no se pueda interpretar entera (`id` de raíz: número o dígitos). */
export function projectIdDeCrudo(crudo: unknown): string | null {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) return null
  const id = (crudo as Record<string, unknown>).id
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) return String(id)
  if (typeof id === 'string' && /^\d{1,12}$/.test(id.trim())) return id.trim()
  return null
}

/**
 * Como `leerTrasCobro`, pero si la respuesta cobrada es ilegible y trae `projectId`, recupera el proyecto con un GET
 * GRATIS (`GET /insurances/{id}`: Codeoscopic 06/11/2026, «Puedes hacer el GET sin coste. Solo se cobran los POST»)
 * antes de rendirse. NUNCA reintenta el POST: `recuperar` es solo lectura. Si el GET falla o también es ilegible,
 * devuelve el mismo fallo de siempre (cobrada, no repetir).
 */
export async function leerTrasCobroRecuperando(
  crudo: unknown,
  recuperar: ((projectId: string) => Promise<unknown>) | null,
  leer: (raw: unknown) => Cotizacion = leerCotizacion,
): Promise<{ ok: true; cotizacion: Cotizacion; crudo: unknown; recuperada: boolean } | { ok: false; mensaje: string }> {
  const primera = leerTrasCobro(crudo, leer)
  if (primera.ok) return { ok: true, cotizacion: primera.cotizacion, crudo, recuperada: false }
  const id = projectIdDeCrudo(crudo)
  if (!recuperar || id === null) return primera
  try {
    const otro = await recuperar(id)
    const segunda = leerTrasCobro(otro, leer)
    if (segunda.ok) return { ok: true, cotizacion: segunda.cotizacion, crudo: otro, recuperada: true }
  } catch {
    // El GET gratis también falló: se cae al mensaje de «cobrada, no repetir».
  }
  return primera
}
