// PERMISOS DE NAVEGACIÓN del tarificador RPA (0.3.46) — la LECTURA de BD. Reglas puras en `tarificador-permisos-navegacion-reglas.ts`.
// Tabla global (sin correduria_id: describe la navegación de un portal, como `ENTRADAS_EXPLORACION`), SOLO lectura para la app.
// 🚨 Fail-closed: tabla ausente, BD caída o fila rara → 0 permisos (el worker hace lo de siempre). Nunca abre más que el código.

import { permisosNavegacionDe, resumenPermisos, type PermisosNavegacion } from '@central/module-tarificacion'
import { prisma } from './tenant'
import { entradasParaPermisos, permisosParaWorker, type ModoTrabajoPermisos } from './tarificador-permisos-navegacion-reglas'

/** Tope de filas leídas por trabajo (el validador corta además por entrada). */
const MAX_FILAS_LECTURA = 200

/** Filas ACTIVAS de esas entradas, crudas (sin validar). Cualquier error → `[]` (se avisa sin valores). */
export async function leerFilasPermisos(entradas: readonly string[]): Promise<unknown[]> {
  if (entradas.length === 0) return []
  try {
    return await prisma.$queryRaw<unknown[]>`
      select id::text as id, entrada, tipo, datos, activo
      from seguros.tarificador_permisos_navegacion
      where entrada = any(${[...entradas]}::text[]) and activo
      order by created_at, id
      limit ${MAX_FILAS_LECTURA}`
  } catch (e) {
    // 42P01 (sin la migración 2026-11-04d) o red: fail-closed, sin permisos.
    console.warn('[tarificador] permisos de navegación no legibles (se sigue solo con código):', e instanceof Error ? e.message.slice(0, 120) : 'error')
    return []
  }
}

/** Las filas validadas que viajan al worker con su trabajo (`null` = ninguna). Las ignoradas, al log con id y código. */
export async function permisosNavegacionParaWorker(modo: ModoTrabajoPermisos, t: { id: string; compania: string; ramo: string; entrada: string | null }): Promise<unknown[] | null> {
  const entradas = entradasParaPermisos(modo, t.compania, t.ramo, t.entrada)
  if (entradas.length === 0) return null
  const r = permisosParaWorker(modo, t, await leerFilasPermisos(entradas))
  if (r.ignorados.length > 0) console.warn('[tarificador] permisos de navegación ignorados', t.id, r.ignorados.map((x) => `${x.id ?? '?'}:${x.motivo}`).join(',').slice(0, 600))
  return r.filas
}

/** Los permisos validados de UNA entrada (validación del paso del explorador en asegura, la misma que hará el worker). */
export async function permisosNavegacionDeEntrada(entrada: string): Promise<PermisosNavegacion | null> {
  const r = permisosNavegacionDe(entrada, await leerFilasPermisos([entrada]))
  const s = resumenPermisos(r)
  return s.rutas + s.avances > 0 ? r.permisos : null
}
