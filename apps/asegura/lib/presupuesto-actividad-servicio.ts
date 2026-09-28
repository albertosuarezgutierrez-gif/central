// La actividad del cliente en su presupuesto, con BD. Lo puro (normalizar, antiduplicado, tope) vive
// en `presupuesto-actividad.ts` y tiene sus cepos.
//
// Se llama SOLO desde el puente del portal (`/api/portal/presupuesto`, accion `actividad`). La ficha
// sale de `portal_vinculo` (`propio` → `fichaPropiaDe`), nunca de un id que mande nadie.

import { prismaAsegura } from './asegura-db'
import { anotarEvento, contarDesde, propio, type SinFicha } from './comparativa-ia-servicio'
import {
  TIPO_ACTIVIDAD, VENTANA_DUPLICADO_MS, decidirActividad, normalizarActividad,
} from './presupuesto-actividad'

export type ResultadoActividad =
  /** `guardada: false` = no hacía falta (vacía, repetida o por encima del tope). No es un fallo. */
  | { estado: 'ok'; guardada: boolean }
  | { estado: 'no_admite' } | { estado: 'no_encontrado' } | SinFicha

export async function actividadCliente(
  correduriaId: string, identidadId: string, presupuestoId: string,
  e: { garantias: unknown; comparadas: unknown },
): Promise<ResultadoActividad> {
  const p = await propio(correduriaId, identidadId, presupuestoId)
  if ('estado' in p) return p
  if (p.retirado) return { estado: 'no_admite' }

  const db = prismaAsegura()
  // Solo las VISIBLES: una opción que el corredor ocultó no existe para el cliente.
  const visibles = await db.presupuestoOpcion.findMany({
    where: { presupuestoId, ocultaAt: null },
    select: { id: true },
  })
  const detalle = normalizarActividad(e, { ramo: p.ramo, opcionesVisibles: visibles.map((o) => o.id) })

  const recientes = await db.presupuestoEvento.findMany({
    where: { presupuestoId, tipo: TIPO_ACTIVIDAD, ocurridoAt: { gte: new Date(Date.now() - VENTANA_DUPLICADO_MS) } },
    select: { detalle: true },
  })
  const enUltimas24h = await contarDesde(presupuestoId, TIPO_ACTIVIDAD, new Date(Date.now() - 24 * 3_600_000))
  const d = decidirActividad(detalle, { recientes: recientes.map((r) => r.detalle), enUltimas24h })
  if (d !== 'guardar') return { estado: 'ok', guardada: false }

  await anotarEvento(presupuestoId, TIPO_ACTIVIDAD, detalle)
  return { estado: 'ok', guardada: true }
}
