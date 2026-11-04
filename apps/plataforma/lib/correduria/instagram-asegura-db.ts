// BD de los borradores de Instagram de Grupo ASegura (`asegura_instagram_borradores`,
// migración `prisma/sql/2026-11-04_asegura_instagram_borradores.sql`). Solo SQL: la lógica
// vive en `instagram-asegura.ts` (pura, con test).
//
// Toda query filtra por `cuenta_id` (la del libro de la correduría, `cuentaDelLibro()`).
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { EstadoIg, PlantillaIg, TemaIg } from './instagram-asegura'

export type FilaIg = {
  id: string
  estado: EstadoIg
  plantilla: PlantillaIg
  tema: TemaIg
  titulo: string
  sub: string
  puntos: string[]
  caption: string
  image_url: string | null
  motivo: string | null
  intentos: number
  telegram_msg_id: number | null
  ig_post_id: string | null
  creado_at: Date
  decidido_at: Date | null
  publicado_at: Date | null
}

/** `true` si el error es «la tabla no existe» (migración sin aplicar). */
export function esSinMigracion(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /asegura_instagram_borradores/.test(m) && /(does not exist|42P01|no existe)/i.test(m)
}

const COLS = Prisma.raw(`id::text AS id, estado, plantilla, tema, titulo, sub, puntos, caption, image_url, motivo,
  intentos::int AS intentos, telegram_msg_id::float8 AS telegram_msg_id, ig_post_id, creado_at, decidido_at, publicado_at`)

/** Los últimos temas y la última plantilla con pieza aceptada (para no repetir). */
export async function recientesIg(cuentaId: string): Promise<{ temas: string[]; ultimaPlantilla: string | null }> {
  const filas = await prisma.$queryRaw<Array<{ tema: string; plantilla: string }>>`
    SELECT tema, plantilla FROM asegura_instagram_borradores
    WHERE cuenta_id = ${cuentaId}::uuid AND estado <> 'rechazado_copy'
    ORDER BY creado_at DESC LIMIT 4`
  return { temas: filas.map((f) => f.tema), ultimaPlantilla: filas[0]?.plantilla ?? null }
}

/** Pendientes sin decidir hace más de `dias` → descartados (no se acumulan). Devuelve cuántos. */
export async function caducarPendientesIg(cuentaId: string, dias = 7): Promise<number> {
  return prisma.$executeRaw`
    UPDATE asegura_instagram_borradores
    SET estado = 'descartado', motivo = 'caducado sin decidir', decidido_at = now(), actualizado_at = now()
    WHERE cuenta_id = ${cuentaId}::uuid AND estado = 'pendiente'
      AND creado_at < now() - make_interval(days => ${dias}::int)`
}

export async function insertarIg(p: {
  cuentaId: string
  estado: 'pendiente' | 'rechazado_copy'
  plantilla: PlantillaIg
  tema: TemaIg
  titulo: string
  sub: string
  puntos: string[]
  caption: string
  motivo: string | null
  intentos: number
}): Promise<string> {
  const r = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO asegura_instagram_borradores
      (cuenta_id, estado, plantilla, tema, titulo, sub, puntos, caption, motivo, intentos, decidido_at)
    VALUES (${p.cuentaId}::uuid, ${p.estado}, ${p.plantilla}, ${p.tema}, ${p.titulo}, ${p.sub},
      ${JSON.stringify(p.puntos)}::jsonb, ${p.caption}, ${p.motivo}, ${p.intentos}::smallint,
      ${p.estado === 'rechazado_copy' ? new Date() : null})
    RETURNING id::text AS id`
  return r[0].id
}

export async function fijarImagenYMensajeIg(cuentaId: string, id: string, imageUrl: string, msgId: number | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE asegura_instagram_borradores
    SET image_url = ${imageUrl}, telegram_msg_id = ${msgId}::bigint, actualizado_at = now()
    WHERE id = ${id}::uuid AND cuenta_id = ${cuentaId}::uuid`
}

export async function leerIg(cuentaId: string, id: string): Promise<FilaIg | null> {
  const r = await prisma.$queryRaw<FilaIg[]>`
    SELECT ${COLS} FROM asegura_instagram_borradores WHERE id = ${id}::uuid AND cuenta_id = ${cuentaId}::uuid`
  return r[0] ?? null
}

/**
 * Lectura para la IMAGEN PÚBLICA. Solo piezas que han pasado el cepo: un `rechazado_copy`
 * o un `descartado` no se sirven nunca (su texto es justo el que no debe verse fuera).
 * El id es un UUID aleatorio: no sirve de índice. Sin `cuenta_id` a propósito: Instagram
 * no tiene sesión; el aislamiento lo da el id + el filtro de estado.
 */
export async function leerIgParaImagen(id: string): Promise<Pick<FilaIg, 'plantilla' | 'titulo' | 'sub' | 'puntos'> | null> {
  const r = await prisma.$queryRaw<Array<Pick<FilaIg, 'plantilla' | 'titulo' | 'sub' | 'puntos'>>>`
    SELECT plantilla, titulo, sub, puntos FROM asegura_instagram_borradores
    WHERE id = ${id}::uuid AND estado IN ('pendiente', 'publicando', 'aprobado_manual', 'publicado')`
  return r[0] ?? null
}

/**
 * Pasa de `desde` a `hasta` de forma ATÓMICA (doble pulsación = una sola transición).
 * Devuelve la fila si la transición ha sido de esta llamada; `null` si otro ya la hizo.
 */
export async function transicionIg(
  cuentaId: string, id: string, desde: EstadoIg, hasta: EstadoIg,
  extra: { motivo?: string | null; igPostId?: string | null } = {},
): Promise<FilaIg | null> {
  const ponerMotivo = extra.motivo !== undefined
  const r = await prisma.$queryRaw<FilaIg[]>`
    UPDATE asegura_instagram_borradores
       SET estado = ${hasta}, actualizado_at = now(),
           decidido_at = CASE WHEN ${hasta} IN ('publicando', 'pendiente') THEN decidido_at ELSE now() END,
           publicado_at = CASE WHEN ${hasta} = 'publicado' THEN now() ELSE publicado_at END,
           ig_post_id = COALESCE(${extra.igPostId ?? null}::text, ig_post_id),
           motivo = CASE WHEN ${ponerMotivo}::boolean THEN ${extra.motivo ?? null}::text ELSE motivo END
     WHERE id = ${id}::uuid AND cuenta_id = ${cuentaId}::uuid AND estado = ${desde}
     RETURNING ${COLS}`
  return r[0] ?? null
}

/** Últimas `limite` piezas (máx 50) para la pantalla Redes. */
export async function listarIg(cuentaId: string, limite = 50): Promise<FilaIg[]> {
  const n = Math.min(Math.max(1, Math.floor(limite)), 50)
  return prisma.$queryRaw<FilaIg[]>`
    SELECT ${COLS} FROM asegura_instagram_borradores
    WHERE cuenta_id = ${cuentaId}::uuid ORDER BY creado_at DESC LIMIT ${n}::int`
}
