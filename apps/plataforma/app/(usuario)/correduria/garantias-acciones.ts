'use server'

// La tarificación GUARDADA que alimenta el filtro por garantías y el «ocultar al cliente» de las
// parrillas (28/09/2026). **Gratis**: es un GET que solo lee lo ya pagado — nunca vuelve a tarificar.
// El Bearer del puerto no baja al navegador (por eso es una acción de servidor), y a la sesión la
// protege el middleware; la CORREDURÍA, la guarda de abajo (el middleware no la mira y el layout no
// corre en una acción de servidor: cepo `test/regression-correduria-acciones-guarda.test.ts`).

import {
  tarificacionGuardadaAsegura,
  tarificacionNuevaGuardadaAsegura,
  type Precio,
} from '@/lib/retarificar-asegura'
import { exigirCorreduria } from '@/lib/correduria-acceso'

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
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', mensaje: 'No tienes acceso a la correduría.' }
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
