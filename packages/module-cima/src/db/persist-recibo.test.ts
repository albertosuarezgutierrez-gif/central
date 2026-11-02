/**
 * LOO-753 — Unit tests de `persistCimaRecibo` con el test seam `dbc` (fake
 * transaction/insert runner, sin BD; mock.module no funciona en tsx —
 * `feedback_node_test_mock_module_no_tsx`). Verifica: UPSERT por la uq de negocio
 * (alta → INSERT `cima_recibo_persisted`; cambio de estado → UPDATE
 * `cima_recibo_actualizado`), detección INSERT-vs-UPDATE vía `wasInserted` (xmax=0),
 * **cifrado del IBAN (PII Tier-1)** + ausencia del IBAN del payload del op_event,
 * importes en claro, sourceEventId determinista, idempotencia (replay) y cuarentena.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { persistCimaRecibo, type ReciboDbClient } from "./persist-recibo.ts";
import { operationalEvents, polizaRecibos } from "./schema.ts";
import type { PersistReciboInput } from "../ingest-pipeline.ts";
import type { EiacRecMapped } from "../eiac-rec-mapper.ts";
import type { FicheroParseado } from "../wse-schemas.ts";
import { after as despuesGate, before as antesGate } from "node:test";
// PORT central (fase 3, P1-b): cada función de escritura exportada exige
// CIMA_ESCRITOR=central y claves PII (o NODE_ENV=test) en process.env. Esta prueba es
// de la LÓGICA de persistencia; el cepo del gate vive en `escritor.test.ts`.
const envGatePrevio = { CIMA_ESCRITOR: process.env.CIMA_ESCRITOR, NODE_ENV: process.env.NODE_ENV };
antesGate(() => {
  process.env.CIMA_ESCRITOR = "central";
  process.env.NODE_ENV = "test";
});
despuesGate(() => {
  for (const [k, v] of Object.entries(envGatePrevio)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});


const VALID_UUID = "11111111-2222-3333-4444-555555555555";
const IBAN = "ES9121000418450200051332";

let prevCorr: string | undefined;
let prevKey: string | undefined;
let prevCods: string | undefined;
beforeEach(() => {
  prevCorr = process.env.CIMA_INGESTA_CORREDURIA_ID;
  prevKey = process.env.PII_ENCRYPTION_KEY;
  prevCods = process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  process.env.CIMA_INGESTA_CORREDURIA_ID = VALID_UUID;
  // 64 hex = 32 bytes → cifrado real (no passthrough). NODE_ENV no es production en tests.
  process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
  // LOO-826 A1 — tenant guard: la entidad de las fixtures debe estar autorizada.
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "C0109";
});
afterEach(() => {
  if (prevCorr === undefined) delete process.env.CIMA_INGESTA_CORREDURIA_ID;
  else process.env.CIMA_INGESTA_CORREDURIA_ID = prevCorr;
  if (prevKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = prevKey;
  if (prevCods === undefined) delete process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  else process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = prevCods;
});

// --- fixtures ---
function fichero(): FicheroParseado {
  return {
    nombreFicheroComprimido: "REC.zip",
    tipoObjeto: "REC",
    versionEiac: "6.0",
    codigoEntidad: "C0109",
    checksumVerified: false,
    datos: {},
    rawXml: "<x/>",
    zipEntryCount: 1,
  } as FicheroParseado;
}

function mapped(over: Partial<EiacRecMapped> = {}): EiacRecMapped {
  return {
    outcome: "ok",
    reviewReasons: [],
    idRecibo: "881227973",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL123456",
    situacion: "cobrado",
    claseRecibo: "NP",
    fechaEfectoInicial: "2026-01-01",
    fechaEfectoActual: "2026-01-01",
    fechaVencimiento: "2027-01-01",
    fechaEmision: "2026-01-05",
    fechaSituacion: "2026-03-01",
    primaTotal: "731.15",
    primaNeta: "667.48",
    formaPago: "CC",
    iban: IBAN,
    comisionBruta: "63.67",
    comisionLiquida: "50.00",
    datosExtra: { cargos: [{ claseCargo: "AR", importe: "0.00" }] },
    ...over,
  };
}

function input(over: Partial<PersistReciboInput> = {}): PersistReciboInput {
  return {
    fichero: fichero(),
    xmlHash: "deadbeef",
    mapped: mapped(),
    match: { polizaId: "pol-1", clienteId: "cli-1" },
    ...over,
  };
}

type InsertCall = { table: unknown; values: unknown };

/**
 * Fake dbc: registra inserts (tx + top-level). El UPSERT del recibo termina en
 * `onConflictDoUpdate().returning()`; `wasInserted=true` ⇒ alta (INSERT, xmax=0),
 * `false` ⇒ cambio de estado (UPDATE, xmax≠0). Los op_events terminan en
 * `onConflictDoNothing()` (thenable).
 */
function makeFakeDbc(opts: {
  reciboReturning?: Array<{ id: string; wasInserted: boolean }>;
} = {}): { dbc: ReciboDbClient; inserts: InsertCall[] } {
  const inserts: InsertCall[] = [];
  const reciboReturning =
    opts.reciboReturning ?? [{ id: "rec-new-1", wasInserted: true }];

  const makeInsert = (recordInto: InsertCall[]) => (table: unknown) => ({
    values(values: unknown) {
      recordInto.push({ table, values });
      return {
        onConflictDoUpdate() {
          return {
            returning() {
              return Promise.resolve(reciboReturning);
            },
          };
        },
        onConflictDoNothing() {
          return {
            then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return Promise.resolve(undefined).then(onF, onR);
            },
          };
        },
      };
    },
  });

  const tx = { insert: makeInsert(inserts) };
  const dbc: ReciboDbClient = {
    transaction: (async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) as never,
    insert: makeInsert(inserts) as never,
  };
  return { dbc, inserts };
}

// --- alta nueva: upsert recibo + IBAN cifrado + op_event in-tx ---
test("persistCimaRecibo: alta nueva → upsert recibo, IBAN cifrado, importes en claro, op_event", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaRecibo(input(), dbc);
  assert.deepEqual(res, { ok: true, outcome: "persisted", reciboId: "rec-new-1" });

  const recInsert = inserts.find((i) => i.table === polizaRecibos);
  assert.ok(recInsert, "debe insertar en poliza_recibos");
  const v = recInsert!.values as Record<string, unknown>;
  assert.equal(v.origen, "cima");
  assert.equal(v.eiacXmlHash, "deadbeef");
  assert.equal(v.idRecibo, "881227973");
  assert.equal(v.codigoEntidadDgs, "C0109");
  assert.equal(v.polizaId, "pol-1");
  assert.equal(v.situacion, "cobrado");
  // IBAN CIFRADO: no es el texto plano y empieza por v1:.
  assert.notEqual(v.iban, IBAN);
  assert.ok(String(v.iban).startsWith("v1:"), "iban cifrado v1:");
  // Importes/comisiones = dato de negocio → claro.
  assert.equal(v.primaTotal, "731.15");
  assert.equal(v.comisionBruta, "63.67");
  assert.equal(v.formaPago, "CC");

  const opEvent = inserts.find((i) => i.table === operationalEvents);
  assert.ok(opEvent, "debe emitir op_event in-tx");
  const ev = opEvent!.values as Record<string, unknown>;
  assert.equal(ev.eventName, "cima_recibo_persisted"); // alta (INSERT)
  assert.equal(ev.sourceEventId, "deadbeef:881227973"); // determinista
  assert.equal((ev.payload as Record<string, unknown>).yaExistia, false);
  // payload SIN PII: NUNCA el IBAN (ni en claro ni cifrado).
  const payloadStr = JSON.stringify(ev.payload);
  assert.doesNotMatch(payloadStr, new RegExp(IBAN));
  assert.doesNotMatch(payloadStr, /v1:/); // ni el cipher del IBAN
  // importes de negocio sí pueden ir en el payload (trazabilidad).
  assert.equal((ev.payload as Record<string, unknown>).primaTotal, "731.15");
});

// --- estado vivo: recibo ya ingestado cuyo estado cambió → UPDATE + actualizado ---
test("persistCimaRecibo: estado vivo → UPDATE situación, op_event actualizado", async () => {
  // wasInserted=false ⇒ la fila existía y el conflicto la actualizó (xmax≠0).
  const { dbc, inserts } = makeFakeDbc({
    reciboReturning: [{ id: "rec-existing-1", wasInserted: false }],
  });
  const res = await persistCimaRecibo(
    input({
      xmlHash: "feedface", // cada pull trae un xmlHash distinto
      mapped: mapped({ situacion: "devuelto" }), // el recibo cobrado se devolvió
    }),
    dbc,
  );
  assert.deepEqual(res, { ok: true, outcome: "persisted", reciboId: "rec-existing-1" });

  // El UPSERT lleva situacion=devuelto en los values (el set lo aplica con onConflict).
  const recUpsert = inserts.find((i) => i.table === polizaRecibos);
  assert.equal((recUpsert!.values as Record<string, unknown>).situacion, "devuelto");
  // El IBAN del SET sigue cifrado (mismo cipher que el INSERT).
  assert.ok(String((recUpsert!.values as Record<string, unknown>).iban).startsWith("v1:"));

  const ev = inserts.find((i) => i.table === operationalEvents);
  const evVals = ev!.values as Record<string, unknown>;
  assert.equal(evVals.eventName, "cima_recibo_actualizado");
  assert.equal(evVals.sourceEventId, "feedface:881227973");
  assert.equal((evVals.payload as Record<string, unknown>).yaExistia, true);
});

// --- replay del mismo pull → idempotente (op_event dedup) ---
test("persistCimaRecibo: replay del mismo pull → idempotente, op_event actualizado dedup", async () => {
  const { dbc, inserts } = makeFakeDbc({
    reciboReturning: [{ id: "rec-existing-1", wasInserted: false }],
  });
  const res = await persistCimaRecibo(input({ xmlHash: "feedface" }), dbc);
  assert.deepEqual(res, { ok: true, outcome: "persisted", reciboId: "rec-existing-1" });
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.equal((ev!.values as Record<string, unknown>).eventName, "cima_recibo_actualizado");
  assert.equal((ev!.values as Record<string, unknown>).sourceEventId, "feedface:881227973");
});

// --- IBAN null → no rompe (cipher null), importes siguen en claro ---
test("persistCimaRecibo: IBAN ausente → iban null (no rompe), no aparece en payload", async () => {
  const { dbc, inserts } = makeFakeDbc();
  await persistCimaRecibo(input({ mapped: mapped({ iban: null }) }), dbc);
  const recInsert = inserts.find((i) => i.table === polizaRecibos);
  assert.equal((recInsert!.values as Record<string, unknown>).iban, null);
});

// --- guard: codigoEntidadDgs null → review, NO inserta ---
test("persistCimaRecibo: codigoEntidadDgs null → review falta_codigo_entidad_dgs", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaRecibo(
    input({ mapped: mapped({ codigoEntidadDgs: null }) }),
    dbc,
  );
  assert.deepEqual(res, { ok: false, outcome: "review", reason: "falta_codigo_entidad_dgs" });
  assert.ok(!inserts.some((i) => i.table === polizaRecibos), "NO inserta el recibo");
});

// --- cuarentena: sin match → NO inserta recibo, emite review op_event ---
test("persistCimaRecibo: sin match (cuarentena) → review op_event, sin insert recibo", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaRecibo(input({ match: null }), dbc);
  assert.deepEqual(res, { ok: false, outcome: "review", reason: "sin_poliza_en_cartera" });
  assert.ok(!inserts.some((i) => i.table === polizaRecibos), "NO inserta el recibo");
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "emite op_event de cuarentena");
  assert.equal((ev!.values as Record<string, unknown>).eventName, "cima_recibo_sin_poliza_review");
  assert.equal((ev!.values as Record<string, unknown>).sourceEventId, "deadbeef:881227973");
  // El IBAN NUNCA aparece en el payload de cuarentena.
  assert.doesNotMatch(JSON.stringify((ev!.values as Record<string, unknown>).payload), new RegExp(IBAN));
});

// --- LOO-826 A1 — tenant guard (hallazgo #18): entidad NO autorizada → review + op_event ---
test("persistCimaRecibo: entidad no autorizada → review + op_event, SIN upsert de recibo", async () => {
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "C0058"; // C0109 (fixture) fuera de la allowlist
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaRecibo(input(), dbc);
  assert.deepEqual(res, {
    ok: false,
    outcome: "review",
    reason: "codigo_entidad_no_autorizado:C0109/C0109",
  });
  assert.equal(
    inserts.find((i) => i.table === polizaRecibos),
    undefined,
    "NO debe upsertar el recibo (ni escribir el IBAN)",
  );
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "debe emitir op_event Art.30");
  const values = ev!.values as Record<string, unknown>;
  assert.equal(values.eventName, "cima_entidad_no_autorizada");
  assert.equal(values.sourceEventId, "deadbeef:recibo:entidad_no_autorizada");
  const payload = values.payload as Record<string, unknown>;
  assert.equal(payload.objeto, "recibo");
  // Sin PII: el payload del guard NUNCA lleva IBAN.
  assert.equal(JSON.stringify(payload).includes(IBAN), false);
});

test("persistCimaRecibo: sin match por póliza AMBIGUA → reason poliza_ambigua (no «sin póliza»)", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaRecibo(input({ match: null, motivoSinMatch: "poliza_ambigua" }), dbc);
  assert.deepEqual(res, { ok: false, outcome: "review", reason: "poliza_ambigua" });
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.match(JSON.stringify((ev!.values as Record<string, unknown>).payload), /poliza_ambigua/);
});

// --- Huecos 0104: columnas nuevas en el INSERT y en el SET del estado vivo ---
test("persistCimaRecibo: id_remesa, gestion_cobro y la comisión[0] completa van al INSERT y al SET del UPDATE", async () => {
  const inserts: InsertCall[] = [];
  const sets: Array<Record<string, unknown>> = [];
  const makeInsert = (table: unknown) => ({
    values(values: unknown) {
      inserts.push({ table, values });
      return {
        onConflictDoUpdate(cfg: { set: Record<string, unknown> }) {
          sets.push(cfg.set);
          return { returning: () => Promise.resolve([{ id: "rec-1", wasInserted: false }]) };
        },
        onConflictDoNothing() {
          return { then: (f?: (v: unknown) => unknown) => Promise.resolve(undefined).then(f) };
        },
      };
    },
  });
  const tx = { insert: makeInsert };
  const dbc: ReciboDbClient = {
    transaction: (async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) as never,
    insert: makeInsert as never,
  };
  const nuevos = {
    idRemesa: "900000001",
    gestionCobro: "ME",
    claseComision: "ME",
    baseComision: "667.48",
    retencionIrpf: "13.67",
  };
  const res = await persistCimaRecibo(input({ mapped: mapped(nuevos) }), dbc);
  assert.equal(res.ok, true);
  const rec = inserts.find((i) => i.table === polizaRecibos);
  assert.ok(rec);
  const values = rec.values as Record<string, unknown>;
  for (const [k, v] of Object.entries(nuevos)) {
    assert.equal(values[k], v, `INSERT.${k}`);
    assert.equal(sets[0][k], v, `SET.${k}`);
  }
});
