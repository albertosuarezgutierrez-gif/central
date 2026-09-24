// «Siguiente acción» de cada cliente del LISTADO de la cartera (chip por fila).
//
// La regla es la MISMA que la tarjeta de la ficha: `siguienteAccion()` de
// `@central/module-seguros`. Lo que cambia es de dónde salen las entradas: la
// ficha las lee cliente a cliente; aquí se leen por LOTES para los clientes de
// la página (≤ porPagina), con una consulta por tipo de dato, no una por cliente.
//
// Cada bloque conserva su «no se sabe»: si los recibos, las declaradas o los
// presupuestos no se pueden leer, llegan `null` y la regla devuelve
// `sin_comprobar` en vez de «nada pendiente». Si ni siquiera las pólizas se
// pueden leer, no hay chip para nadie (`null`), nunca uno inventado.

import {
  DIAS_PRESUPUESTO_VIVO,
  esCarteraViva,
  resumirRecibos,
  siguienteAccion,
  type DeclaradaAccion,
  type PolizaAccion,
  type SiguienteAccion,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

const fechaIso = (d: Date | null): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null)

export type ClienteParaAccion = {
  id: string
  /** `null` = no se pudo comprobar el canal. */
  tieneCanal: boolean | null
}

export async function siguientesAcciones(
  correduriaId: string,
  clientes: ClienteParaAccion[],
  hoy: Date = new Date(),
): Promise<Map<string, SiguienteAccion> | null> {
  const ids = clientes.map((c) => c.id)
  if (ids.length === 0) return new Map()
  const db = prismaAsegura()

  let polizas
  try {
    polizas = await db.poliza.findMany({
      where: { correduriaId, clienteId: { in: ids }, mergedIntoPolizaId: null },
      select: {
        id: true, clienteId: true, tipo: true, aseguradora: true, estado: true, fechaVencimiento: true,
        importRef: true, eiacXmlHash: true, idPolizaEntidad: true,
      },
    })
  } catch {
    return null
  }
  const vivas = polizas.filter((p) => esCarteraViva(p))
  const idsVivas = vivas.map((p) => p.id)

  const [recibos, declaradas, presupuestos] = await Promise.all([
    idsVivas.length === 0
      ? Promise.resolve([])
      : db.polizaRecibo
          .findMany({
            where: { correduriaId, polizaId: { in: idsVivas } },
            select: { id: true, polizaId: true, situacion: true, primaTotal: true, fechaEmision: true, fechaVencimiento: true, formaPago: true },
          })
          .catch(() => null),
    db.$queryRaw<{ cliente_id: string; ramo: string | null; compania: string | null; fecha_vencimiento: Date | null }[]>`
      select v.cliente_id::text as cliente_id, d.ramo::text as ramo, d.compania, d.fecha_vencimiento
      from portal_vinculo v
      join portal_poliza_declarada d on d.identidad_id = v.identidad_id
      where v.correduria_id = ${correduriaId}::uuid and v.cliente_id in (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
    `.catch(() => null),
    db.$queryRaw<{ cliente_id: string; n: bigint }[]>`
      select cliente_id::text as cliente_id, count(*)::bigint as n
      from cotizaciones
      where correduria_id = ${correduriaId}::uuid
        and cliente_id in (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
        and estado::text in ('pendiente', 'enviada')
        and created_at >= now() - make_interval(days => ${DIAS_PRESUPUESTO_VIVO}::int)
      group by cliente_id
    `.catch(() => null),
  ])

  const recibosPorPoliza = new Map<string, NonNullable<typeof recibos>>()
  for (const r of recibos ?? []) {
    const l = recibosPorPoliza.get(r.polizaId) ?? []
    l.push(r)
    recibosPorPoliza.set(r.polizaId, l)
  }
  const presupuestosPor = new Map((presupuestos ?? []).map((p) => [p.cliente_id, Number(p.n)]))

  const out = new Map<string, SiguienteAccion>()
  for (const c of clientes) {
    const suyas: PolizaAccion[] = polizas
      .filter((p) => p.clienteId === c.id)
      .map((p) => {
        const viva = esCarteraViva(p)
        return {
          id: p.id,
          tipo: String(p.tipo),
          aseguradora: p.aseguradora,
          viva,
          confirmadaCima: viva && p.idPolizaEntidad !== null,
          estado: String(p.estado),
          fechaVencimiento: fechaIso(p.fechaVencimiento),
          recibos: !viva
            ? null
            : recibos === null
              ? null
              : resumirRecibos(
                  (recibosPorPoliza.get(p.id) ?? []).map((r) => ({
                    id: r.id,
                    situacion: r.situacion === null ? null : String(r.situacion),
                    primaTotal: r.primaTotal,
                    fechaEmision: fechaIso(r.fechaEmision),
                    fechaVencimiento: fechaIso(r.fechaVencimiento),
                    formaPago: r.formaPago,
                  })),
                ),
        }
      })
    const decl: DeclaradaAccion[] | null =
      declaradas === null
        ? null
        : declaradas
            .filter((d) => d.cliente_id === c.id)
            .map((d) => ({ ramo: d.ramo, compania: d.compania, fechaVencimiento: fechaIso(d.fecha_vencimiento) }))
    out.set(
      c.id,
      siguienteAccion({
        polizas: suyas,
        declaradas: decl,
        cotizacionesVivas: presupuestos === null ? null : presupuestosPor.get(c.id) ?? 0,
        tieneCanal: c.tieneCanal,
        hoy,
      }),
    )
  }
  return out
}
