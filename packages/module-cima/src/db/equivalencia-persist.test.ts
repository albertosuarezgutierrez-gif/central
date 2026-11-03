/**
 * Cepo de EQUIVALENCIA de ESCRITURAS con el CRM (fase 3 de la unificación de la ingesta CIMA).
 *
 * `__fixtures__/golden/escrituras-crm-2026-11-02.json` = TODAS las sentencias SQL (con sus
 * parámetros, normalizados) que el CÓDIGO ORIGINAL del CRM (`asegura`, main d1dfc69)
 * lanza al correr `runCimaPull` en modo REAL sobre los 6 ficheros de ejemplo de la norma
 * EIAC V07.1, con un `db` que no toca ninguna BD (arnés `equivalencia-persist-arnes.ts`:
 * drizzle `pg-proxy` que graba). Aquí se corre el MISMO arnés con la capa portada de
 * central (`buildCimaPullDeps` + persist-*): tiene que lanzar EXACTAMENTE lo mismo, en el
 * mismo orden, y dar el mismo resultado del pipeline.
 *
 * Cubre: POL persistida entera (cliente, póliza, coberturas, intervinientes, op_event,
 * ledger, cuarentena preventiva, cobertura de campos + excluido_motivo) y CEF persistida;
 * REC y SIN sin póliza en cartera (cuarentena: ledger + op_event + crudo con incidencia).
 * NO cubre el match contra cartera existente (el doble responde «sin filas» a todo SELECT).
 *
 * Si cambias la capa de BD A PROPÓSITO (en los dos lados), regenera el golden con
 * `scripts/generar-golden-escrituras.mts` (corre ESTE arnés con el código del CRM) y explica
 * la diferencia en el PR. Nunca para «ponerlo verde».
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { drizzle } from "drizzle-orm/pg-proxy";

import { runCimaPull } from "../ingest-pipeline.ts";
import { parseEiacXml } from "../manual-xml.ts";
import { ALERTAS_SOLO_LOG } from "./alertas.ts";
import { olvidarColumnasOpcionales } from "./columna-opcional.ts";
import type { CimaDb } from "./conexion.ts";
import { capturarEscrituras, ENV_ARNES, respuestaAckOk } from "./equivalencia-persist-arnes.ts";
import { CASOS_ESCRITURAS } from "./equivalencia-persist-casos.ts";
import { buildCimaPullDeps } from "./pull-deps.ts";
import * as schema from "./schema.ts";

const FX = join(import.meta.dirname, "..", "__fixtures__");
const GOLDEN = JSON.parse(readFileSync(join(FX, "golden", "escrituras-crm-2026-11-02.json"), "utf8")) as Record<
  string,
  unknown
>;

let envPrevio: Record<string, string | undefined> = {};
before(() => {
  envPrevio = Object.fromEntries(Object.keys(ENV_ARNES).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ENV_ARNES);
});
after(() => {
  for (const [k, v] of Object.entries(envPrevio)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("golden de escrituras: cubre los 6 ficheros de ejemplo y ninguno más", () => {
  assert.deepEqual(Object.keys(GOLDEN).sort(), CASOS_ESCRITURAS.map((c) => c.nombreFichero).sort());
});

for (const c of CASOS_ESCRITURAS) {
  test(`equivalencia CRM (escrituras): ${c.nombreFichero} → mismas sentencias y mismo resultado`, async () => {
    olvidarColumnasOpcionales();
    const r = await capturarEscrituras({
      ...c,
      xml: readFileSync(join(FX, c.nombreFichero), "utf8"),
      parseEiacXml,
      drizzleProxy: (cb) => drizzle(cb, { schema }),
      construirDeps: (db) =>
        buildCimaPullDeps({
          log: () => {},
          db: db as CimaDb,
          adaptador: { invokeWse: async () => respuestaAckOk() },
          alertas: ALERTAS_SOLO_LOG,
          env: process.env,
        }),
      runCimaPull: runCimaPull as never,
      ahoraMs: Date.now(),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(r)), GOLDEN[c.nombreFichero]);
  });
}
