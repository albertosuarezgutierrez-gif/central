/**
 * Pares de pólizas que una persona ha decidido que NO son duplicadas
 * (`seguros.poliza_no_duplicado`, mig 0108 del repo asegura, 04/10/2026).
 *
 * Los leen la pantalla de duplicadas (`duplicadasCartera`) y el vigía de la
 * ingesta (`leerIngesta`) para no volver a enseñar un par ya decidido. La clave
 * es `claveParNoDuplicado` de `@central/module-seguros` (ids ordenados).
 *
 * Tres resultados, y no se colapsan:
 *   · `Set` con pares → lo que hay marcado.
 *   · `Set` VACÍO si la tabla NO EXISTE (migración aún sin aplicar): sin tabla
 *     nadie ha podido marcar nada, así que «ningún par marcado» es la verdad,
 *     no un supuesto. Sin esto, el vigía estaría en «a medias» hasta aplicarla.
 *   · `null` ante cualquier OTRO fallo (permisos, red…): no se sabe qué está
 *     marcado. Quien llama lo declara como «no se ha podido comprobar».
 */
import { claveParNoDuplicado, paresNoDuplicado } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { esTablaAusente } from './pg-error'

/**
 * Con `correduriaId`, solo las marcas de esa correduría (la pantalla). Sin él,
 * todas (el vigía, que agrupa ya por correduría): la clave son dos uuids de
 * póliza, así que una marca de otra correduría no puede casar con un grupo ajeno.
 */
export async function leerParesNoDuplicado(correduriaId?: string): Promise<Set<string> | null> {
  try {
    const db = prismaAsegura()
    const filas = correduriaId
      ? await db.$queryRaw<Array<{ a: string; b: string }>>`
          SELECT poliza_a_id::text AS a, poliza_b_id::text AS b FROM poliza_no_duplicado
          WHERE correduria_id = ${correduriaId}::uuid`
      : await db.$queryRaw<Array<{ a: string; b: string }>>`
          SELECT poliza_a_id::text AS a, poliza_b_id::text AS b FROM poliza_no_duplicado`
    const out = new Set<string>()
    for (const f of filas) {
      const k = claveParNoDuplicado(f.a, f.b)
      if (k !== null) out.add(k)
    }
    return out
  } catch (e) {
    return esTablaAusente(e) ? new Set() : null
  }
}

// ── Marcar «no es duplicado» ────────────────────────────────────────────────

export type ResultadoMarca =
  | { status: 200; estado: 'ok'; pares: number; nuevos: number }
  | { status: 400; estado: 'error'; motivo: 'pocas_polizas' | 'demasiadas_polizas' | 'poliza_desconocida' | 'no_es_un_grupo' }
  /** La tabla no existe: la 0108 del repo asegura no está aplicada. NUNCA se responde éxito. */
  | { status: 503; estado: 'error'; motivo: 'migracion_pendiente' }

/**
 * Marca TODOS los pares del grupo `ids` como «no duplicado», en una transacción.
 * Revalida en la BD que los ids son fichas sin fusionar de ESTA correduría y que
 * forman un único grupo con el criterio de la pantalla (`paresNoDuplicado`).
 * Idempotente: un par ya marcado no se pisa (se conserva quién y por qué lo
 * decidió primero). Lanza ante cualquier fallo que no sea la tabla ausente.
 */
export async function marcarNoDuplicado(correduriaId: string, ids: readonly string[], motivo: string, decididoPor: string): Promise<ResultadoMarca> {
  const db = prismaAsegura()
  const unicos = [...new Set(ids)].slice(0, 50)
  const filas = await db.$queryRaw<Array<{ id: string; correduria_id: string; numero_poliza: string | null; codigo_entidad_dgs: string | null }>>`
    SELECT id::text AS id, correduria_id::text AS correduria_id, numero_poliza, codigo_entidad_dgs
    FROM polizas
    WHERE correduria_id = ${correduriaId}::uuid
      AND merged_into_poliza_id IS NULL
      AND id::text = ANY(${unicos}::text[])`
  const r = paresNoDuplicado(unicos, filas.map((f) => ({ id: f.id, correduriaId: f.correduria_id, numeroPoliza: f.numero_poliza, codigoEntidadDgs: f.codigo_entidad_dgs })))
  if (!r.ok) return { status: 400, estado: 'error', motivo: r.motivo }
  try {
    const nuevos = await db.$transaction(async (tx) => {
      let n = 0
      for (const [a, b] of r.pares) {
        n += await tx.$executeRaw`
          INSERT INTO poliza_no_duplicado (correduria_id, poliza_a_id, poliza_b_id, motivo, decidido_por)
          VALUES (${correduriaId}::uuid, ${a}::uuid, ${b}::uuid, ${motivo}, ${decididoPor})
          ON CONFLICT (poliza_a_id, poliza_b_id) DO NOTHING`
      }
      return n
    })
    return { status: 200, estado: 'ok', pares: r.pares.length, nuevos }
  } catch (e) {
    if (esTablaAusente(e)) return { status: 503, estado: 'error', motivo: 'migracion_pendiente' }
    throw e
  }
}
