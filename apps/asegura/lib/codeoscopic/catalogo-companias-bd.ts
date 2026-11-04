// Persistencia de la instantánea del catálogo por compañía (`seguros.codeoscopic_catalogo`, SQL
// 2026-11-04f). Impuro (BD). Fail-closed: sin la tabla, `hayCatalogo()` es false y la ruta da 503.
//
// 🔒 Aislamiento: el catálogo depende de la ORGANIZACIÓN de Avant2 (credenciales de la correduría), así
// que cada fila lleva `correduria_id` y toda sentencia filtra por él (cepo regression-asegura-aislamiento).
// Sin datos personales: es catálogo (ramos, compañías, productos, configs, formas de pago).

import { randomUUID } from 'node:crypto'
import { prisma } from '../tenant.ts'
import { esquema } from '../esquema-bd.ts'
import type { FilaCatalogo } from './catalogo-companias.ts'

export const hayCatalogo = () => esquema.existeTabla('codeoscopic_catalogo')

/** Inserta TODA la instantánea en una sola sentencia (atómica): o están todas las filas, o ninguna. */
export async function guardarInstantanea(correduriaId: string, filas: FilaCatalogo[]): Promise<{ instantaneaId: string; filas: number }> {
  const instantaneaId = randomUUID()
  const json = JSON.stringify(filas)
  const n = await prisma.$executeRaw`
    insert into seguros.codeoscopic_catalogo
      (instantanea_id, correduria_id, tipo, fuente, ramo, vendor_id, vendor_nombre, producto_id, producto_nombre, configs, broker_fee, extra)
    select ${instantaneaId}::uuid, ${correduriaId}::uuid, x.tipo, x.fuente, x.ramo, x.vendor_id, x.vendor_nombre, x.producto_id,
           x.producto_nombre, x.configs, x.broker_fee, coalesce(x.extra, '{}'::jsonb)
      from jsonb_to_recordset(${json}::jsonb) as x(
        tipo text, fuente text, ramo text, vendor_id text, vendor_nombre text, producto_id text, producto_nombre text,
        configs jsonb, broker_fee jsonb, extra jsonb)`
  return { instantaneaId, filas: Number(n) }
}

export type FilaGuardada = Omit<FilaCatalogo, 'configs' | 'broker_fee'> & {
  configs: unknown[] | null
  broker_fee: unknown[] | null
  instantanea_id: string
  fecha: Date
}

/** Las filas de la ÚLTIMA instantánea de esta correduría (vacío = aún no se ha sacado ninguna). */
export async function leerUltimaInstantanea(correduriaId: string): Promise<FilaGuardada[]> {
  return prisma.$queryRaw<FilaGuardada[]>`
    with ultima as (
      select instantanea_id from seguros.codeoscopic_catalogo
       where correduria_id = ${correduriaId}::uuid
       order by fecha desc limit 1)
    select c.instantanea_id::text as instantanea_id, c.fecha, c.tipo, c.fuente, c.ramo, c.vendor_id, c.vendor_nombre,
           c.producto_id, c.producto_nombre, c.configs, c.broker_fee, c.extra
      from seguros.codeoscopic_catalogo c
      join ultima u on u.instantanea_id = c.instantanea_id
     where c.correduria_id = ${correduriaId}::uuid
     order by c.tipo, c.ramo nulls first, c.vendor_nombre nulls last, c.producto_nombre nulls last`
}
