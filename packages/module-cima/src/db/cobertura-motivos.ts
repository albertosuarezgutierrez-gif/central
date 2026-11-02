/**
 * PORT central (fase 3) — mitad de BD de `asegura/src/lib/integrations/cima/cobertura-motivos.ts`:
 * `escribirMotivosExclusion`, LITERAL. La mitad pura (`motivosExclusion`) se portó en
 * la fase 1 y vive en `../cobertura-motivos.ts` (no se redefine).
 *
 * Escribe (o limpia) `cima_cobertura_campos.excluido_motivo` (0106) para separar en el
 * Monitor «descartado por privacidad» de «dato perdido». Solo nombres de ruta y
 * motivos: NUNCA valores del árbol. Tolera que la columna aún no exista.
 */
import { sql } from "drizzle-orm";
import { columnaExiste, type ConExecute } from "./columna-opcional.ts";
import { exigirGateEscritura } from "./conexion.ts";
import { motivosExclusion, type ClaveCobertura } from "../cobertura-motivos.ts";
import type { RutaCampo } from "../field-coverage.ts";

export { motivosExclusion, type ClaveCobertura };

/**
 * Escribe (o limpia) el motivo de exclusión de las filas YA upsertadas del medidor
 * (misma clave de negocio). Solo toca filas cuyo motivo CAMBIA. Devuelve cuántas
 * rutas se enviaron (0 si no hay o si la columna aún no existe).
 */
export async function escribirMotivosExclusion(
  dbc: ConExecute,
  clave: ClaveCobertura,
  rutas: readonly RutaCampo[],
  /** PORT central — gate `CIMA_ESCRITOR=central` + claves PII (`exigirGateEscritura`). Default `process.env`. */
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  exigirGateEscritura(env, "escribirMotivosExclusion");
  const motivos = motivosExclusion(rutas);
  if (motivos.length === 0) return 0;
  if (!(await columnaExiste(dbc, "cima_cobertura_campos", "excluido_motivo"))) return 0;
  const valores = sql.join(
    motivos.map((m) => sql`(${m.ruta}::text, ${m.motivo}::text)`),
    sql`, `,
  );
  await dbc.execute(sql`
    update cima_cobertura_campos c
       set excluido_motivo = v.motivo
      from (values ${valores}) as v(ruta, motivo)
     where c.correduria_id = ${clave.correduriaId}::uuid
       and c.tipo_objeto = ${clave.tipoObjeto}
       and c.codigo_entidad is not distinct from ${clave.codigoEntidad}::text
       and c.ruta = v.ruta
       and c.excluido_motivo is distinct from v.motivo`);
  return motivos.length;
}
