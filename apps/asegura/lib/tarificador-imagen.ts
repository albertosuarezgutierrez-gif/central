// Imagen del bot del tarificador RPA desde la BD (27/10/2026) — la parte con BD. Reglas puras en `tarificador-imagen-reglas.ts`;
// SQL en `prisma/sql/2026-10-27_tarificador_imagen.sql`. La configuración es GLOBAL (una app de Fly para todo el tarificador,
// igual que la env que sustituye): no lleva `correduria_id` porque no contiene datos de ninguna correduría.
// Fail-safe: sin tabla o si la lectura falla → `null` y quien llama usa la env `TARIFICADOR_FLY_IMAGE` (comportamiento previo).

import { prisma } from './tenant'
import { hayImagenBot } from './esquema-bd'
import { decidirPublicarProduccion, type DecisionPublicar, type FilaImagen } from './tarificador-imagen-reglas'

/** La fila `produccion` tal cual (sin validar: la valida quien la usa). `null` = sin tabla, sin fila o lectura fallida. */
export async function leerFilaImagen(): Promise<FilaImagen | null> {
  try {
    if (!(await hayImagenBot())) return null
    const f = await prisma.$queryRaw<{ imagen: string | null; commit_at: Date | null; permitir_imagen_prueba: boolean | null }[]>`
      select imagen, commit_at, permitir_imagen_prueba from seguros.tarificador_imagen where clave = 'produccion'`
    const r = f[0]
    if (!r) return null
    return { imagen: r.imagen, commitAt: r.commit_at, permitirPrueba: r.permitir_imagen_prueba === true }
  } catch (e) {
    console.error('[tarificador-imagen] no se pudo leer la imagen de la BD: se usa la env', e instanceof Error ? e.message.slice(0, 200) : '')
    return null
  }
}

export type ResultadoPublicar =
  | { estado: 'publicada' | 'sin_cambios'; imagen: string; anterior: string | null }
  | { estado: 'rechazada'; status: 400 | 409; motivo: string }
  | { estado: 'sin_esquema' }

/**
 * Publica la imagen de PRODUCCIÓN (solo el workflow desde `main`, por el puerto). Una transacción con `for update` de la fila:
 * dos publicaciones a la vez no pueden saltarse la regla de «nunca una anterior».
 */
export async function publicarImagenProduccion(p: { imagen: unknown; commitAt: unknown; forzar: unknown; actor: string }): Promise<ResultadoPublicar> {
  if (!(await hayImagenBot())) return { estado: 'sin_esquema' }
  const quien = p.actor.slice(0, 200)
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ imagen: string; commit_at: Date | null }[]>`
      select imagen, commit_at from seguros.tarificador_imagen where clave = 'produccion' for update`
    const actual = filas[0] ? { imagen: filas[0].imagen, commitAt: filas[0].commit_at } : null
    const d: DecisionPublicar = decidirPublicarProduccion({ actual, imagen: p.imagen, commitAt: p.commitAt, forzar: p.forzar }, new Date())
    if (!d.ok) return { estado: 'rechazada' as const, status: d.status, motivo: d.motivo }
    if (!d.cambia) return { estado: 'sin_cambios' as const, imagen: d.imagen, anterior: actual?.imagen ?? null }
    await tx.$executeRaw`
      insert into seguros.tarificador_imagen (clave, imagen, commit_at, imagen_anterior, actualizada_at, actualizada_por)
      values ('produccion', ${d.imagen}, ${d.commitAt}, null, now(), ${quien})
      on conflict (clave) do update
        set imagen_anterior = seguros.tarificador_imagen.imagen, imagen = excluded.imagen, commit_at = excluded.commit_at,
            actualizada_at = now(), actualizada_por = excluded.actualizada_por`
    return { estado: 'publicada' as const, imagen: d.imagen, anterior: actual?.imagen ?? null }
  }, { timeout: 15000, maxWait: 10000 })
}
