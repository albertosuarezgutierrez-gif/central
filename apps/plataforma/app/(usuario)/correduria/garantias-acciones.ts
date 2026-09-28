'use server'

// La tarificación GUARDADA que alimenta el filtro por garantías y el «ocultar al cliente» de las
// parrillas (28/09/2026). **Gratis**: es un GET que solo lee lo ya pagado — nunca vuelve a tarificar.
// El Bearer del puerto no baja al navegador (por eso es una acción de servidor), y a la sesión la
// protege el middleware, como al resto de `acciones.ts` de la correduría.

import {
  tarificacionGuardadaAsegura,
  tarificacionNuevaGuardadaAsegura,
  type Precio,
} from '@/lib/retarificar-asegura'

const RAMOS = ['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida'] as const
type RamoRetomable = (typeof RAMOS)[number]

export type RespuestaPreciosGuardados =
  | { estado: 'ok'; cotizacionId: string; creadaEn: string; precios: Precio[] }
  /** No es un fallo: no hay ninguna tarificación REAL guardada (p. ej. la de pantalla fue simulada). */
  | { estado: 'ninguna' }
  | { estado: 'error'; mensaje: string }

export async function pedirPreciosGuardados(
  origen: { polizaId: string } | { clienteId: string; ramo: string },
): Promise<RespuestaPreciosGuardados> {
  if ('polizaId' in origen) {
    const r = await tarificacionGuardadaAsegura(origen.polizaId)
    if (r.estado === 'ok') return { estado: 'ok', cotizacionId: r.guardada.cotizacionId, creadaEn: r.guardada.creadaEn, precios: r.guardada.precios }
    if (r.estado === 'ninguna') return { estado: 'ninguna' }
    return { estado: 'error', mensaje: r.mensaje }
  }
  if (!(RAMOS as readonly string[]).includes(origen.ramo)) return { estado: 'error', mensaje: `El ramo «${origen.ramo}» no tiene tarificación guardada.` }
  const r = await tarificacionNuevaGuardadaAsegura(origen.clienteId, origen.ramo as RamoRetomable)
  if (r.estado === 'ok') return { estado: 'ok', cotizacionId: r.guardada.cotizacionId, creadaEn: r.guardada.creadaEn, precios: r.guardada.precios }
  if (r.estado === 'ninguna') return { estado: 'ninguna' }
  return { estado: 'error', mensaje: r.mensaje }
}
