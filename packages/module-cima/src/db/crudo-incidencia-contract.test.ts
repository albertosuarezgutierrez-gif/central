/**
 * Cepo de CONTRATO sobre las dos consultas que separan el crudo CON incidencia
 * del crudo preventivo (mig 0097). Lee el fuente porque las dos viven contra BD
 * (`getCimaHealthSnapshot` es SELECT-only y el reproceso es un route handler), y
 * un unit test normal no las alcanza.
 *
 * Qué protege, y por qué duele si se rompe: desde que se guarda el crudo de TODOS
 * los ficheros, quitar el filtro `con_incidencia` NO rompe nada visible — lo que
 * hace es ahogar la señal. `pendientes` pasaría a contar cada fichero sano, y con
 * ella `purgaInminente`, que es la ÚNICA alarma que avisa (14 días antes) de que
 * el TTL va a borrar un crudo con incidencia que nadie ha reprocesado. Y el
 * reproceso se dedicaría a re-mapear ficheros que ya persistieron enteros,
 * dejando los que sí hacen falta detrás del ruido.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// PORT central (fase 3): se leen los fuentes PORTADOS (`src/db/`), no los del CRM.
const RAIZ = import.meta.dirname;

function fuente(rel: string): string {
  return readFileSync(join(RAIZ, rel), "utf8");
}

test("el snapshot de salud cuenta SÓLO el crudo con incidencia", () => {
  const src = fuente("health-snapshot.ts");
  const consulta = src.slice(
    src.indexOf("createdAt: cimaCuarentenaCrudo.createdAt"),
    src.indexOf("resumirCoberturaCampos(coberturaRows)"),
  );
  assert.ok(consulta.length > 0, "no se encontró la consulta del crudo");
  assert.match(consulta, /eq\(cimaCuarentenaCrudo\.conIncidencia,\s*true\)/);
  assert.match(consulta, /isNull\(cimaCuarentenaCrudo\.reprocesadoAt\)/);
});

// PORT central (fase 3): el brazo «el reproceso de cuarentena toma SÓLO el crudo con
// incidencia» lee la RUTA `api/internal/cima/reprocesar-cuarentena` del CRM; se porta
// cuando esa ruta llegue a central (fase 5 de la spec), no antes.

test("la promoción a incidencia nunca ACORTA el TTL ya concedido", () => {
  // `greatest`: una promoción llega después de la copia preventiva (30d) y sube a
  // 90d, pero si por lo que sea llegara al revés, un `set` a secas recortaría el
  // plazo de una fila que aún hay que reprocesar — y nada fallaría.
  const src = fuente("pull-deps.ts");
  assert.match(src, /purgarEn: sql`greatest\(/);
});

// 26/09/2026 — la copia cifrada de cada fichero es la única copia automática que
// sobrevive al `confirm` (TIREA lo saca de la cola para siempre). Con 30 días, un
// campo que el mapper no leía se perdía al mes y sólo quedaba el export manual al
// Drive. Este cepo impide volver a un TTL corto sin darse cuenta.
test("la copia cifrada del crudo se conserva 6 años, preventiva e incidencia", () => {
  const src = fuente("pull-deps.ts");
  const m = src.match(/export const CRUDO_RETENCION_DIAS = ([^;]+);/);
  assert.ok(m, "falta CRUDO_RETENCION_DIAS");
  const dias = Function(`return (${m[1]});`)() as number;
  assert.ok(dias >= 6 * 365, `retención ${dias} días < 6 años`);
  const cuerpo = src.slice(src.indexOf("recordRawQuarantine: async"));
  assert.match(cuerpo, /const ttlDias = CRUDO_RETENCION_DIAS;/);
});
