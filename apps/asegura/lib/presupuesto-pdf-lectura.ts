// Qué plantilla de PDF toca a un presupuesto (05/10/2026, F4): la decide el ORIGEN, y lo lee de la cartera.
// Todo filtrado por la correduría: con BYPASSRLS un id ajeno no falla, devuelve los datos de otro.

import { MEDIADOR } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { datosPdfPresupuesto } from './presupuesto-pdf-datos'
import { origenPresupuesto } from './presupuesto-origen'
import { leerEstudio, type DatosPdfOfertas } from './presupuesto-pdf-ofertas'
import type { DatosPdfPresupuesto } from './presupuesto-pdf'

const MEDIADOR_PDF = () => ({
  marca: MEDIADOR.marca,
  nombre: MEDIADOR.identidad.nombre,
  claveDgsfp: MEDIADOR.identidad.claveDgsfp,
  domicilio: MEDIADOR.identidad.domicilio,
  email: MEDIADOR.identidad.email || null,
})

export type LecturaPdf =
  | { estado: 'ok'; origen: 'codeoscopic'; datos: DatosPdfPresupuesto }
  | { estado: 'ok'; origen: 'ofertas'; datos: DatosPdfOfertas }
  | { estado: 'no_encontrado' }
  /** Un presupuesto de ofertas cuyo `estudio` no tiene la forma esperada: no se pinta a medias. */
  | { estado: 'estudio_ilegible' }
  | { estado: 'origen_desconocido' }

/**
 * Elige la plantilla por el ORIGEN del presupuesto (la puerta es `origenPresupuesto`): el estudio de
 * ofertas no pasa por `datosPdfPresupuesto` (que lee tarificaciones de Avant2). Un origen desconocido
 * no genera ningún PDF.
 */
export async function leerPdfPresupuesto(correduriaId: string, id: string): Promise<LecturaPdf> {
  const db = prismaAsegura()
  const p = await db.presupuesto.findFirst({
    where: { id, correduriaId },
    select: { origen: true, referencia: true, ramo: true, creadoAt: true, venceEl: true, necesidades: true, clienteId: true, estudio: true },
  })
  if (!p) return { estado: 'no_encontrado' }
  const origen = origenPresupuesto(p.origen)
  if (origen === 'codeoscopic') {
    const datos = await datosPdfPresupuesto(correduriaId, id)
    return datos ? { estado: 'ok', origen, datos } : { estado: 'no_encontrado' }
  }
  if (origen !== 'ofertas') return { estado: 'origen_desconocido' }
  const estudio = leerEstudio(p.estudio)
  if (!estudio) return { estado: 'estudio_ilegible' }
  const cliente = await db.cliente.findFirst({ where: { id: p.clienteId, correduriaId }, select: { nombre: true, apellidos: true } })
  return {
    estado: 'ok',
    origen,
    datos: {
      referencia: p.referencia ?? null,
      cliente: [cliente?.nombre, cliente?.apellidos].map((s) => s?.trim()).filter(Boolean).join(' ') || 'Cliente',
      ramo: p.ramo,
      creadoAt: p.creadoAt,
      venceEl: p.venceEl,
      necesidades: p.necesidades,
      estudio,
      mediador: MEDIADOR_PDF(),
    },
  }
}
