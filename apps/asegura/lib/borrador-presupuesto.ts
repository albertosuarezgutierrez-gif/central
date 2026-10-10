/**
 * Borrador de presupuesto EN SERVIDOR (05/10/2026): lo tecleado en una pantalla de presupuesto de
 * plataforma (auto nuevo) se conserva aunque se cierre el navegador o se cambie de equipo. El
 * `localStorage` de plataforma sigue siendo la primera línea; esto es la segunda.
 *
 * - NO crea oportunidades ni toca `estado_comercial`: la oportunidad nace al pagar.
 * - NO es cartera: no deja fila en `historial_interno` (sería una nota cada dos segundos de algo que
 *   nadie ha confirmado). El puerto sí lo audita (`auditado()`), solo ids.
 * - `datos` va CIFRADO (`encryptField`): lleva DNI, nombre y fechas de nacimiento tecleados.
 * - Un guardado más VIEJO que el que hay no lo pisa (`where guardado_en <= excluded.guardado_en`).
 * - El cliente y la oportunidad tienen que ser de la correduría: si no, no se escribe nada.
 *
 * El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.
 */
import { decryptField, encryptField } from '@central/module-seguros-pii'
import { prismaAsegura } from './asegura-db'
import { marcaCreible, type BorradorEntrante, type RamoBorrador } from './borrador-presupuesto-reglas'

export type BorradorGuardado = {
  oportunidadId: string | null
  /** `null` = la fila existe pero no se ha podido descifrar (≠ «no hay borrador»). */
  datos: Record<string, unknown> | null
  /** Cuándo se tecleó (ms). */
  guardadoEn: number
}

function descifrar(c: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(decryptField(c))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Todos los borradores del cliente en ese ramo (uno por oportunidad, y el «sin oportunidad»). */
export async function leerBorradores(correduriaId: string, clienteId: string, ramo: RamoBorrador): Promise<BorradorGuardado[]> {
  const filas = await prismaAsegura().$queryRaw<{ oportunidadId: string | null; datos: string; guardadoEn: Date }[]>`
    select oportunidad_id::text as "oportunidadId", datos_cifrados as datos, guardado_en as "guardadoEn"
    from borradores_presupuesto
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid and ramo = ${ramo}
    order by guardado_en desc
    limit 20`
  return filas.map((f) => ({ oportunidadId: f.oportunidadId, datos: descifrar(f.datos), guardadoEn: f.guardadoEn.getTime() }))
}

export type ResultadoGuardar =
  | { ok: true; guardadoEn: number; aplicado: boolean }
  | { ok: false; estado: 'no_encontrado'; motivo: string; status: 404 }

/**
 * Upsert. `aplicado: false` = ya había uno MÁS RECIENTE y se ha dejado (no es un error: la pantalla
 * que mandó el viejo recargará el bueno la próxima vez que abra).
 */
export async function guardarBorradorPresupuesto(correduriaId: string, b: BorradorEntrante, ahora = Date.now()): Promise<ResultadoGuardar> {
  const marca = new Date(marcaCreible(b.guardadoEn, ahora))
  const cifrado = encryptField(JSON.stringify(b.datos))
  // El insert sale de un SELECT que exige que cliente (y oportunidad, si la hay) sean de ESTA
  // correduría: un id ajeno no inserta nada (0 filas) y se distingue abajo.
  const filas = await prismaAsegura().$queryRaw<{ guardadoEn: Date }[]>`
    insert into borradores_presupuesto
      (correduria_id, cliente_id, oportunidad_id, ramo, datos_cifrados, guardado_en, actualizado_por)
    select ${correduriaId}::uuid, c.id, ${b.oportunidadId}::uuid, ${b.ramo}, ${cifrado}, ${marca}, ${b.actor}
    from clientes c
    where c.id = ${b.clienteId}::uuid and c.correduria_id = ${correduriaId}::uuid
      and (${b.oportunidadId}::uuid is null or exists (
        select 1 from oportunidades o
        where o.id = ${b.oportunidadId}::uuid and o.correduria_id = ${correduriaId}::uuid and o.cliente_id = c.id))
    on conflict (correduria_id, cliente_id, ramo, coalesce(oportunidad_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set datos_cifrados = excluded.datos_cifrados, guardado_en = excluded.guardado_en,
                  actualizado_por = excluded.actualizado_por, actualizado_en = now()
      where borradores_presupuesto.guardado_en <= excluded.guardado_en
    returning guardado_en as "guardadoEn"`
  if (filas.length > 0) return { ok: true, guardadoEn: filas[0].guardadoEn.getTime(), aplicado: true }
  // 0 filas: o el cliente/oportunidad no es de la correduría, o había uno más reciente.
  const hay = await prismaAsegura().$queryRaw<{ guardadoEn: Date }[]>`
    select guardado_en as "guardadoEn" from borradores_presupuesto
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${b.clienteId}::uuid and ramo = ${b.ramo}
      and oportunidad_id is not distinct from ${b.oportunidadId}::uuid`
  if (hay.length > 0) return { ok: true, guardadoEn: hay[0].guardadoEn.getTime(), aplicado: false }
  return { ok: false, estado: 'no_encontrado', motivo: 'cliente u oportunidad no encontrados en la correduría', status: 404 }
}

/** Al pagar con éxito. Borra el de ESA oportunidad (o el «sin oportunidad»). Devuelve cuántos. */
export async function borrarBorradorPresupuesto(
  correduriaId: string,
  clienteId: string,
  ramo: RamoBorrador,
  oportunidadId: string | null,
): Promise<number> {
  return prismaAsegura().$executeRaw`
    delete from borradores_presupuesto
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid and ramo = ${ramo}
      and oportunidad_id is not distinct from ${oportunidadId}::uuid`
}
