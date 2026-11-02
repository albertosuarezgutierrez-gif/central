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
import { escribirMotivosExclusion } from "./cobertura-motivos.ts";
import { persistCimaCef } from "./persist-cef.ts";
import { persistCimaRecibo } from "./persist-recibo.ts";
import { persistCimaSiniestro } from "./persist-siniestro.ts";
import { persistCimaFichero } from "./pull-persist.ts";

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
const CLAVES_ENV = ["CIMA_INGESTA_CORREDURIA_ID", "NODE_ENV", "CIMA_ESCRITOR", "PII_ENCRYPTION_KEY", "PII_LOOKUP_KEY"];
beforeEach(() => {
  prev = Object.fromEntries(CLAVES_ENV.map((k) => [k, process.env[k]]));
  process.env.CIMA_INGESTA_CORREDURIA_ID = CORR;
  // P2-a: la exención de claves PII exige NODE_ENV=test TAMBIÉN en process.env.
  process.env.NODE_ENV = "test";
  delete process.env.CIMA_ESCRITOR;
  delete process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_LOOKUP_KEY;
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
  it("con las dos (inyectado Y process.env) → no lanza", () => {
    process.env.PII_ENCRYPTION_KEY = K;
    process.env.PII_LOOKUP_KEY = K;
    assert.doesNotThrow(() => exigirClavesPii({ PII_ENCRYPTION_KEY: K, PII_LOOKUP_KEY: K }));
  });
  it("P2-a: claves en el env INYECTADO pero no en process.env (lo que lee el cifrado) → lanza", () => {
    assert.throws(() => exigirClavesPii({ PII_ENCRYPTION_KEY: K, PII_LOOKUP_KEY: K }), ClavePiiAusenteError);
  });
  it("P2-a: sin env inyectado mira process.env (sin claves y sin NODE_ENV=test → lanza)", () => {
    delete process.env.NODE_ENV;
    assert.throws(() => exigirClavesPii(), ClavePiiAusenteError);
  });
  it("P2-a: NODE_ENV=test solo en el env INYECTADO no exime si process.env no lo es", () => {
    process.env.NODE_ENV = "development";
    assert.throws(() => exigirClavesPii(ENV_TEST), ClavePiiAusenteError);
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

// 🪤 P1-b: el gate vive DENTRO de cada función de escritura exportada (no solo en
// buildCimaPullDeps). Doble del db que FALLA si se toca.
function dbIntocable() {
  const tocado: string[] = [];
  const db = new Proxy(
    {},
    {
      get(_t, prop) {
        tocado.push(String(prop));
        throw new Error(`db_tocado:${String(prop)}`);
      },
    },
  );
  return { db: db as never, tocado };
}
type Env = Record<string, string | undefined>;
const funcionesEscritura: Array<[string, (db: never, env?: Env) => Promise<unknown>]> = [
  ["persistCimaFichero", (db, env) => persistCimaFichero({} as never, db, ALERTAS_SOLO_LOG, env)],
  ["persistCimaSiniestro", (db, env) => persistCimaSiniestro({} as never, db, env)],
  ["persistCimaRecibo", (db, env) => persistCimaRecibo({} as never, db, env)],
  ["persistCimaCef", (db, env) => persistCimaCef({} as never, db, env)],
  [
    "escribirMotivosExclusion",
    (db, env) =>
      escribirMotivosExclusion(db, { correduriaId: CORR, tipoObjeto: "REC", codigoEntidad: null }, [], env),
  ],
];
describe("P1-b: funciones de escritura exportadas sin CIMA_ESCRITOR=central", () => {
  const envsNoCentral: Array<[string, Env | undefined]> = [
    ["crm", { ...ENV_TEST, CIMA_ESCRITOR: "crm" }],
    ["ninguno", { ...ENV_TEST, CIMA_ESCRITOR: "ninguno" }],
    ["sin variable", ENV_TEST],
    ["sin env (default process.env, sin CIMA_ESCRITOR)", undefined],
  ];
  for (const [nombre, llamar] of funcionesEscritura) {
    for (const [nombreEnv, env] of envsNoCentral) {
      it(`${nombre} con ${nombreEnv} → lanza sin tocar la BD`, async () => {
        const { db, tocado } = dbIntocable();
        await assert.rejects(llamar(db, env), CimaEscritorNoCentralError);
        assert.deepEqual(tocado, []);
      });
    }
    it(`${nombre} con central pero sin claves PII → lanza sin tocar la BD`, async () => {
      delete process.env.NODE_ENV;
      const { db, tocado } = dbIntocable();
      await assert.rejects(llamar(db, { CIMA_ESCRITOR: "central" }), ClavePiiAusenteError);
      assert.deepEqual(tocado, []);
    });
    it(`${nombre} con central (default process.env) → pasa el gate`, async () => {
      process.env.CIMA_ESCRITOR = "central";
      const { db } = dbIntocable();
      const r = await llamar(db).catch((e: unknown) => e);
      assert.ok(!(r instanceof CimaEscritorNoCentralError) && !(r instanceof ClavePiiAusenteError), String(r));
    });
  }
});

describe("P2-b: persistCimaFichero sin canal de alertas avisa UNA vez fuera de tests", () => {
  function capturarAvisos(): { avisos: string[]; restaurar: () => void } {
    const avisos: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => {
      avisos.push(a.map(String).join(" "));
    };
    return { avisos, restaurar: () => (console.warn = orig) };
  }
  const ENV_CENTRAL = { CIMA_ESCRITOR: "central", PII_ENCRYPTION_KEY: "a".repeat(64), PII_LOOKUP_KEY: "b".repeat(64) };
  const avisosDefault = (xs: string[]) => xs.filter((x) => x.includes("alertas_solo_log_por_defecto")).length;
  // Orden importa: el aviso es una vez POR PROCESO.
  it("con NODE_ENV=test → no avisa", async () => {
    const { avisos, restaurar } = capturarAvisos();
    try {
      await persistCimaFichero({} as never, dbIntocable().db, undefined, { ...ENV_CENTRAL, NODE_ENV: "test" }).catch(() => {});
    } finally {
      restaurar();
    }
    assert.equal(avisosDefault(avisos), 0);
  });
  it("fuera de test → avisa una sola vez aunque se llame dos veces; con canal inyectado, nunca", async () => {
    process.env.NODE_ENV = "development";
    Object.assign(process.env, ENV_CENTRAL);
    const { avisos, restaurar } = capturarAvisos();
    try {
      await persistCimaFichero({} as never, dbIntocable().db, ALERTAS_SOLO_LOG, ENV_CENTRAL).catch(() => {});
      assert.equal(avisosDefault(avisos), 0, "avisó con canal inyectado");
      await persistCimaFichero({} as never, dbIntocable().db, undefined, ENV_CENTRAL).catch(() => {});
      await persistCimaFichero({} as never, dbIntocable().db, undefined, ENV_CENTRAL).catch(() => {});
    } finally {
      restaurar();
    }
    assert.equal(avisosDefault(avisos), 1);
  });
});
