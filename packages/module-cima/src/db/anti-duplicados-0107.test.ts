/**
 * PORT central (fase 3) — cepo «0107» de `anti-duplicados.test.ts` del CRM (recortado
 * en la fase 1 porque lee `pull-deps.ts` y la migración 0107).
 *
 * La migración 0107 NO está en central (la BD ya existe; las migraciones viven en el
 * repo del CRM). Por eso su SQL ejecutable va aquí COPIADO LITERAL
 * (`asegura/src/db/migrations/0107_poliza_numero_busqueda.sql`, sin comentarios, 02/11/2026):
 * el brazo vigila que la consulta PORTADA de `pull-deps` siga usando la MISMA expresión
 * que el índice (si no, el planificador no lo usa) y el resto de brazos del original.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const MIG_0107_SQL_VIVO = `CREATE INDEX IF NOT EXISTS ix_polizas_numero_norm_busqueda
  ON public.polizas (
    correduria_id,
    (translate(regexp_replace(coalesce(numero_poliza, ''), '[^0-9A-Za-z]', '', 'g'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'))
  )
  WHERE merged_into_poliza_id IS NULL;`;

test("0107: índice NO único con la MISMA expresión que la consulta de pull-deps", () => {
  const deps = readFileSync(join(import.meta.dirname, "pull-deps.ts"), "utf8");
  const minus = "'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'";
  const expr = (col: string) => `translate(regexp_replace(coalesce(${col}, ''), '[^0-9A-Za-z]', '', 'g'), ${minus})`;
  assert.ok(deps.includes(expr("${polizas.numeroPoliza}")), "pull-deps: expresión distinta");
  const sqlVivo = MIG_0107_SQL_VIVO;
  assert.ok(sqlVivo.includes(`(${expr("numero_poliza")})`), "0107: la expresión del índice no es la de pull-deps");
  assert.ok(/CREATE INDEX IF NOT EXISTS ix_polizas_numero_norm_busqueda/.test(sqlVivo), "0107: falta el índice de búsqueda");
  assert.ok(/WHERE merged_into_poliza_id IS NULL/.test(sqlVivo), "0107: el índice debe ser parcial sobre fichas vivas (como la consulta)");
  // 🚨 Pólizas distintas de clientes distintos comparten número y compañía (las que marca
  // `poliza_no_duplicado`, 0108): un índice ÚNICO las rechazaría siempre.
  assert.ok(!/\bUNIQUE\b/i.test(sqlVivo), "0107: el índice NO puede ser único");
  assert.ok(!/ADD COLUMN/i.test(sqlVivo), "0107: sin columna generada (reescribe la tabla con ACCESS EXCLUSIVE)");
  assert.ok(deps.includes("isNull(polizas.mergedIntoPolizaId)"));
});
