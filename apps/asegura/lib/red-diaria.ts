// Lectura de la red diaria (12/10/2026). La clasificación es pura (`red-diaria-clasificar.ts`).
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { prismaAsegura } from './asegura-db'
import { retirarObsoletas, ORIGEN_RECIBO_DEVUELTO } from './aprobaciones'
import { CODIGO_DGS_ALLIANZ } from './canal-baja.ts'
import {
  clasificarAnulaciones, clasificarAprobaciones, type FilaAnulacion, type FilaAprobacion, type ItemAnulacion, type ItemAprobacion,
} from './red-diaria-clasificar.ts'

export type ItemReciboCaducado = { aprobacionId: string; clienteId: string; cliente: string | null; caduca: string; vencimiento: string | null }

export type RedDiaria = {
  aprobaciones: { porCaducar: ItemAprobacion[]; caducadas: ItemAprobacion[] }
  anulaciones: ItemAnulacion[]
  recibos: ItemReciboCaducado[]
}

export async function redDiaria(correduriaId: string, ahora: Date = new Date()): Promise<RedDiaria> {
  // Primero se retira lo caducado: lo que se lee es lo que «Hoy» enseñaría.
  await retirarObsoletas(correduriaId)
  const db = prismaAsegura()

  const aprob = await db.$queryRaw<(Omit<FilaAprobacion, 'cliente'> & { nombre: string | null })[]>`
    select a.id::text as id, a.accion, a.origen, a.cliente_id::text as "clienteId",
           nullif(trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))), '') as nombre,
           a.estado, a.caduca_at as caduca, a.decidida_por as "decididaPor", a.urgente
    from aprobacion a left join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid
      and ((a.estado = 'pendiente' and a.caduca_at < now() + interval '24 hours')
        or (a.estado = 'caducada' and a.decidida_por = 'sistema:caducidad' and a.caduca_at >= now() - interval '24 hours'))
    limit 200`

  const anul = await db.$queryRaw<(Omit<FilaAnulacion, 'cliente'> & { nombre: string | null })[]>`
    select a.id::text as "anulacionId", a.cliente_id::text as "clienteId",
           nullif(trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))), '') as nombre,
           coalesce(cd.nombre_comun, p.aseguradora) as compania, p.numero_poliza as "numeroPoliza", a.firmada_at as "firmadaAt",
           (a.carta_texto is not null) as "tieneCarta", (a.firma_id is not null) as "tieneFirma",
           (upper(trim(coalesce(p.codigo_entidad_dgs, ''))) = ${CODIGO_DGS_ALLIANZ}) as "esAllianz",
           (a.presupuesto_id is not null and not exists (select 1 from presupuesto pr where pr.id = a.presupuesto_id and pr.emitido_at is not null)) as "esperaEmision",
           coalesce((select array_agg(x.estado) from aprobacion x where x.anulacion_id = a.id), '{}') as "estadosAprobacion"
    from anulacion a
      join polizas p on p.id = a.poliza_id
      left join clientes c on c.id = a.cliente_id
      left join companias_dgs cd on cd.codigo_dgs = p.codigo_entidad_dgs
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'firmada' and a.comunicada_at is null
      and a.firmada_at is not null and a.firmada_at < now() - interval '48 hours'
    order by a.firmada_at
    limit 200`

  // Recibo cuya propuesta caducó y que SIGUE devuelto: el cliente no recibió el aviso y nadie lo ha vuelto a proponer.
  const rec = await db.$queryRaw<{ aprobacionId: string; clienteId: string; nombre: string | null; caduca: Date; clave: string }[]>`
    select a.id::text as "aprobacionId", a.cliente_id::text as "clienteId",
           nullif(trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))), '') as nombre, a.caduca_at as caduca, a.clave
    from aprobacion a
      join poliza_recibos r on r.id::text = split_part(a.clave, ':', 2)
      left join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid and a.origen = ${ORIGEN_RECIBO_DEVUELTO} and a.estado = 'caducada'
      and r.situacion::text = 'devuelto'
    order by a.caduca_at
    limit 100`

  return {
    aprobaciones: clasificarAprobaciones(aprob.map(({ nombre, ...f }) => ({ ...f, cliente: nombre })), ahora),
    anulaciones: clasificarAnulaciones(anul.map(({ nombre, ...f }) => ({ ...f, cliente: nombre })), ahora),
    recibos: rec.map((r) => {
      const v = r.clave.split(':')[2] ?? ''
      return { aprobacionId: r.aprobacionId, clienteId: r.clienteId, cliente: r.nombre, caduca: r.caduca.toISOString(), vencimiento: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null }
    }),
  }
}
