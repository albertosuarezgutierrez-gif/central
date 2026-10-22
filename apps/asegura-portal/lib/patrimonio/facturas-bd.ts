// PATRIMONIO (22/10/2026, paso 7) — adaptador con BD de las facturas leídas con IA.
//
// 🚨 Como `gastos-bd.ts`: parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`); `titular_id` se resuelve
// aquí desde la ficha ya autorizada, jamás del cliente; el inmueble se busca DENTRO del titular y toda escritura sobre un
// gasto lleva `titularId` + `origen: 'factura'` + `estado: 'propuesto'` en el `where` (id ajeno = 0 filas = 404).
// Solo usa columnas con GRANT para `prisma_asegura_portal` (sin SQL nuevo). El tope diario cuenta FILAS de esta identidad.
import type { Prisma } from '@prisma/client'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { extraerFactura } from './extraer-factura'
import type { AccesosMapa } from './gastos-api'
import { titularDe } from './gastos-bd'
import type { PuertosFacturas } from './facturas-api'

const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)
const hoyUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)

export function puertosFacturas(identidadId: string): PuertosFacturas {
  let cache: AccesosMapa | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId`.
  const sesionOk = async () => (await getIdentidad())?.id === identidadId

  async function resolver(clienteId: string, gastoId: string, data: Prisma.PortalPatrimonioGastoUncheckedUpdateManyInput) {
    if (!(await sesionOk())) return 'no_encontrado' as const
    const t = await titularDe(clienteId, identidadId)
    if (!t) return 'no_encontrado' as const
    const donde = { id: gastoId, titularId: t.id, origen: 'factura' }
    const r = await prisma.portalPatrimonioGasto.updateMany({ where: { ...donde, estado: 'propuesto' }, data })
    if (r.count === 1) return 'ok' as const
    const existe = await prisma.portalPatrimonioGasto.findFirst({ where: donde, select: { id: true } })
    return existe ? ('ya_resuelto' as const) : ('no_encontrado' as const)
  }

  return {
    accesos,

    async inmuebleDelTitular(clienteId, inmuebleId) {
      if (!(await sesionOk())) return false
      const t = await titularDe(clienteId, identidadId)
      if (!t) return false
      const i = await prisma.portalPatrimonioInmueble.findFirst({ where: { id: inmuebleId, titularId: t.id, archivadoEn: null }, select: { id: true } })
      return i !== null
    },

    async contarFacturasHoy() {
      if (!(await sesionOk())) return Number.MAX_SAFE_INTEGER
      return prisma.portalPatrimonioGasto.count({ where: { creadoPorIdentidadId: identidadId, origen: 'factura', creadoEn: { gte: hoyUtc() } } })
    },

    leer: (f) => extraerFactura(f.contenido, f.mime, f.nombre),

    async crearPropuesta({ clienteId, inmuebleId, lectura }) {
      if (!(await sesionOk())) return { ok: false }
      const t = await titularDe(clienteId, identidadId)
      if (!t) return { ok: false }
      const p = lectura.propuesta
      const g = await prisma.portalPatrimonioGasto.create({
        data: {
          titularId: t.id,
          inmuebleId,
          // `fecha` es NOT NULL: si no se leyó, hoy es solo un marcador (la verdad leída está en `propuesta.fecha`) y
          // confirmar EXIGE que la persona dé la fecha. Importes y categoría quedan NULL si no constan: nunca 0.
          fecha: aFecha(p.fecha ?? new Date().toISOString().slice(0, 10)),
          categoria: p.categoria,
          concepto: p.concepto ?? p.proveedor,
          baseCent: p.baseCent === null ? null : BigInt(p.baseCent),
          totalCent: p.totalCent === null ? null : BigInt(p.totalCent),
          estado: 'propuesto',
          origen: 'factura',
          propuesta: { fuente: lectura.fuente, motivos: lectura.motivos, leido: p } as unknown as Prisma.InputJsonValue,
          creadoPorIdentidadId: identidadId,
        },
        select: { id: true },
      })
      return { ok: true, id: g.id }
    },

    confirmar: ({ clienteId, gastoId, datos }) =>
      resolver(clienteId, gastoId, {
        // Siempre se escribe lo que la persona eligió al revisar: «Sin inmueble» DESASIGNA el de la subida (si se
        // conservara, el gasto se imputaría a un inmueble que la persona ha quitado). Ya validado dentro del titular.
        inmuebleId: datos.inmuebleId,
        fecha: aFecha(datos.fecha),
        categoria: datos.categoria,
        concepto: datos.concepto,
        baseCent: datos.baseCent === null ? null : BigInt(datos.baseCent),
        totalCent: BigInt(datos.totalCent),
        estado: 'confirmado',
        confirmadoEn: new Date(),
        confirmadoPorIdentidadId: identidadId,
      }),

    descartar: ({ clienteId, gastoId }) => resolver(clienteId, gastoId, { estado: 'descartado' }),
  }
}
