/**
 * COLUMNA OPCIONAL (03/10/2026) — escribir en una columna que la migración aún no
 * ha creado en producción SIN romper la ingesta.
 *
 * Por qué no se declara en `src/db/schema.ts`: Drizzle mete TODAS las columnas del
 * schema en cada INSERT (las que no reciben valor van como `default`) y en cada
 * `select()` sin campos. Declarar `siniestros.cima_extra` antes de aplicar la 0106
 * haría fallar con 42703 cada alta de siniestro (también las manuales). Así que la
 * columna se escribe por SQL crudo y SOLO si existe.
 *
 * Caché por proceso: «existe» se recuerda para siempre (el DDL es aditivo y no se
 * deshace); «no existe» solo `TTL_AUSENTE_MS`, para que al aplicar el DDL el código
 * lo note sin redeploy. La comprobación es un SELECT al catálogo: no puede abortar
 * la transacción en la que corre.
 *
 * `to_regclass(tabla)` resuelve con el MISMO search_path que las consultas de
 * Drizzle (nombres sin schema): en producción, la tabla de `seguros`.
 */
import { sql } from "drizzle-orm";

/** Mínimo que se necesita del cliente (db o tx de Drizzle). */
export type ConExecute = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

const TTL_AUSENTE_MS = 5 * 60 * 1000;
const cache = new Map<string, { existe: boolean; hasta: number }>();

/** ¿Existe `tabla.columna` en la BD a la que apunta `dbc`? Nombres FIJOS del código, nunca de datos. */
export async function columnaExiste(
  dbc: ConExecute,
  tabla: string,
  columna: string,
  ahora: number = Date.now(),
): Promise<boolean> {
  const clave = `${tabla}.${columna}`;
  const c = cache.get(clave);
  if (c && (c.existe || c.hasta > ahora)) return c.existe;
  const filas = (await dbc.execute(sql`
    select exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = to_regclass(${tabla}::text)
        and attname = ${columna}::text
        and attnum > 0
        and not attisdropped
    ) as existe`)) as unknown as Array<{ existe: boolean | string | null }>;
  const v = filas?.[0]?.existe;
  const existe = v === true || v === "t" || v === "true";
  cache.set(clave, { existe, hasta: existe ? Number.POSITIVE_INFINITY : ahora + TTL_AUSENTE_MS });
  return existe;
}

/** Solo tests: olvida lo cacheado. */
export function olvidarColumnasOpcionales(): void {
  cache.clear();
}
