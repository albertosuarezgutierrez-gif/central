// apps/asegura/lib/oportunidades-aviso.ts
//
// Las oportunidades que HOY están a ≤45 días de su vencimiento (regla única, 29/09/2026:
// `DIAS_AVISO_OPORTUNIDAD` de `@central/module-seguros`). Da igual de dónde vinieran —baja por recibo
// devuelto, alta por Telegram, competencia, recaptación, «avísame» de la web, póliza subida—: todas
// viven en `oportunidades` y todas pasan por aquí.
//
// Solo LEE. La idempotencia (un aviso por oportunidad y ciclo) la lleva quien avisa: plataforma, en
// `correduria_avisos_renovacion` con el hito `oportunidad_45`, marcando SOLO lo que Telegram aceptó.
//
// `null` = no se pudo leer: nunca se sirve como «no hay nada».

import { avisosOportunidadDeHoy, ESTADOS_OPORTUNIDAD_ABIERTA } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

/** Techo de lectura. Si se alcanza se dice (`truncado`), no se calla. */
const MAX_FILAS = 5000

export type OportunidadAviso = {
  id: string
  clienteId: string
  cliente: string
  ramo: string | null
  /** Compañía actual (la de la competencia). `null` = no consta. */
  aseguradora: string | null
  vence: string
  dias: number
  /** Tuvo o tiene póliza con nosotros: a un cliente propio no se le manda precio por adelantado. */
  fueCliente: boolean
}

type Fila = {
  id: string
  clienteId: string
  cliente: string | null
  estado: string
  ramo: string | null
  aseguradora: string | null
  fechaFin: Date | null
  aparcadaHasta: Date | null
  fueCliente: boolean
}

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export async function oportunidadesEnAviso(
  correduriaId: string,
  hoy: string,
): Promise<{ oportunidades: OportunidadAviso[]; truncado: boolean; sinVencimiento: number | null }> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`
    select o.id::text as id, c.id::text as "clienteId",
           nullif(trim(concat_ws(' ', c.nombre, c.apellidos)), '') as cliente,
           o.estado::text as estado, o.tipo::text as ramo,
           nullif(trim(o.poliza_competencia->>'aseguradora'), '') as aseguradora,
           o.fecha_fin_vigencia as "fechaFin", o.aparcada_hasta as "aparcadaHasta",
           exists (select 1 from polizas p where p.cliente_id = c.id and p.correduria_id = c.correduria_id
                   and p.merged_into_poliza_id is null and p.estado::text <> 'competencia') as "fueCliente"
    from oportunidades o
    join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
    where o.correduria_id = ${correduriaId}::uuid
      and o.estado::text in (${Prisma.join([...ESTADOS_OPORTUNIDAD_ABIERTA])})
      and o.fecha_fin_vigencia is not null
    order by o.id
    limit ${MAX_FILAS + 1}`)
  // Las abiertas SIN vencimiento no se avisan (no hay día del que restar 45): se cuentan para decirlo en el
  // aviso en vez de callarlas. Si el recuento falla, `null` = no se sabe (nunca 0).
  const sinVencimiento = await prismaAsegura()
    .$queryRaw<{ n: bigint }[]>(Prisma.sql`
      select count(*)::bigint as n from oportunidades o
      where o.correduria_id = ${correduriaId}::uuid
        and o.estado::text in (${Prisma.join([...ESTADOS_OPORTUNIDAD_ABIERTA])})
        and o.fecha_fin_vigencia is null`)
    .then((r) => Number(r[0]?.n ?? 0))
    .catch(() => null)
  const truncado = filas.length > MAX_FILAS
  const porId = new Map(filas.slice(0, MAX_FILAS).map((f) => [f.id, f]))
  const avisos = avisosOportunidadDeHoy(
    [...porId.values()].map((f) => ({ id: f.id, estado: f.estado, fechaFinVigencia: dia(f.fechaFin), aparcadaHasta: dia(f.aparcadaHasta) })),
    new Set(),
    hoy,
  )
  const oportunidades = avisos.map((a) => {
    const f = porId.get(a.id)!
    const aseg = f.aseguradora && !/^\(?legacy\)?$/i.test(f.aseguradora) ? f.aseguradora : null
    return {
      id: a.id, clienteId: f.clienteId, cliente: f.cliente ?? '(sin nombre)', ramo: f.ramo,
      aseguradora: aseg, vence: a.vence, dias: a.dias, fueCliente: f.fueCliente,
    }
  })
  return { oportunidades, truncado, sinVencimiento }
}
