/**
 * 🪤 Cepos de la fase 3 de central (02/11/2026):
 *  1. `CIMA_ESCRITOR` — solo con `central` la ingesta de central CONFIRMA descargas
 *     en TIREA (IRREVERSIBLE) o ESCRIBE en BD. Default `crm`.
 *  2. Claves PII fail-CLOSED — sin `PII_ENCRYPTION_KEY`/`PII_LOOKUP_KEY` la capa de
 *     persistencia no arranca (salvo `NODE_ENV=test`): `field-encryption` guardaría
 *     EN CLARO y el índice ciego daría `null` (clientes duplicados).
 *
 * Sin BD ni red: `db` y adaptador son dobles que CUENTAN las escrituras y las
 * llamadas a TIREA. Un brazo por aserción.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { runCimaPull } from "../ingest-pipeline.ts";
import type { FicheroParseado } from "../wse-schemas.ts";
import { ALERTAS_SOLO_LOG } from "./alertas.ts";
import { ClavePiiAusenteError, crearDbCima, exigirClavesPii, type CimaDb } from "./conexion.ts";
import { CimaEscritorNoCentralError, cimaEscritorActivo, exigirEscritorCentral } from "./escritor.ts";
import { buildCimaPullDeps } from "./pull-deps.ts";
import { recordCimaPullLifecycleEvent } from "./pull-audit.ts";

const CORR = "11111111-2222-3333-4444-555555555555";
const RAW = "<x/>";
const HASH = createHash("sha256").update(RAW, "utf8").digest("hex");

/** Doble del `db` de Drizzle: los SELECT devuelven `filasSelect`; cuenta escrituras. */
function fakeDb(filasSelect: unknown[] = []) {
  const escrituras: string[] = [];
  const thenable = (valor: unknown): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (res: (v: unknown) => void) => res(valor);
          return () => thenable(valor);
        },
      },
    );
  const db = {
    select: () => thenable(filasSelect),
    execute: async () => [{ existe: false }],
    insert: () => {
      escrituras.push("insert");
      return thenable([]);
    },
    update: () => {
      escrituras.push("update");
      return thenable([]);
    },
    delete: () => {
      escrituras.push("delete");
      return thenable([]);
    },
    transaction: async () => {
      escrituras.push("transaction");
    },
  };
  return { db: db as unknown as CimaDb, escrituras };
}

/** Doble del adaptador: ACK OK de TIREA; cuenta las llamadas. */
function fakeAdaptador() {
  const llamadas: string[] = [];
  return {
    llamadas,
    adaptador: {
      invokeWse: async (op: string) => {
        llamadas.push(op);
        return new Response(JSON.stringify({ codigoRespuesta: "CIMA-200", descripcionRespuesta: "OK" }), {
          status: 200,
        });
      },
    },
  };
}

function fichero(): FicheroParseado {
  return {
    nombreFicheroComprimido: "F.zip",
    tipoObjeto: "POL",
    versionEiac: "6.0",
    codigoEntidad: "C0109",
    checksumVerified: false,
    datos: {},
    rawXml: RAW,
    zipEntryCount: 1,
  } as FicheroParseado;
}

let prev: Record<string, string | undefined>;
beforeEach(() => {
  prev = { CIMA_INGESTA_CORREDURIA_ID: process.env.CIMA_INGESTA_CORREDURIA_ID };
  process.env.CIMA_INGESTA_CORREDURIA_ID = CORR;
});
afterEach(() => {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const ENV_TEST = { NODE_ENV: "test" } as const;

describe("cimaEscritorActivo (pura)", () => {
  it("sin variable → crm (default conservador)", () => {
    assert.equal(cimaEscritorActivo({}), "crm");
  });
  it("crm → crm", () => {
    assert.equal(cimaEscritorActivo({ CIMA_ESCRITOR: "crm" }), "crm");
  });
  it("central → central", () => {
    assert.equal(cimaEscritorActivo({ CIMA_ESCRITOR: "central" }), "central");
  });
  it("espacios alrededor se toleran", () => {
    assert.equal(cimaEscritorActivo({ CIMA_ESCRITOR: " central " }), "central");
  });
  it("«Central» (mayúscula) NO activa central", () => {
    assert.equal(cimaEscritorActivo({ CIMA_ESCRITOR: "Central" }), "crm");
  });
  it("basura («true») → crm", () => {
    assert.equal(cimaEscritorActivo({ CIMA_ESCRITOR: "true" }), "crm");
  });
  it("ninguno → ninguno", () => {
    assert.equal(cimaEscritorActivo({ CIMA_ESCRITOR: "ninguno" }), "ninguno");
  });
  it("exigirEscritorCentral lanza con ninguno", () => {
    assert.throws(() => exigirEscritorCentral({ CIMA_ESCRITOR: "ninguno" }, "x"), CimaEscritorNoCentralError);
  });
});

describe("🚨 confirmarDescarga sin CIMA_ESCRITOR=central", () => {
  it("deps.confirm LANZA y NO llama al adaptador (default crm)", async () => {
    const { db } = fakeDb();
    const { adaptador, llamadas } = fakeAdaptador();
    const deps = await buildCimaPullDeps({ log: () => {}, db, adaptador, alertas: ALERTAS_SOLO_LOG, env: ENV_TEST });
    await assert.rejects(deps.confirm("F.zip", "C0109"), CimaEscritorNoCentralError);
    assert.equal(llamadas.length, 0, "se llamó a TIREA sin ser el escritor");
  });

  it("pull real de un duplicado (el camino que confirma SIN persistir): 0 confirmaciones y 0 escrituras", async () => {
    const { db, escrituras } = fakeDb([
      { n: "VIEJO.zip", h: HASH, estado: "persisted", tipoObjeto: "POL", confirmadoAt: null },
    ]);
    const { adaptador, llamadas } = fakeAdaptador();
    const deps = await buildCimaPullDeps({
      log: () => {},
      db,
      adaptador,
      alertas: ALERTAS_SOLO_LOG,
      env: { ...ENV_TEST, CIMA_ESCRITOR: "crm" },
    });
    await runCimaPull([fichero()], deps, { dryRun: false });
    assert.equal(llamadas.length, 0, "confirmarDescarga llamado con CIMA_ESCRITOR=crm");
    assert.equal(escrituras.length, 0, "escribió en BD con CIMA_ESCRITOR=crm");
  });

  it("brazo verde: el MISMO pull con CIMA_ESCRITOR=central SÍ confirma (el gate es lo único que lo impide)", async () => {
    const { db } = fakeDb([{ n: "VIEJO.zip", h: HASH, estado: "persisted", tipoObjeto: "POL", confirmadoAt: null }]);
    const { adaptador, llamadas } = fakeAdaptador();
    const deps = await buildCimaPullDeps({
      log: () => {},
      db,
      adaptador,
      alertas: ALERTAS_SOLO_LOG,
      env: { ...ENV_TEST, CIMA_ESCRITOR: "central" },
    });
    await runCimaPull([fichero()], deps, { dryRun: false });
    assert.deepEqual(llamadas, ["confirmarDescarga"]);
  });

  it("el gate se evalúa en CADA llamada: pasar de central a crm tras construir bloquea el confirm", async () => {
    const env: Record<string, string | undefined> = { ...ENV_TEST, CIMA_ESCRITOR: "central" };
    const { db } = fakeDb();
    const { adaptador, llamadas } = fakeAdaptador();
    const deps = await buildCimaPullDeps({ log: () => {}, db, adaptador, alertas: ALERTAS_SOLO_LOG, env });
    env.CIMA_ESCRITOR = "crm";
    await assert.rejects(deps.confirm("F.zip", "C0109"), CimaEscritorNoCentralError);
    assert.equal(llamadas.length, 0);
  });
});

describe("escrituras en BD sin CIMA_ESCRITOR=central", () => {
  const casos: Array<[string, (d: Awaited<ReturnType<typeof buildCimaPullDeps>>) => Promise<unknown>]> = [
    ["persist", (d) => d.persist({} as never)],
    ["persistSiniestro", (d) => d.persistSiniestro!({} as never)],
    ["persistRecibo", (d) => d.persistRecibo!({} as never)],
    ["persistCef", (d) => d.persistCef!({} as never)],
    ["recordLedgerWithAudit", (d) => d.recordLedgerWithAudit({} as never)],
    ["recordAuditEvent", (d) => d.recordAuditEvent({} as never)],
    ["recordRawQuarantine", (d) => d.recordRawQuarantine!({} as never)],
    ["recordFieldCoverage", (d) => d.recordFieldCoverage!({} as never)],
    ["recordFicheroLedger", (d) => d.recordFicheroLedger({} as never)],
  ];
  for (const [nombre, llamar] of casos) {
    it(`${nombre} LANZA sin tocar la BD`, async () => {
      const { db, escrituras } = fakeDb();
      const { adaptador } = fakeAdaptador();
      const deps = await buildCimaPullDeps({ log: () => {}, db, adaptador, alertas: ALERTAS_SOLO_LOG, env: ENV_TEST });
      await assert.rejects(llamar(deps), CimaEscritorNoCentralError);
      assert.equal(escrituras.length, 0);
    });
  }

  it("pull-audit (lifecycle) LANZA sin tocar la BD", async () => {
    const { db, escrituras } = fakeDb();
    await assert.rejects(
      recordCimaPullLifecycleEvent({ eventName: "cima_pull_started", startedAtEpochMs: 1, payload: {} }, db, ENV_TEST),
      CimaEscritorNoCentralError,
    );
    assert.equal(escrituras.length, 0);
  });
});

describe("claves PII fail-CLOSED", () => {
  const K = "a".repeat(64);
  it("sin ninguna clave → lanza", () => {
    assert.throws(() => exigirClavesPii({}), ClavePiiAusenteError);
  });
  it("sin PII_ENCRYPTION_KEY → lanza nombrándola", () => {
    assert.throws(() => exigirClavesPii({ PII_LOOKUP_KEY: K }), /PII_ENCRYPTION_KEY/);
  });
  it("sin PII_LOOKUP_KEY → lanza nombrándola", () => {
    assert.throws(() => exigirClavesPii({ PII_ENCRYPTION_KEY: K }), /PII_LOOKUP_KEY/);
  });
  it("clave en blanco cuenta como ausente", () => {
    assert.throws(() => exigirClavesPii({ PII_ENCRYPTION_KEY: "  ", PII_LOOKUP_KEY: K }), ClavePiiAusenteError);
  });
  it("también en development (no solo en production)", () => {
    assert.throws(() => exigirClavesPii({ NODE_ENV: "development" }), ClavePiiAusenteError);
  });
  it("con las dos → no lanza", () => {
    assert.doesNotThrow(() => exigirClavesPii({ PII_ENCRYPTION_KEY: K, PII_LOOKUP_KEY: K }));
  });
  it("NODE_ENV=test → no lanza", () => {
    assert.doesNotThrow(() => exigirClavesPii(ENV_TEST));
  });
  it("buildCimaPullDeps sin claves LANZA antes de leer la BD", async () => {
    const leidas: string[] = [];
    const db = {
      select: () => {
        leidas.push("select");
        throw new Error("no debía leer");
      },
      execute: async () => {
        leidas.push("execute");
        return [];
      },
    } as unknown as CimaDb;
    const { adaptador } = fakeAdaptador();
    await assert.rejects(
      buildCimaPullDeps({ log: () => {}, db, adaptador, alertas: ALERTAS_SOLO_LOG, env: { CIMA_ESCRITOR: "central" } }),
      ClavePiiAusenteError,
    );
    assert.equal(leidas.length, 0);
  });
  it("crearDbCima sin claves LANZA (no abre conexión)", () => {
    assert.throws(() => crearDbCima({ url: "postgres://x@127.0.0.1:1/x", env: {} }), ClavePiiAusenteError);
  });
});
