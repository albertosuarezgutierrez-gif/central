/**
 * «Pasar la oportunidad a…» (29/09/2026, diseño docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md §2-§3).
 *
 * La oportunidad NO cambia de dueño por probar otra persona como tomador: eso es una variante. Solo
 * cuando de verdad pasa a llevarla otro (el hijo se queda el coche y es él quien trata con Alberto)
 * se traspasa, y es esta acción aparte, con su rastro en `oportunidad_historial`.
 *
 * Reglas (con BYPASSRLS, el aislamiento es cosa de este código):
 * - La oportunidad y el cliente nuevo, de ESTA correduría.
 * - El cliente nuevo, vivo (no fusionado en otra ficha).
 * - La oportunidad, ABIERTA (`ESTADOS_ABIERTA`): una cerrada es historia y no se reasigna.
 * - Distinto del actual: traspasar a quien ya la lleva no es un cambio y no deja rastro.
 *
 * Qué NO se toca, a propósito:
 * - `oportunidad_figura`: si había una fila `tomador` explícita, se queda como está. Las variantes ya
 *   cotizadas llevan su propio tomador (`tarificaciones.cliente_id`) y son historia.
 * - Efecto que hay que saber: `leerRiesgo` pinta como tomador POR DEFECTO a quien lleva la oportunidad
 *   cuando no hay fila `tomador`. Así que, sin fila explícita, tras el traspaso el tomador por defecto
 *   de la PRÓXIMA variante pasa a ser el cliente nuevo (lo normal: pasa a llevarla él). Con fila
 *   explícita, el tomador sigue siendo el que se eligió, aunque fuera el cliente viejo.
 * - Los vínculos que pinta el riesgo se calculan contra quien lleva la oportunidad: tras el traspaso,
 *   son los del cliente nuevo.
 */
import { prisma } from '@/lib/tenant'
import { ESTADOS_ABIERTA } from './codeoscopic/oportunidad-presupuesto-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResultadoTraspaso = { ok: true } | { ok: false; status: number; motivo: string }

export async function traspasarOportunidad(
  correduriaId: string,
  e: { oportunidadId: string; nuevoClienteId: string; actor: string },
): Promise<ResultadoTraspaso> {
  if (!UUID.test(e.oportunidadId) || !UUID.test(e.nuevoClienteId)) return { ok: false, status: 400, motivo: 'ids no válidos' }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`oportunidad-traspaso:${e.oportunidadId}`}))`
    const [op] = await tx.$queryRaw<Array<{ cliente_id: string; estado: string }>>`
      select cliente_id::text as cliente_id, estado::text as estado from seguros.oportunidades
      where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
      for update`
    if (!op) return { ok: false as const, status: 404, motivo: 'la oportunidad no es de esta correduría' }
    if (!(ESTADOS_ABIERTA as readonly string[]).includes(op.estado)) {
      return { ok: false as const, status: 409, motivo: 'la oportunidad está cerrada: no se puede pasar a otro' }
    }
    if (op.cliente_id === e.nuevoClienteId) return { ok: false as const, status: 409, motivo: 'ya la lleva ese cliente' }

    const [nuevo] = await tx.$queryRaw<Array<{ id: string }>>`
      select id::text as id from seguros.clientes
      where id = ${e.nuevoClienteId}::uuid and correduria_id = ${correduriaId}::uuid and merged_into_cliente_id is null`
    if (!nuevo) return { ok: false as const, status: 404, motivo: 'ese cliente no es de esta correduría o está fusionado en otra ficha' }

    const n = await tx.$executeRaw`
      update seguros.oportunidades set cliente_id = ${e.nuevoClienteId}::uuid, updated_at = now()
      where id = ${e.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
        and cliente_id = ${op.cliente_id}::uuid and estado::text = any(${[...ESTADOS_ABIERTA]}::text[])`
    if (n !== 1) return { ok: false as const, status: 409, motivo: 'la oportunidad ha cambiado mientras tanto: recarga' }

    await tx.$executeRaw`
      insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${e.oportunidadId}::uuid, 'oportunidad_traspasada',
              cast(${op.estado} as seguros.estado_comercial), cast(${op.estado} as seguros.estado_comercial),
              ${JSON.stringify({ de: op.cliente_id, a: e.nuevoClienteId })}::jsonb, ${e.actor})`
    return { ok: true as const }
  })
}
