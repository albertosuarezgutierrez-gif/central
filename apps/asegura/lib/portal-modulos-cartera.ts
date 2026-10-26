// SQL de los módulos del portal de UN cliente (puerto de operador). Las reglas son puras:
// `portal-modulos-operador.ts`. Tabla: `seguros.portal_modulo` (`apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql`);
// la escritura necesita el GRANT de `prisma/sql/2026-10-24_portal_modulos_operador.sql`.
//
// Sin modelo en `asegura.prisma`: SQL crudo con el schema explícito. La ficha se acota SIEMPRE por correduría.
import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import { sqlCarteraEnVigor } from '@central/module-seguros'
import {
  fichasModulos,
  planDeEscritura,
  puedeActivar,
  textoHistorialModulo,
  type ContextoActivacion,
  type FichaModuloOperador,
  type FilaModuloCliente,
  type ModuloPortal,
} from './portal-modulos-operador'

type Lectura = { identidades: string[]; filas: FilaModuloCliente[]; polizasEnVigor: number }

async function leer(correduriaId: string, clienteId: string): Promise<Lectura> {
  const db = prismaAsegura()
  const vinc = await db.$queryRaw<{ id: string }[]>`
    select identidad_id::text as id from portal_vinculo
     where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid`
  const identidades = [...new Set(vinc.map((v) => v.id))]
  const filas = identidades.length === 0 ? [] : await db.$queryRaw<FilaModuloCliente[]>`
    select id::text as id, identidad_id::text as "identidadId", modulo, estado
      from portal_modulo where identidad_id = any(${identidades}::uuid[])`
  const pol = await db.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from polizas p
     where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
       and p.merged_into_poliza_id is null and ${Prisma.raw(sqlCarteraEnVigor('p'))}`
  return { identidades, filas, polizasEnVigor: pol[0]?.n ?? 0 }
}

/** Lo que pinta la ficha. Un fallo de lectura se propaga (la ruta lo clasifica): nunca «sin módulos». */
export async function modulosDeFicha(
  correduriaId: string,
  clienteId: string,
): Promise<{ identidades: number; polizasEnVigor: number; modulos: FichaModuloOperador[] }> {
  const l = await leer(correduriaId, clienteId)
  const ctx: ContextoActivacion = { identidades: l.identidades.length, polizasEnVigor: l.polizasEnVigor }
  return { identidades: l.identidades.length, polizasEnVigor: l.polizasEnVigor, modulos: fichasModulos(l.filas, ctx)! }
}

export type ResultadoEscritura =
  | { ok: true; cambios: number }
  | { ok: false; status: 404 | 409 | 422; estado: 'no_encontrado' | 'no_permitido'; motivo: string }

/** Activa/retira. El servidor RE-decide (el botón no manda) y deja una línea en `historial_interno`. */
export async function escribirModulo(
  correduriaId: string,
  clienteId: string,
  modulo: ModuloPortal,
  accion: 'activar' | 'retirar',
  actor: string,
): Promise<ResultadoEscritura> {
  const db = prismaAsegura()
  const ficha = await db.cliente.findFirst({ where: { id: clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true } })
  if (!ficha) return { ok: false, status: 404, estado: 'no_encontrado', motivo: 'La ficha no está en la correduría.' }
  const l = await leer(correduriaId, clienteId)
  if (accion === 'activar') {
    const d = puedeActivar(modulo, { identidades: l.identidades.length, polizasEnVigor: l.polizasEnVigor })
    if (!d.puede) return { ok: false, status: 409, estado: 'no_permitido', motivo: d.motivo }
  }
  const ops = planDeEscritura(accion, modulo, l.identidades, l.filas)
  if (ops.length === 0) return { ok: true, cambios: 0 }
  await db.$transaction(async (tx) => {
    for (const op of ops) {
      if (op.tipo === 'insertar_activo') {
        await tx.$executeRaw`
          insert into portal_modulo (identidad_id, modulo, estado, activado_en, origen)
          values (${op.identidadId}::uuid, ${modulo}, 'activo', now(), 'corredor')`
      } else if (op.tipo === 'activar') {
        await tx.$executeRaw`
          update portal_modulo set estado = 'activo', activado_en = now()
           where id = ${op.filaId}::uuid and estado = 'solicitado'`
      } else {
        await tx.$executeRaw`
          update portal_modulo set estado = 'retirado', retirado_en = now()
           where id = ${op.filaId}::uuid and estado <> 'retirado'`
      }
    }
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${textoHistorialModulo(modulo, accion, actor)})`
  })
  return { ok: true, cambios: ops.length }
}

/**
 * Pólizas EN VIGOR por ficha (para la cola «Solicitudes del portal»). `null` = no se ha podido contar (NUNCA «0»);
 * una ficha sin pólizas en vigor sale con 0.
 */
export async function polizasEnVigorPorCliente(correduriaId: string, clienteIds: string[]): Promise<Map<string, number> | null> {
  const ids = [...new Set(clienteIds)]
  if (ids.length === 0) return new Map()
  try {
    const db = prismaAsegura()
    const filas = await db.$queryRaw<{ id: string; n: number }[]>`
      select p.cliente_id::text as id, count(*)::int as n from polizas p
       where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = any(${ids}::uuid[])
         and p.merged_into_poliza_id is null and ${Prisma.raw(sqlCarteraEnVigor('p'))}
       group by p.cliente_id`
    const m = new Map<string, number>(ids.map((i) => [i, 0]))
    for (const f of filas) m.set(f.id, f.n)
    return m
  } catch {
    return null
  }
}
