/**
 * RGPD del borrador del enlace de datos (26/10/2026, revisión del PR #5068). El borrador (lo que el cliente teclea a
 * medias, CIFRADO) solo tiene sentido en una solicitud PENDIENTE y viva. Al completarla, al anularla (a mano, por
 * oportunidad cerrada o porque una nueva sustituye a la caducada) y al caducar, `borrador` y `borrador_at` pasan a NULL.
 *
 * Una sola sentencia con la condición de «muerta» en su propio WHERE (`estado <> 'pendiente'` o caducada): llamarla sobre
 * una pendiente viva no borra nada. CÓDIGO ANTES QUE SQL: sin las columnas (SQL `2026-10-26_solicitud_datos_borrador.sql`
 * sin aplicar) devuelve `sin_migracion` y NO lanza. Cualquier otro error, tampoco lanza (se registra): limpiar un borrador
 * nunca tumba una anulación ni una respuesta del cliente. Lo llama también la purga diaria (`/api/cron/purga-rgpd`).
 * Sin `import` de prisma (solo la forma): el cepo lo prueba con una BD falsa. El SQL no prefija el schema.
 */
import { esColumnaAusente } from './pg-error.ts'

export type DbBorradorPurga = { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => PromiseLike<number> }

export type FiltroBorradorPurga =
  /** Una solicitud concreta (al completarla o anularla). */
  | { id: string; correduriaId: string }
  /** Las de una persona en una oportunidad (la caducada que se acaba de anular al crear otra). */
  | { oportunidadId: string; clienteId: string; correduriaId: string }
  /** Todas las muertas de la correduría (purga diaria). */
  | { correduriaId: string }

export type ResultadoBorradorPurga = { estado: 'ok'; limpiados: number } | { estado: 'sin_migracion' } | { estado: 'error' }

export async function limpiarBorradoresMuertos(db: DbBorradorPurga, f: FiltroBorradorPurga): Promise<ResultadoBorradorPurga> {
  try {
    let n: number
    if ('id' in f) {
      n = await db.$executeRaw`
        update solicitud_datos set borrador = null, borrador_at = null
        where id = ${f.id}::uuid and correduria_id = ${f.correduriaId}::uuid
          and (borrador is not null or borrador_at is not null)
          and (estado <> 'pendiente' or caduca_at <= now())`
    } else if ('oportunidadId' in f) {
      n = await db.$executeRaw`
        update solicitud_datos set borrador = null, borrador_at = null
        where oportunidad_id = ${f.oportunidadId}::uuid and cliente_id = ${f.clienteId}::uuid and correduria_id = ${f.correduriaId}::uuid
          and (borrador is not null or borrador_at is not null)
          and (estado <> 'pendiente' or caduca_at <= now())`
    } else {
      n = await db.$executeRaw`
        update solicitud_datos set borrador = null, borrador_at = null
        where correduria_id = ${f.correduriaId}::uuid
          and (borrador is not null or borrador_at is not null)
          and (estado <> 'pendiente' or caduca_at <= now())`
    }
    return { estado: 'ok', limpiados: n }
  } catch (e) {
    if (esColumnaAusente(e)) return { estado: 'sin_migracion' }
    console.warn('[solicitud-borrador] no se pudo limpiar el borrador:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  }
}
