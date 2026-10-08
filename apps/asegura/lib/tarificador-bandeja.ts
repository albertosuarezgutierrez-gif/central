// Bandeja «Necesita tu atención» del tarificador RPA (08/10/2026) — con BD. Todo por `correduria_id`.
// Reglas de estado y motivo legible: `@central/module-tarificacion` (`bandeja.ts`); proyección: `tarificador-bandeja-reglas.ts`.
import { decidirAccionBandeja, ESTADOS_BANDEJA, type AccionBandeja } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { proyectarItemBandeja, proyectarPaso, tipoDeError, yaEnElDestino, type FilaBandeja, type FilaPaso, type ItemBandeja, type PasoLectura } from './tarificador-bandeja-reglas'

export type ListaBandeja = { total: number; items: ItemBandeja[]; hayMas: boolean }

/** Trabajos que esperan a una persona (`requiere_humano`, `error_definitivo`), los más recientes primero. */
export async function listarBandeja(correduriaId: string, limite: number, desde: number): Promise<ListaBandeja> {
  const estados = [...ESTADOS_BANDEJA]
  const filas = await prisma.$queryRaw<FilaBandeja[]>`
    select id::text as id, compania, ramo, estado, intentos, error, oportunidad_id::text as oportunidad_id, bot_version,
           coalesce(terminado_at, updated_at) as fecha
    from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and estado = any(${estados}::text[])
    order by coalesce(terminado_at, updated_at) desc, id
    limit ${limite}::int offset ${desde}::int`
  const t = await prisma.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from seguros.tarificacion_trabajos
    where correduria_id = ${correduriaId}::uuid and estado = any(${estados}::text[])`
  const total = t[0]?.n ?? 0
  return { total, items: filas.map(proyectarItemBandeja), hayMas: desde + filas.length < total }
}

export type ResultadoAccion =
  | { estado: 'aplicado'; estadoTrabajo: string; compania: string }
  | { estado: 'sin_cambios'; estadoTrabajo: string }
  | { estado: 'conflicto'; motivo: string; estadoTrabajo: string }
  | { estado: 'no_encontrado' }

/**
 * Reintentar (→ `pendiente`) o cancelar (→ `cancelado`) un trabajo de la bandeja. `for update` + transición válida solo
 * desde los estados permitidos. IDEMPOTENTE: pedir el estado en el que ya está es `sin_cambios` (200), no un error — un
 * doble clic no encola dos veces. Reintentar pone los intentos a 0 (decisión de una persona, no reintento automático).
 */
export async function aplicarAccionBandeja(correduriaId: string, id: string, accion: AccionBandeja): Promise<ResultadoAccion> {
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ estado: string; error: unknown; compania: string }[]>`
      select estado, error, compania from seguros.tarificacion_trabajos
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid for update`
    const f = filas[0]
    if (!f) return { estado: 'no_encontrado' as const }
    if (yaEnElDestino(accion, f.estado)) return { estado: 'sin_cambios' as const, estadoTrabajo: f.estado }
    const d = decidirAccionBandeja(accion, f.estado, tipoDeError(f.error))
    if (!d.ok) return { estado: 'conflicto' as const, motivo: d.motivo, estadoTrabajo: f.estado }
    if (accion === 'reintentar') {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'pendiente', intentos = 0, lease_hasta = null, fly_machine_id = null, error = null,
            iniciado_at = null, terminado_at = null, updated_at = now()
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
    } else {
      await tx.$executeRaw`
        update seguros.tarificacion_trabajos
        set estado = 'cancelado', lease_hasta = null, terminado_at = coalesce(terminado_at, now()), updated_at = now()
        where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
    }
    return { estado: 'aplicado' as const, estadoTrabajo: d.a, compania: f.compania }
  })
}

export type TrazaTrabajo = { botVersion: string | null; pasos: PasoLectura[] }

/** Traza de un trabajo (pasos en orden) + versión del bot. `null` = el trabajo no es de esta correduría. */
export async function leerTrazaTrabajo(correduriaId: string, id: string): Promise<TrazaTrabajo | null> {
  const t = await prisma.$queryRaw<{ bot_version: string | null }[]>`
    select bot_version from seguros.tarificacion_trabajos where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!t[0]) return null
  const p = await prisma.$queryRaw<FilaPaso[]>`
    select intento, paso, inicio, duracion_ms, ok, error_codigo, captura_ref
    from seguros.tarificacion_trabajo_pasos
    where trabajo_id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
    order by intento, inicio, id`
  return { botVersion: t[0].bot_version, pasos: p.map(proyectarPaso) }
}
