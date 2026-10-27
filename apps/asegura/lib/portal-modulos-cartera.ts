// SQL de los módulos del portal de UN cliente (puerto de operador). Las reglas son puras:
// `portal-modulos-operador.ts`. Tabla: `seguros.portal_modulo` (`apps/asegura-portal/prisma/sql/2026-10-22_portal_modulos.sql`);
// la escritura necesita el GRANT de `prisma/sql/2026-10-24_portal_modulos_operador.sql`.
//
// Sin modelo en `asegura.prisma`: SQL crudo con el schema explícito. La ficha se acota SIEMPRE por correduría.
//
// 27/10/2026 (Alberto): activar = AUTORIZAR; ya no se cuenta ninguna póliza. Y una identidad SIN ficha que ha pedido un
// módulo se activa por `identidadId` (`escribirModuloPorIdentidad`): ficha de prospecto + vínculo `autorizacion_corredor`.
// Ese vínculo necesita `prisma/sql/2026-10-27_portal_acceso_por_autorizacion.sql`; sin él, 503 `sin_migracion` y NO se
// escribe nada (la transacción entera vuelve atrás).
import { IDENTIDAD_CORREDOR_ID, ORIGEN_VINCULO_AUTORIZACION, ORIGEN_VINCULO_CORREDOR } from '@central/module-seguros-portal'

import { prismaAsegura } from './asegura-db'
import { Prisma } from './generated/asegura-client'
import {
  decidirProspecto,
  fichaProspecto,
  fichasModulos,
  identidadesQueActivan,
  planDeEscritura,
  puedeActivar,
  textoHistorialModulo,
  textoHistorialProspecto,
  type ContextoActivacion,
  type FichaModuloOperador,
  type FilaModuloCliente,
  type ModuloPortal,
  type VinculoDeFicha,
} from './portal-modulos-operador'

type Lectura = { identidades: string[]; filas: FilaModuloCliente[] }

async function leer(correduriaId: string, clienteId: string): Promise<Lectura> {
  const db = prismaAsegura()
  const vinc = await db.$queryRaw<VinculoDeFicha[]>`
    select identidad_id::text as "identidadId", nivel, origen from portal_vinculo
     where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid`
  // Sin la vista temporal del corredor ni vínculos que no operan: la misma regla que el portal (`accesosPatrimonio`).
  const identidades = identidadesQueActivan(vinc)
  const filas = identidades.length === 0 ? [] : await db.$queryRaw<FilaModuloCliente[]>`
    select id::text as id, identidad_id::text as "identidadId", modulo, estado
      from portal_modulo where identidad_id = any(${identidades}::uuid[])`
  return { identidades, filas }
}

/** Lo que pinta la ficha. Un fallo de lectura se propaga (la ruta lo clasifica): nunca «sin módulos». */
export async function modulosDeFicha(
  correduriaId: string,
  clienteId: string,
): Promise<{ identidades: number; modulos: FichaModuloOperador[] }> {
  const l = await leer(correduriaId, clienteId)
  const ctx: ContextoActivacion = { identidades: l.identidades.length }
  return { identidades: l.identidades.length, modulos: fichasModulos(l.filas, ctx)! }
}

export type ResultadoEscritura =
  | { ok: true; cambios: number; clienteId?: string }
  | { ok: false; status: 404 | 409 | 422; estado: 'no_encontrado' | 'no_permitido'; motivo: string }
  | { ok: false; status: 503; estado: 'sin_migracion'; motivo: string }

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
    const d = puedeActivar({ identidades: l.identidades.length })
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

const MOTIVO_SIN_MIGRACION =
  'Falta aplicar en la base prisma/sql/2026-10-27_portal_acceso_por_autorizacion.sql (origen de vínculo «autorizacion_corredor»). ' +
  'No se ha creado ninguna ficha ni activado nada.'

/** ¿El CHECK de `portal_vinculo.origen` ya admite el origen nuevo? Lee el catálogo (lo puede leer cualquier rol). */
async function checkOrigenAplicado(): Promise<boolean> {
  const filas = await prismaAsegura().$queryRaw<{ def: string }[]>`
    select pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'seguros' and t.relname = 'portal_vinculo' and c.conname = 'portal_vinculo_origen_check'`
  return filas.some((f) => f.def.includes(ORIGEN_VINCULO_AUTORIZACION))
}

/** El CHECK rechazó el origen (SQL sin aplicar entre la comprobación y la escritura): se dice igual que arriba. */
function esViolacionDelCheck(e: unknown): boolean {
  const t = e instanceof Error ? e.message : String(e)
  return /portal_vinculo_origen_check|23514/.test(t)
}

class NoPermitido extends Error {
  constructor(readonly status: 409, readonly motivo: string) {
    super(motivo)
  }
}

/**
 * Activa un módulo a una identidad del portal SIN ficha (27/10/2026). En UNA transacción, con candado por identidad (el
 * doble clic es el caso normal): vuelve a comprobar que la identidad pidió ESE módulo y no tiene ficha, crea la ficha de
 * prospecto, el vínculo `gestionar`/`autorizacion_corredor`, activa la fila y deja DOS líneas en `historial_interno` (la
 * ficha nueva y el módulo). Si algo falla, no queda nada a medias.
 */
export async function escribirModuloPorIdentidad(
  correduriaId: string,
  identidadId: string,
  modulo: ModuloPortal,
  actor: string,
): Promise<ResultadoEscritura> {
  if (!(await checkOrigenAplicado())) return { ok: false, status: 503, estado: 'sin_migracion', motivo: MOTIVO_SIN_MIGRACION }
  const db = prismaAsegura()
  try {
    const clienteId = await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`portal-prospecto:${identidadId}`}))`)
      const [ident] = await tx.$queryRaw<{ nombre: string | null }[]>`
        select nombre from portal_identidad where id = ${identidadId}::uuid`
      if (!ident) throw new NoPermitido(409, 'Esa identidad del portal no existe.')
      const [fila] = await tx.$queryRaw<{ id: string; estado: string }[]>`
        select id::text as id, estado from portal_modulo
         where identidad_id = ${identidadId}::uuid and modulo = ${modulo} and estado <> 'retirado'
         order by solicitado_en desc limit 1`
      const [v] = await tx.$queryRaw<{ n: number }[]>`
        select count(*)::int as n from portal_vinculo
         where identidad_id = ${identidadId}::uuid and origen <> ${ORIGEN_VINCULO_CORREDOR}`
      const d = decidirProspecto({
        filaVigente: fila ? (fila.estado === 'activo' ? 'activo' : 'solicitado') : null,
        vinculosPropios: v?.n ?? 0,
        esCorredor: identidadId === IDENTIDAD_CORREDOR_ID,
      })
      if (!d.crear) throw new NoPermitido(d.status, d.motivo)

      const p = fichaProspecto(ident.nombre)
      const creada = await tx.cliente.create({
        data: { correduriaId, nombre: p.nombre, apellidos: p.apellidos, tipo: p.tipo, segmento: p.segmento, fuente: p.fuente, activo: p.activo, notas: p.notas },
        select: { id: true },
      })
      await tx.$executeRaw`
        insert into portal_vinculo (identidad_id, correduria_id, cliente_id, nivel, origen)
        values (${identidadId}::uuid, ${correduriaId}::uuid, ${creada.id}::uuid, 'gestionar', ${ORIGEN_VINCULO_AUTORIZACION})`
      await tx.$executeRaw`
        update portal_modulo set estado = 'activo', activado_en = now()
         where id = ${fila!.id}::uuid and estado = 'solicitado'`
      await tx.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${creada.id}::uuid, cast('gestion' as tipo_historial_interno), ${textoHistorialProspecto(modulo, actor)})`
      await tx.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, tipo, texto)
        values (${correduriaId}::uuid, ${creada.id}::uuid, cast('gestion' as tipo_historial_interno), ${textoHistorialModulo(modulo, 'activar', actor)})`
      return creada.id
    })
    return { ok: true, cambios: 1, clienteId }
  } catch (e) {
    if (e instanceof NoPermitido) return { ok: false, status: e.status, estado: 'no_permitido', motivo: e.motivo }
    if (esViolacionDelCheck(e)) return { ok: false, status: 503, estado: 'sin_migracion', motivo: MOTIVO_SIN_MIGRACION }
    throw e
  }
}
