/**
 * Lee los vehículos asegurados de una identidad para el aviso de ITV de la campana (21/10/2026). La regla
 * está en `vehiculos-aviso-reglas.ts` (pura) y el cálculo en `@central/module-seguros-portal` (`aviso-itv.ts`).
 *
 * 🔒 Aislamiento por CÓDIGO: la identidad llega de quien ya pasó por `lib/session` (la ruta de avisos); toda
 * consulta a `portal_*` filtra por ella. Solo las pólizas PROPIAS (las de otra persona no se avisan aquí).
 * LANZA si algo no se pudo leer: la campana lo declara (`vehiculos: null` → `n+`), nunca «sin vehículos».
 */
import type { VehiculoParaAviso } from '@central/module-seguros-portal'

import { carteraALaVista, carteraDeIdentidad, cuentaComoEnVigor } from './cartera-lectura'
import { prisma } from './db'
import { DECLARADA_NO_ELIMINADA } from './declaradas-eliminadas'
import { getIdentidad } from './session'
import { vehiculosParaAviso } from './vehiculos-aviso-reglas'

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export async function vehiculosParaAvisoDeIdentidad(identidadId: string): Promise<VehiculoParaAviso[]> {
  // La puerta única: el id que llega TIENE que ser el de la cookie. Un id suelto no lee nada.
  const sesion = await getIdentidad()
  if (sesion === null || sesion.id !== identidadId) throw new Error('identidad_no_coincide_con_la_sesion')
  const [cartera, declaradas, recordatorios] = await Promise.all([
    carteraDeIdentidad(identidadId),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId, ...DECLARADA_NO_ELIMINADA },
      select: { id: true, ramo: true, matricula: true, fechaMatriculacion: true, fechaVencimiento: true },
    }),
    // Los recordatorios de ITV de ESTA identidad: si ya tiene uno para el coche, la campana avisa por ese.
    prisma.portalObligacion.findMany({
      where: { identidadId, tipo: 'itv' },
      select: { tipo: true, polizaId: true, polizaDeclaradaId: true, titulo: true },
    }),
  ])
  const c = carteraALaVista(cartera)
  return vehiculosParaAviso({
    propias: c.propias.flatMap((t) =>
      t.polizas.map((p) => ({ id: p.id, ramo: p.ramo, enVigor: cuentaComoEnVigor(p), bien: p.bien })),
    ),
    declaradas: declaradas.map((d) => ({
      id: d.id,
      ramo: d.ramo,
      matricula: d.matricula,
      fechaMatriculacion: dia(d.fechaMatriculacion),
      fechaVencimiento: dia(d.fechaVencimiento),
    })),
    recordatorios: recordatorios.map((r) => ({ tipo: String(r.tipo), polizaId: r.polizaId, polizaDeclaradaId: r.polizaDeclaradaId, titulo: r.titulo })),
    hoy: new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
  })
}
