/**
 * Cepo de EQUIVALENCIA con el CRM (fase 1 de la unificación de la ingesta CIMA).
 *
 * `__fixtures__/golden/salida-crm-2026-11-02.json` es la salida del CÓDIGO ORIGINAL del
 * CRM (`asegura/src/lib/integrations/cima`, main d1dfc69) para los 6 ficheros de ejemplo
 * de la norma EIAC V07.1 de `__fixtures__/`: `parseEiacXml` → mapper del tipo
 * (POL/REC/SIN/CEF) → `medirCoberturaCampos`. El port tiene que dar EXACTAMENTE lo mismo.
 *
 * Si cambias un mapper A PROPÓSITO, este test se pondrá rojo: regenera el golden
 * con el mismo recorrido y explica la diferencia en el PR. Nunca lo regeneres para
 * «ponerlo verde» sin entender qué cambió.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { mapEiacCefAll, type ParsedEiacCef } from "./eiac-cef-mapper.ts";
import { mapEiacPolAll, type ParsedEiacPol } from "./eiac-pol-mapper.ts";
import { mapEiacRecAll, type ParsedEiacRec } from "./eiac-rec-mapper.ts";
import { mapEiacSinAll, type ParsedEiacSin } from "./eiac-sin-mapper.ts";
import { medirCoberturaCampos } from "./field-coverage.ts";
import { parseEiacXml } from "./manual-xml.ts";

const FX = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const GOLDEN = JSON.parse(readFileSync(join(FX, "golden", "salida-crm-2026-11-02.json"), "utf8")) as Record<
  string,
  unknown
>;

const CASOS: Array<[string, (d: unknown) => unknown]> = [
  ["eiac-polizas-V07-1_V06.xml", (d) => mapEiacPolAll(d as ParsedEiacPol)],
  ["eiac-pol-colectiva-V07-1_V06.xml", (d) => mapEiacPolAll(d as ParsedEiacPol)],
  ["eiac-recibos-V07-1_V06.xml", (d) => mapEiacRecAll(d as ParsedEiacRec)],
  ["eiac-siniestro-dec-V07-1_V06.xml", (d) => mapEiacSinAll(d as ParsedEiacSin)],
  ["eiac-siniestro-mov-pagos-V07-1_V05.xml", (d) => mapEiacSinAll(d as ParsedEiacSin)],
  ["eiac-ctaefectivo-V07-1_V06.xml", (d) => mapEiacCefAll(d as ParsedEiacCef)],
];

test("golden: cubre los 6 ficheros de ejemplo y ninguno más", () => {
  assert.deepEqual(Object.keys(GOLDEN).sort(), CASOS.map(([f]) => f).sort());
});

for (const [fichero, map] of CASOS) {
  test(`equivalencia CRM: ${fichero} → misma salida de mapper y de cobertura`, () => {
    const datos = parseEiacXml(readFileSync(join(FX, fichero), "utf8"));
    // Mismo recorrido que el generador del golden (JSON: fechas a ISO, sin `undefined`).
    const salida = JSON.parse(JSON.stringify({ mapeado: map(datos), cobertura: medirCoberturaCampos(datos, map) }));
    assert.deepEqual(salida, GOLDEN[fichero]);
  });
}
