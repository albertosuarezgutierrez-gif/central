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
import { claveParNoDuplicado } from '@central/module-seguros'
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
