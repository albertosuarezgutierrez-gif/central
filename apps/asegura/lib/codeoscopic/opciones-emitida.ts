// Las opciones del producto con las que se EMITIÓ (29/09/2026): «Asistencia en Viaje: Estándar»,
// «Vehículo de sustitución: No»… Se leen de la oferta aceptada (GET gratis) y se guardan en la
// póliza acuñada, porque es lo primero que se pregunta ante un siniestro de grúa y el vendor solo
// las da en `GET /insurances/{id}/offers/{offerId}`.
//
// Best-effort: un fallo NO frena el acuñado. `null` = no se pudo saber (no «sin opciones»).

import type { ConfigCodeoscopic } from './config.ts'
import { opcionesDeOferta } from './backfill-coberturas.ts'
import type { OpcionLegible } from './coberturas.ts'

export async function opcionesOfertaAceptada(
  projectId: string,
  offerId: string | null,
  leer: (projectId: string, offerId: string) => Promise<unknown>,
): Promise<OpcionLegible[] | null> {
  if (!offerId) return null
  try {
    return opcionesDeOferta(await leer(projectId, offerId))
  } catch (e) {
    console.warn(`[emitir] ${projectId}: no se pudieron leer las opciones de la oferta ${offerId}:`, e instanceof Error ? e.message : String(e))
    return null
  }
}

/**
 * El lector real: GET de la oferta, sin libro de consumo (es gratis). 🚨 Con tope CORTO: corre justo
 * antes de acuñar, detrás de un Submit que ya ha podido gastar gran parte del `maxDuration`; si esta
 * lectura se comiera el resto, la póliza YA emitida se quedaría sin acuñar por un dato accesorio.
 */
export const TOPE_LECTURA_OPCIONES_MS = 6_000

export function lectorOferta(config: ConfigCodeoscopic): (projectId: string, offerId: string) => Promise<unknown> {
  return async (projectId, offerId) => {
    const { peticion } = await import('./cliente.ts')
    return peticion(config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}/offers/${encodeURIComponent(offerId)}`,
      timeoutMs: Math.min(config.timeoutGenericoMs, TOPE_LECTURA_OPCIONES_MS),
    })
  }
}
