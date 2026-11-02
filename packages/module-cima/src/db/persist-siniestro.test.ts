/**
 * LOO-750 / LOO-755 — Unit tests de `persistCimaSiniestro` con el test seam `dbc`
 * (fake transaction/insert runner, sin BD; mock.module no funciona en tsx —
 * `feedback_node_test_mock_module_no_tsx`). Verifica: UPSERT por la uq de negocio
 * (apertura 311 → INSERT `cima_siniestro_persisted` + terceros; movimiento 361 →
 * UPDATE `cima_siniestro_actualizado` SIN re-insertar terceros), detección
 * INSERT-vs-UPDATE vía `wasInserted` (xmax=0), cifrado de PII Tier-1 de terceros,
 * sourceEventId determinista, replay idempotente y la cuarentena (sin match →
 * op_event review, sin insert de siniestro).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";
import { encryptField } from "@central/module-seguros-pii";
import {
  claveFicheroSin,
  compararClaveSin,
  contrarioCubierto,
  esMasViejo,
  fusionarCimaExtraSin,
  persistCimaSiniestro,
  type SiniestroDbClient,
} from "./persist-siniestro.ts";
import {
  operationalEvents,
  siniestros,
  siniestroContrarios,
  siniestroLesionados,
  siniestroTestigos,
} from "./schema.ts";
import type { PersistSiniestroInput } from "../ingest-pipeline.ts";
import type { EiacSinMapped, MappedFigura } from "../eiac-sin-mapper.ts";
import type { FicheroParseado } from "../wse-schemas.ts";
import { olvidarColumnasOpcionales } from "./columna-opcional.ts";
import { CIMA_EXTRA_MAX } from "../cima-extra.ts";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

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
    nombreFicheroComprimido: "SIN.zip",
    tipoObjeto: "SIN",
    versionEiac: "6.0",
    codigoEntidad: "C0109",
    checksumVerified: false,
    datos: {},
    rawXml: "<x/>",
    zipEntryCount: 1,
  } as FicheroParseado;
}

function mapped(over: Partial<EiacSinMapped> = {}): EiacSinMapped {
  return {
    outcome: "ok",
    reviewReasons: [],
    idSiniestroEntidad: "SIN000001",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL123456",
    fechaOcurrencia: "2026-03-01",
    estado: "abierto",
    tipo: "17",
    lugarDireccion: "Calle Falsa 1",
    lugarCp: "41701",
    lugarCiudad: "Dos Hermanas",
    lugarProvincia: "41",
    comentario: "Colisión",
    figuras: [],
    numeroLesionados: 0,
    danos: [],
    situaciones: [],
    acciones: [],
    pagos: [],
    importeReserva: null,
    importeIndemnizacion: null,
    totalPagos: null,
    posicion: null,
    ...over,
  };
}

function input(over: Partial<PersistSiniestroInput> = {}): PersistSiniestroInput {
  return {
    fichero: fichero(),
    xmlHash: "deadbeef",
    mapped: mapped(),
    match: { polizaId: "pol-1", clienteId: "cli-1" },
    ...over,
  };
}

type InsertCall = { table: unknown; values: unknown };
type ConflictCall = { table: unknown; set: unknown };

/**
 * Fake dbc: registra inserts (tx + top-level). El UPSERT del siniestro termina en
 * `onConflictDoUpdate().returning()`; controlamos qué devuelve con
 * `siniestroReturning` — `wasInserted=true` ⇒ apertura (INSERT, xmax=0),
 * `wasInserted=false` ⇒ movimiento (UPDATE, xmax≠0). Default: apertura nueva.
 * Los op_events terminan en `onConflictDoNothing()` (sin `.returning()`) → thenable.
 */
function makeFakeDbc(opts: {
  siniestroReturning?: Array<{ id: string; wasInserted: boolean }>;
  /** Filas de `siniestro_contrarios` que el `select` de la fusión devuelve (ya cifradas). */
  contrariosExistentes?: Array<Record<string, unknown>>;
  /**
   * Historia del siniestro para `ultimaClaveAplicada` (03/10/2026): 1ª `execute`
   * = SELECT … FOR UPDATE de la fila (vacío ⇒ no existe), 2ª = nombres de los
   * ficheros ya aplicados. Default: sin historia (se aplica entero).
   */
  historia?: { id: string; hash: string | null; nombres: string[] };
  /** ¿Existe ya `siniestros.cima_extra` en la BD? (03/10/2026, 0106). Default: sí. */
  columnaCimaExtra?: boolean;
  /** Valor guardado de `siniestros.cima_extra` (lo que devuelve su SELECT). */
  cimaExtraGuardado?: unknown;
} = {}): {
  dbc: SiniestroDbClient;
  inserts: InsertCall[];
  conflicts: ConflictCall[];
  executes: unknown[];
  /** Sentencias `cima_extra` (comprobación de columna, lectura y UPDATE), en orden. */
  extras: string[];
  /** Parámetros del UPDATE de `cima_extra` (si lo hubo). */
  updateParams: unknown[] | null;
} {
  const executes: unknown[] = [];
  const extras: string[] = [];
  let updateParams: unknown[] | null = null;
  let historiaCalls = 0;
  const inserts: InsertCall[] = [];
  const conflicts: ConflictCall[] = [];
  const siniestroReturning =
    opts.siniestroReturning ?? [{ id: "sin-new-1", wasInserted: true }];

  const makeInsert = (recordInto: InsertCall[]) => (table: unknown) => {
    const builder = {
      values(values: unknown) {
        recordInto.push({ table, values });
        // UPSERT del siniestro: onConflictDoUpdate(...).returning(...).
        const chain = {
          onConflictDoUpdate(args: { set: unknown }) {
            conflicts.push({ table, set: args?.set });
            return {
              returning() {
                return Promise.resolve(siniestroReturning);
              },
            };
          },
          // op_event insert (in-tx + cuarentena) termina en onConflictDoNothing,
          // SIN `.returning()` → se `await`ea directo. Devuelve thenable.
          onConflictDoNothing() {
            return {
              then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
        return chain;
      },
    };
    return builder;
  };

  const tx = {
    insert: makeInsert(inserts),
    execute: (q: unknown) => {
      const { sql: texto, params } = new PgDialect().sqlToQuery(q as never);
      if (/pg_attribute/.test(texto)) {
        extras.push(texto);
        return Promise.resolve([{ existe: opts.columnaCimaExtra ?? true }]);
      }
      if (/cima_extra/.test(texto)) {
        extras.push(texto);
        if (/^\s*update/i.test(texto)) {
          updateParams = params;
          return Promise.resolve([]);
        }
        return Promise.resolve([{ cimaExtra: opts.cimaExtraGuardado ?? null }]);
      }
      executes.push(q);
      historiaCalls += 1;
      const h = opts.historia;
      if (historiaCalls === 1) return Promise.resolve(h ? [{ id: h.id, hash: h.hash }] : []);
      return Promise.resolve((h?.nombres ?? []).map((nombre) => ({ nombre })));
    },
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(opts.contrariosExistentes ?? []),
      }),
    }),
  };

  const dbc: SiniestroDbClient = {
    transaction: (async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) as never,
    insert: makeInsert(inserts) as never,
  };
  return {
    dbc,
    inserts,
    conflicts,
    executes,
    extras,
    get updateParams() {
      return updateParams;
    },
  };
}

// --- alta nueva: inserta siniestro + terceros cifrados + op_event in-tx ---
test("persistCimaSiniestro: alta nueva → inserta siniestro + tercero cifrado + op_event", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaSiniestro(
    input({
      mapped: mapped({
        figuras: [
          {
            kind: "contrario",
            nombre: "Tercero Malo",
            telefono: "600111222",
            matricula: "1234ABC",
            marcaModelo: "SEAT Ibiza",
            compania: "Mapfre",
            numeroPoliza: "POL999",
            esConductor: true,
            ibaEnCocheCliente: null,
            claseFiguraRaw: "AD",
          },
        ],
      }),
    }),
    dbc,
  );
  assert.deepEqual(res, { ok: true, outcome: "persisted", siniestroId: "sin-new-1" });

  const sinInsert = inserts.find((i) => i.table === siniestros);
  assert.ok(sinInsert, "debe insertar en siniestros");
  const sinVals = sinInsert!.values as Record<string, unknown>;
  assert.equal(sinVals.origen, "cima");
  assert.equal(sinVals.eiacXmlHash, "deadbeef");
  assert.equal(sinVals.idSiniestroEntidad, "SIN000001");
  assert.equal(sinVals.codigoEntidadDgs, "C0109");
  assert.equal(sinVals.polizaId, "pol-1");
  assert.equal(sinVals.clienteId, "cli-1");
  // lugar cifrado (no claro): no debe ser el texto plano.
  assert.notEqual(sinVals.lugarDireccion, "Calle Falsa 1");
  assert.ok(String(sinVals.lugarDireccion).startsWith("v1:"), "lugarDireccion cifrado v1:");
  // comentario en claro (campo operativo).
  assert.equal(sinVals.comentario, "Colisión");

  const contrarioInsert = inserts.find((i) => i.table === siniestroContrarios);
  assert.ok(contrarioInsert, "debe insertar el contrario");
  const cVals = contrarioInsert!.values as Record<string, unknown>;
  // PII Tier-1 cifrada: nombre/telefono/matricula NO en claro.
  assert.ok(String(cVals.nombre).startsWith("v1:"), "nombre cifrado");
  assert.ok(String(cVals.telefono).startsWith("v1:"), "telefono cifrado");
  assert.ok(String(cVals.matricula).startsWith("v1:"), "matricula cifrada");
  // marcaModelo/compania/numeroPoliza en claro (no PII Tier-1).
  assert.equal(cVals.marcaModelo, "SEAT Ibiza");
  assert.equal(cVals.compania, "Mapfre");
  assert.equal(cVals.esConductor, true);

  const opEvent = inserts.find((i) => i.table === operationalEvents);
  assert.ok(opEvent, "debe emitir op_event in-tx");
  const evVals = opEvent!.values as Record<string, unknown>;
  assert.equal(evVals.eventName, "cima_siniestro_persisted"); // apertura (INSERT)
  assert.equal(evVals.sourceEventId, "deadbeef:SIN000001"); // determinista
  assert.equal((evVals.payload as Record<string, unknown>).yaExistia, false);
  assert.equal((evVals.payload as Record<string, unknown>).figurasPersisted, 1);
  // payload SIN PII: no nombre del tercero ni teléfono en claro.
  const payloadStr = JSON.stringify(evVals.payload);
  assert.doesNotMatch(payloadStr, /Tercero Malo/);
  assert.doesNotMatch(payloadStr, /600111222/);
});

// --- M1: numeroLesionados (conteo no-PII) aparece en el payload del op_event ---
test("persistCimaSiniestro: numeroLesionados se incluye en el payload de persist", async () => {
  const { dbc, inserts } = makeFakeDbc();
  await persistCimaSiniestro(
    input({ mapped: mapped({ numeroLesionados: 3 }) }),
    dbc,
  );
  const opEvent = inserts.find((i) => i.table === operationalEvents);
  assert.ok(opEvent, "debe emitir op_event in-tx");
  const payload = (opEvent!.values as Record<string, unknown>).payload as Record<
    string,
    unknown
  >;
  assert.equal(payload.numeroLesionados, 3); // señal preservada en el audit trail
});

// --- M2: codigoEntidadDgs null → guard de cuarentena, NO inserta siniestro ---
test("persistCimaSiniestro: codigoEntidadDgs null → review falta_codigo_entidad_dgs", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaSiniestro(
    input({ mapped: mapped({ codigoEntidadDgs: null }) }),
    dbc,
  );
  assert.deepEqual(res, {
    ok: false,
    outcome: "review",
    reason: "falta_codigo_entidad_dgs",
  });
  assert.ok(!inserts.some((i) => i.table === siniestros), "NO inserta el siniestro");
});

// --- testigo y lesionado van a su subtabla ---
test("persistCimaSiniestro: testigo → siniestro_testigos; lesionado → siniestro_lesionados", async () => {
  const { dbc, inserts } = makeFakeDbc();
  await persistCimaSiniestro(
    input({
      mapped: mapped({
        figuras: [
          { kind: "testigo", nombre: "T", telefono: "611", matricula: null, marcaModelo: null, compania: null, numeroPoliza: null, esConductor: null, ibaEnCocheCliente: null, claseFiguraRaw: "TE" },
          { kind: "lesionado", nombre: "L", telefono: null, matricula: null, marcaModelo: null, compania: null, numeroPoliza: null, esConductor: null, ibaEnCocheCliente: true, claseFiguraRaw: "LE" },
        ],
      }),
    }),
    dbc,
  );
  assert.ok(inserts.some((i) => i.table === siniestroTestigos), "testigo insertado");
  const les = inserts.find((i) => i.table === siniestroLesionados);
  assert.ok(les, "lesionado insertado");
  assert.equal((les!.values as Record<string, unknown>).ibaEnCocheCliente, true);
});

// --- LOO-755 movimiento (361) sobre siniestro ya ingestado (311): UPDATE del
//     estado, NO re-inserta terceros, op_event cima_siniestro_actualizado ---
test("persistCimaSiniestro: movimiento (361) → UPDATE estado, no re-inserta terceros, op_event actualizado", async () => {
  // wasInserted=false ⇒ la fila existía y el conflicto la actualizó (xmax≠0).
  const { dbc, inserts } = makeFakeDbc({
    siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }],
  });
  const res = await persistCimaSiniestro(
    input({
      xmlHash: "feedface", // cada movimiento trae un xmlHash distinto
      mapped: mapped({
        estado: "cerrado", // el 361 cierra el siniestro que el 311 abrió
        figuras: [
          { kind: "contrario", nombre: "X", telefono: null, matricula: null, marcaModelo: null, compania: null, numeroPoliza: null, esConductor: null, ibaEnCocheCliente: null, claseFiguraRaw: "AD" },
        ],
      }),
    }),
    dbc,
  );
  assert.deepEqual(res, { ok: true, outcome: "persisted", siniestroId: "sin-existing-1" });

  // El UPSERT lleva estado=cerrado en los values (el set lo aplica con onConflict).
  const sinUpsert = inserts.find((i) => i.table === siniestros);
  assert.ok(sinUpsert, "ejecuta el upsert del siniestro");
  assert.equal((sinUpsert!.values as Record<string, unknown>).estado, "cerrado");

  // Un movimiento NO re-inserta un contrario que ya está (D8: idempotencia),
  // aunque venga con MENOS datos: aquí el fake no tiene ninguno guardado y "X"
  // es nuevo → se inserta (fusión, 28/09/2026). El caso «ya estaba» va aparte.
  assert.equal(
    inserts.filter((i) => i.table === siniestroContrarios).length,
    1,
    "movimiento inserta el contrario NUEVO (el SIN es delta)",
  );

  // op_event de UPDATE: cima_siniestro_actualizado, sourceEventId con su xmlHash.
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "emite op_event in-tx");
  const evVals = ev!.values as Record<string, unknown>;
  assert.equal(evVals.eventName, "cima_siniestro_actualizado");
  assert.equal(evVals.sourceEventId, "feedface:SIN000001");
  assert.equal((evVals.payload as Record<string, unknown>).yaExistia, true);
  assert.equal((evVals.payload as Record<string, unknown>).figurasPersisted, 1);
});

// --- 20/09/2026: un movimiento sin DanosSiniestro NO borra el desglose ya
//     conocido. `danosCima` va en el `set` como `coalesce(excluded.danos_cima,
//     …)`, no como el valor crudo (que sería NULL cuando el 361 no repite el
//     bloque) — mismo patrón que `datos_especificos` en pull-persist.ts. ---
test("persistCimaSiniestro: movimiento sin danos → el UPDATE conserva el desglose previo (coalesce, no sobrescribe a NULL)", async () => {
  const { dbc, conflicts } = makeFakeDbc({
    siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }],
  });
  await persistCimaSiniestro(
    input({ mapped: mapped({ danos: [] }) }), // el 361 no repite ImplicadoDiversos
    dbc,
  );
  const conflict = conflicts.find((c) => c.table === siniestros);
  assert.ok(conflict, "ejecuta el onConflictDoUpdate del siniestro");
  const set = conflict!.set as Record<string, unknown>;
  // NO puede ser el valor crudo (null): eso pisaría el desglose ya persistido.
  assert.notEqual(set.danosCima, null);
  assert.notEqual(Array.isArray(set.danosCima), true);
});

test("persistCimaSiniestro: la tramitación de la compañía se FUSIONA y no toca lo que teclea el corredor", async () => {
  const { dbc, conflicts, inserts } = makeFakeDbc({
    siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }],
  });
  await persistCimaSiniestro(
    input({
      mapped: mapped({
        acciones: [{ accion: "EP", fecha: "2026-09-01", descripcion: "Encargado", situacion: "EC", figuras: ["PE"], figurasDetalle: [] }],
        importeReserva: "1000.00",
        totalPagos: "250.00",
        posicion: "CU",
      }),
    }),
    dbc,
  );
  const alta = inserts.find((i) => i.table === siniestros)?.values as Record<string, unknown>;
  assert.equal(alta.reservaCima, "1000.00");
  assert.equal(alta.posicionCima, "CU");
  assert.equal(Array.isArray(alta.accionesCima), true);
  const set = conflicts.find((c) => c.table === siniestros)!.set as Record<string, unknown>;
  // Históricos: expresión SQL de fusión, nunca el array crudo (que sustituiría).
  for (const k of ["situacionesCima", "accionesCima", "pagosCima", "reservaCima", "totalPagosCima", "posicionCima"]) {
    assert.ok(set[k] !== undefined && !Array.isArray(set[k]) && typeof set[k] !== "string", `${k} debe ser una expresión SQL`);
  }
  // Los campos manuales del corredor NO se tocan desde CIMA.
  for (const k of ["reservaImporte", "indemnizacionImporte", "seConsideraCulpable"]) {
    assert.equal(set[k], undefined, `${k} es del corredor`);
    assert.equal(alta[k], undefined, `${k} es del corredor`);
  }
});

// --- LOO-755 replay del MISMO movimiento → idempotente (op_event dedup, sin churn) ---
test("persistCimaSiniestro: replay del mismo movimiento → idempotente, op_event actualizado dedup", async () => {
  const { dbc, inserts } = makeFakeDbc({
    siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }],
  });
  // Mismo movimiento (mismo xmlHash) reprocesado: el upsert vuelve a hacer UPDATE
  // (resultado idéntico) y el op_event lo dedup onConflictDoNothing(eventName, srcId).
  const res = await persistCimaSiniestro(
    input({ xmlHash: "feedface", mapped: mapped({ estado: "cerrado" }) }),
    dbc,
  );
  assert.deepEqual(res, { ok: true, outcome: "persisted", siniestroId: "sin-existing-1" });
  assert.ok(!inserts.some((i) => i.table === siniestroContrarios), "replay no inserta terceros");
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.equal((ev!.values as Record<string, unknown>).eventName, "cima_siniestro_actualizado");
  assert.equal((ev!.values as Record<string, unknown>).sourceEventId, "feedface:SIN000001");
});

// --- cuarentena: sin match → NO inserta siniestro, emite review op_event ---
test("persistCimaSiniestro: sin match (cuarentena) → review op_event, sin insert siniestro", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaSiniestro(input({ match: null }), dbc);
  assert.deepEqual(res, { ok: false, outcome: "review", reason: "sin_poliza_en_cartera" });
  assert.ok(!inserts.some((i) => i.table === siniestros), "NO inserta el siniestro");
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "emite op_event de cuarentena");
  assert.equal((ev!.values as Record<string, unknown>).eventName, "cima_siniestro_sin_poliza_review");
  assert.equal((ev!.values as Record<string, unknown>).sourceEventId, "deadbeef:SIN000001");
});

// --- LOO-826 A1 — tenant guard (hallazgo #18): entidad NO autorizada → review + op_event ---
test("persistCimaSiniestro: entidad no autorizada → review + op_event, SIN insert de siniestro", async () => {
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "C0058"; // C0109 (fixture) fuera de la allowlist
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaSiniestro(input(), dbc);
  assert.deepEqual(res, {
    ok: false,
    outcome: "review",
    reason: "codigo_entidad_no_autorizado:C0109/C0109",
  });
  assert.equal(
    inserts.find((i) => i.table === siniestros),
    undefined,
    "NO debe insertar el siniestro",
  );
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "debe emitir op_event Art.30");
  const values = ev!.values as Record<string, unknown>;
  assert.equal(values.eventName, "cima_entidad_no_autorizada");
  assert.equal(values.sourceEventId, "deadbeef:siniestro:entidad_no_autorizada");
  const payload = values.payload as Record<string, unknown>;
  assert.equal(payload.objeto, "siniestro");
  assert.equal(payload.codigoEntidad, "C0109");
  assert.equal(payload.codigoEntidadDgs, "C0109");
});

test("persistCimaSiniestro: allowlist vacía → fail-closed (nada persiste)", async () => {
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "";
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaSiniestro(input(), dbc);
  assert.equal(res.ok, false);
  assert.equal((res as { outcome: string }).outcome, "review");
  assert.equal(inserts.find((i) => i.table === siniestros), undefined);
});

// ─── 28/09/2026 — huecos de la auditoría de cobertura del SIN ───────────────

const sqlTexto = (x: unknown) => new PgDialect().sqlToQuery(x as never).sql;

function contrario(over: Partial<MappedFigura> = {}): MappedFigura {
  return {
    kind: "contrario",
    nombre: "Fulano Ficticio",
    telefono: "699000111",
    matricula: null,
    marcaModelo: null,
    compania: "ASEGURADORA INVENTADA SA",
    numeroPoliza: "7654321",
    esConductor: null,
    ibaEnCocheCliente: null,
    claseFiguraRaw: null,
    codigoEntidadDgs: "M0083",
    responsabilidad: "CAUSANTE",
    numeroLesionados: 2,
    ...over,
  };
}

test("huecos: el alta guarda las columnas nuevas y CIFRA toda la PII (contacto, conductores, contrario, persona física)", async () => {
  const { dbc, inserts } = makeFakeDbc();
  await persistCimaSiniestro(
    input({
      mapped: mapped({
        fechaDeclaracion: "2026-03-04",
        daa: false,
        responsabilidad: "PERJUDICADO",
        totalRecobros: "10.00",
        reservaDesglose: { descripcion: "RESERVA POR COBERTURAS=16-400.00", coberturas: [{ cobertura: "16", importe: "400.00" }] },
        convenios: ["SC"],
        expedientes: [{ numero: "EXP1", clase: "DP", estado: "PE", fechaInicio: null, fechaFin: null, importeReserva: "1.00", totalPagos: null, totalRecobros: null, coberturas: [] }],
        riesgo: { id: "2", descripcion: "RIESGO DOS", coberturas: [] },
        contactoNombre: "Mengana Inventada",
        contactoTelefono: "622333444",
        vehiculo: { matricula: "0000XXX", marca: "MARCA", modelo: "MODELO", conductorNombre: "Zutano Falso" },
        vehiculoContrario: { matricula: "1111YYY", marcaModelo: "MARCA X", conductorNombre: "Perengano", otros: [{ idDato: "OTRO", descripcion: null, valor: "secreto" }] },
        asistencias: [
          { clase: "PE", razonSocial: "PERITOS INVENTADOS SL", nombre: null, descripcion: "Perito" },
          { clase: "RE", razonSocial: null, nombre: "Reparador Ficticio", descripcion: "Reparación" },
        ],
        acciones: [{ accion: "EP", fecha: "2026-03-05", descripcion: null, situacion: "EC", figuras: ["PE"], figurasDetalle: [{ clase: "PE", razonSocial: null, nombre: "Perito Persona" }] }],
        refMediador: "MED-77",
        descripcion: "Fuga en baño",
        contactoObservaciones: "Llamar por la tarde",
        figuras: [contrario()],
      }),
    }),
    dbc,
  );
  const v = inserts.find((i) => i.table === siniestros)!.values as Record<string, unknown>;
  assert.equal(v.fechaDeclaracion, "2026-03-04");
  assert.equal(v.daaCima, false);
  assert.equal(v.responsabilidadCima, "PERJUDICADO");
  assert.equal(v.totalRecobrosCima, "10.00");
  assert.deepEqual(v.conveniosCima, ["SC"]);
  assert.equal((v.expedientesCima as unknown[]).length, 1);
  assert.deepEqual(v.riesgoCima, { id: "2", descripcion: "RIESGO DOS", coberturas: [] });
  assert.equal(v.refMediadorCima, "MED-77");
  assert.equal(v.descripcionCima, "Fuga en baño", "descripción en claro (ya viene tapada del mapper)");
  assert.ok(String(v.contactoObservacionesCima).startsWith("v1:"), "observaciones del contacto cifradas");
  assert.ok(String(v.contactoNombreCima).startsWith("v1:"), "contacto nombre cifrado");
  assert.ok(String(v.contactoTelefonoCima).startsWith("v1:"), "contacto teléfono cifrado");
  const veh = v.vehiculoCima as Record<string, unknown>;
  assert.equal(veh.matricula, "0000XXX", "matrícula del asegurado en claro, como en la póliza");
  assert.ok(String(veh.conductorNombre).startsWith("v1:"), "conductor cifrado");
  const vc = v.vehiculoContrarioCima as Record<string, unknown>;
  assert.equal(vc.marcaModelo, "MARCA X");
  assert.ok(String(vc.matricula).startsWith("v1:"), "matrícula del contrario cifrada");
  assert.ok(String(vc.conductorNombre).startsWith("v1:"), "conductor del contrario cifrado");
  const asis = v.asistenciasCima as Array<Record<string, unknown>>;
  assert.equal(asis[0].razonSocial, "PERITOS INVENTADOS SL", "empresa en claro");
  assert.ok(String(asis[1].nombre).startsWith("v1:"), "persona física cifrada");
  const acc = v.accionesCima as Array<{ figurasDetalle: Array<Record<string, unknown>> }>;
  assert.ok(String(acc[0].figurasDetalle[0].nombre).startsWith("v1:"), "nombre de figura de acción cifrado");
  // Nada de PII en claro en toda la fila del siniestro.
  const fila = JSON.stringify(v);
  for (const pii of ["Mengana", "622333444", "Zutano", "1111YYY", "Perengano", "secreto", "Reparador Ficticio", "Perito Persona", "Llamar por la tarde"]) {
    assert.doesNotMatch(fila, new RegExp(pii), `${pii} no puede ir en claro`);
  }
  // El contrario real guarda compañía/DGS/responsabilidad/lesionados y cifra su PII.
  const c = inserts.find((i) => i.table === siniestroContrarios)!.values as Record<string, unknown>;
  assert.equal(c.compania, "ASEGURADORA INVENTADA SA");
  assert.equal(c.codigoEntidadDgs, "M0083");
  assert.equal(c.numeroPoliza, "7654321");
  assert.equal(c.responsabilidad, "CAUSANTE");
  assert.equal(c.numeroLesionados, 2);
  assert.ok(String(c.nombre).startsWith("v1:"));
  assert.ok(String(c.telefono).startsWith("v1:"));
});

test("huecos: el UPDATE fusiona convenios/expedientes/asistencias y conserva (coalesce) la foto actual", async () => {
  const { dbc, conflicts } = makeFakeDbc({ siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }] });
  await persistCimaSiniestro(input(), dbc);
  const set = conflicts.find((c) => c.table === siniestros)!.set as Record<string, unknown>;
  const fusion = (k: string) => {
    const t = sqlTexto(set[k]);
    assert.match(t, /jsonb_array_elements/, `${k} debe FUSIONARSE, no sustituirse`);
    return t;
  };
  fusion("conveniosCima");
  assert.match(fusion("expedientesCima"), /->>'numero'/, "un expediente se identifica por su número");
  assert.match(fusion("asistenciasCima"), /'nombre'/, "el nombre cifrado no entra en la clave (no es determinista)");
  assert.match(fusion("accionesCima"), /'figurasDetalle'/);
  for (const k of [
    "fechaDeclaracion", "daaCima", "responsabilidadCima", "totalRecobrosCima", "reservaDesgloseCima",
    "riesgoCima", "contactoNombreCima", "contactoTelefonoCima", "vehiculoCima", "vehiculoContrarioCima", "refMediadorCima",
    "descripcionCima", "contactoObservacionesCima",
  ]) {
    assert.match(sqlTexto(set[k]), /coalesce\(excluded\./, `${k}: un fichero que no lo trae no lo borra`);
  }
});

test("huecos: movimiento con un contrario YA guardado (aunque venga con menos datos) no lo duplica; uno distinto sí entra", async () => {
  const guardado = {
    nombre: encryptField("Fulano Ficticio"),
    telefono: encryptField("699000111"),
    matricula: null,
    compania: "ASEGURADORA INVENTADA SA",
    numeroPoliza: "7654321",
    codigoEntidadDgs: "M0083",
    responsabilidad: "CAUSANTE",
  };
  const { dbc, inserts } = makeFakeDbc({
    siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }],
    contrariosExistentes: [guardado],
  });
  await persistCimaSiniestro(
    input({
      mapped: mapped({
        figuras: [
          contrario({ telefono: null, numeroLesionados: null }), // repetido, más pobre
          contrario({ nombre: "Otro Distinto", telefono: "688000000" }), // otra persona
        ],
      }),
    }),
    dbc,
  );
  const ins = inserts.filter((i) => i.table === siniestroContrarios);
  assert.equal(ins.length, 1, "solo entra el contrario nuevo");
  assert.ok(String((ins[0].values as Record<string, unknown>).nombre).startsWith("v1:"));
});

test("contrarioCubierto: mismos datos → sí; un identificador distinto → no (no se funden dos personas)", () => {
  const g = { nombre: "Fulano Ficticio", telefono: "699 000 111", matricula: null, compania: "X", numeroPoliza: "1", codigoEntidadDgs: "M0083", responsabilidad: "CAUSANTE" };
  assert.equal(contrarioCubierto(g, contrario({ compania: "x", numeroPoliza: "1", telefono: "699000111" })), true);
  assert.equal(contrarioCubierto(g, contrario({ compania: "X", numeroPoliza: "1", telefono: "600000000" })), false);
  assert.equal(contrarioCubierto(g, contrario({ nombre: null, telefono: null, compania: null, numeroPoliza: null, codigoEntidadDgs: null, responsabilidad: null })), false, "vacío no cubre");
});

// ─────────────────────────────────────────────────────────────────────────────
// 03/10/2026 — Un SIN MÁS VIEJO que el último aplicado no retrocede el siniestro.
// ─────────────────────────────────────────────────────────────────────────────
const SIN_GUARDADO = "C0058_5239640_SIN_361_1_20261001_20261001101010000000001.zip";
const SIN_VIEJO = "C0058_5239640_SIN_361_1_20260801_20260801101010000000001.zip";
const SIN_NUEVO = "C0058_5239640_SIN_361_1_20261002_20261002101010000000001.zip";

function ficheroLlamado(nombre: string): FicheroParseado {
  return { ...fichero(), nombreFicheroComprimido: nombre };
}

const MUTABLES_PISADOS = ["estado", "tipo", "fechaHora", "lugarDireccion", "lugarCp", "lugarCiudad", "lugarProvincia"];
const FOTO = ["reservaCima", "indemnizacionCima", "totalPagosCima", "posicionCima", "danosCima", "riesgoCima", "vehiculoCima", "fechaDeclaracion"];

async function persistirSobreHistoria(nombre: string) {
  const fake = makeFakeDbc({
    siniestroReturning: [{ id: "sin-existing-1", wasInserted: false }],
    historia: { id: "sin-existing-1", hash: "hash-apertura", nombres: [SIN_GUARDADO] },
  });
  const res = await persistCimaSiniestro(
    input({
      fichero: ficheroLlamado(nombre),
      xmlHash: "viejo01",
      mapped: mapped({
        estado: "abierto", // lo guardado (2026-10-01) ya está cerrado
        importeReserva: "999.00",
        expedientes: [{ numero: "EXP1", estado: "PE" } as never],
      }),
    }),
    fake.dbc,
  );
  assert.equal(res.ok, true);
  const set = fake.conflicts.find((c) => c.table === siniestros)!.set as Record<string, unknown>;
  const ev = fake.inserts.find((i) => i.table === operationalEvents)!.values as Record<string, unknown>;
  return { set, ev, executes: fake.executes };
}

test("orden SIN: un 361 MÁS VIEJO (20260801) que lo aplicado (20261001) solo RELLENA: lo guardado gana", async () => {
  const { set, ev, executes } = await persistirSobreHistoria(SIN_VIEJO);
  assert.match(sqlTexto(executes[0]), /for update/i, "bloquea la fila antes de decidir");
  for (const k of [...MUTABLES_PISADOS, ...FOTO]) {
    assert.match(sqlTexto(set[k]), /^coalesce\("siniestros"\."\w+", excluded\.\w+\)$/, `${k}: gana lo guardado`);
  }
  // Expediente con el mismo número: gana el guardado (no vuelve LI → PE).
  assert.match(sqlTexto(set.expedientesCima), /t\.n asc\) u\)$/, "expedientes: stored-wins");
  const p = ev.payload as Record<string, unknown>;
  assert.equal(p.aplicadoComo, "relleno");
  assert.equal(p.claveMasNueva, SIN_GUARDADO);
});

test("orden SIN: un 361 MÁS NUEVO que lo aplicado se aplica entero (como siempre)", async () => {
  const { set, ev } = await persistirSobreHistoria(SIN_NUEVO);
  for (const k of MUTABLES_PISADOS) {
    const v = set[k] as { getSQL?: unknown } | null;
    assert.ok(v == null || typeof v.getSQL !== "function", `${k}: lo pisa el valor del fichero (no una expresión)`);
  }
  for (const k of FOTO) {
    assert.match(sqlTexto(set[k]), /^coalesce\(excluded\.\w+, "siniestros"\."\w+"\)$/, `${k}: gana el fichero`);
  }
  assert.match(sqlTexto(set.expedientesCima), /t\.n desc\) u\)$/, "expedientes: gana el fichero");
  const p = ev.payload as Record<string, unknown>;
  assert.equal(set.estado, "abierto", "estado del fichero nuevo");
  assert.equal(p.aplicadoComo, undefined);
  assert.equal(p.claveMasNueva, undefined);
});

test("orden SIN: replay del MISMO fichero (clave igual) NO es más viejo → se aplica entero", async () => {
  const { set } = await persistirSobreHistoria(SIN_GUARDADO);
  assert.match(sqlTexto(set.reservaCima), /^coalesce\(excluded\./);
});

test("orden SIN: nombre ilegible con historia → relleno; sin historia → entero", async () => {
  const { set, ev } = await persistirSobreHistoria("manual-subido.xml");
  assert.match(sqlTexto(set.estado), /^coalesce\("siniestros"\./);
  assert.equal((ev.payload as Record<string, unknown>).aplicadoComo, "relleno");
  const fake = makeFakeDbc(); // fila inexistente: sin historia
  await persistCimaSiniestro(input({ fichero: ficheroLlamado("manual-subido.xml") }), fake.dbc);
  const set2 = fake.conflicts.find((c) => c.table === siniestros)!.set as Record<string, unknown>;
  assert.equal(set2.estado, "abierto", "sin historia: se aplica entero");
});

test("claveFicheroSin: misma fecha y seq → desempata 311 < 361 < 399 < desconocido; la seq y la fecha mandan", () => {
  const k = (proc: string, fecha = "20260901", seq = "20260901000000000000001") =>
    claveFicheroSin(`C0058_5239640_SIN_${proc}_1_${fecha}_${seq}.zip`)!;
  const orden = [k("311"), k("361"), k("399"), k("500"), k("700")];
  for (let i = 1; i < orden.length; i++) assert.ok(compararClaveSin(orden[i - 1], orden[i]) < 0, `posición ${i}`);
  assert.ok(compararClaveSin(k("361", "20260901", "20260901000000000000001"), k("361", "20260901", "20260901000000000000002")) < 0, "seq");
  assert.ok(compararClaveSin(k("361", "20260901", "999"), k("361", "20260901", "1000")) < 0, "seq numérico, no lexicográfico");
  assert.ok(compararClaveSin(k("399", "20260831"), k("311", "20260901")) < 0, "la fecha del dato manda sobre el proceso");
  assert.equal(compararClaveSin(k("361"), k("361")), 0);
  for (const raro of ["", "SIN.zip", "manual.xml", "C0058_X_POL_311_1_20260901_1.zip", "C0058_X_SIN_311_1_20261301_1.zip", "C0058_X_SIN_311_1_2026091_1.zip"]) {
    assert.equal(claveFicheroSin(raro), null, raro);
  }
  assert.equal(claveFicheroSin(null), null);
});

test("esMasViejo: más viejo → sí; igual o más nuevo → no; almacenada ilegible → no", () => {
  assert.equal(esMasViejo(SIN_VIEJO, SIN_GUARDADO), true);
  assert.equal(esMasViejo(SIN_GUARDADO, SIN_GUARDADO), false);
  assert.equal(esMasViejo(SIN_NUEVO, SIN_GUARDADO), false);
  assert.equal(esMasViejo(SIN_VIEJO, null), false);
  assert.equal(esMasViejo("manual.xml", SIN_GUARDADO), true);
});

test("claveFicheroSin: mismo día, 399 (cierre 10:00) y luego 361 (reapertura 15:00) → el 361 es MÁS NUEVO (manda la seq)", () => {
  const cierre = "C0058_X_SIN_399_1_20260901_20260901100000000000001.zip";
  const reapertura = "C0058_X_SIN_361_1_20260901_20260901150000000000001.zip";
  assert.ok(compararClaveSin(claveFicheroSin(cierre)!, claveFicheroSin(reapertura)!) < 0);
  assert.equal(esMasViejo(reapertura, cierre), false, "la reapertura no se descarta");
  assert.equal(esMasViejo(cierre, reapertura), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 03/10/2026 — `siniestros.cima_extra` (0106): el «resto» del SIN se guarda.
// ─────────────────────────────────────────────────────────────────────────────
const E = (ruta: string, valor: string) => ({ ruta, valor });
const guardadoDe = (f: { updateParams: unknown[] | null }) => {
  assert.ok(f.updateParams, "hubo UPDATE de cima_extra");
  return JSON.parse(String(f.updateParams![0])) as { cimaExtra: Array<{ ruta: string; valor: string }>; cimaExtraTruncado?: boolean };
};

test("cimaExtra SIN: alta con resto → se escribe en siniestros.cima_extra (sin leer nada previo)", async () => {
  olvidarColumnasOpcionales();
  const fake = makeFakeDbc();
  const res = await persistCimaSiniestro(
    input({ mapped: mapped({ cimaExtra: [E("Siniestro.DatosSiniestro.CampoX", "1")] }) }),
    fake.dbc,
  );
  assert.equal(res.ok, true);
  assert.deepEqual(guardadoDe(fake), { cimaExtra: [E("Siniestro.DatosSiniestro.CampoX", "1")] });
  assert.equal(fake.extras.filter((t) => /^\s*select/i.test(t) && !/pg_attribute/.test(t)).length, 0, "alta: no hay nada guardado que leer");
});

test("cimaExtra SIN: `[]` (mirado, no hay) se escribe; `undefined` (no se sabe) NO toca la columna", async () => {
  olvidarColumnasOpcionales();
  const vacio = makeFakeDbc();
  await persistCimaSiniestro(input({ mapped: mapped({ cimaExtra: [] }) }), vacio.dbc);
  assert.deepEqual(guardadoDe(vacio), { cimaExtra: [] });
  const nada = makeFakeDbc();
  await persistCimaSiniestro(input({ mapped: mapped() }), nada.dbc);
  assert.equal(nada.updateParams, null);
  assert.deepEqual(nada.extras, [], "ni siquiera mira si existe la columna");
});

test("cimaExtra SIN: movimiento MÁS NUEVO → gana el fichero por ruta y conserva lo que el delta no repite", async () => {
  olvidarColumnasOpcionales();
  const fake = makeFakeDbc({
    siniestroReturning: [{ id: "sin-1", wasInserted: false }],
    historia: { id: "sin-1", hash: null, nombres: [SIN_GUARDADO] },
    cimaExtraGuardado: { cimaExtra: [E("S.A", "viejo"), E("S.B", "b")] },
  });
  await persistCimaSiniestro(
    input({ fichero: ficheroLlamado(SIN_NUEVO), mapped: mapped({ cimaExtra: [E("S.A", "nuevo"), E("S.C", "c")] }) }),
    fake.dbc,
  );
  assert.deepEqual(guardadoDe(fake).cimaExtra, [E("S.A", "nuevo"), E("S.C", "c"), E("S.B", "b")]);
});

test("cimaExtra SIN: un SIN MÁS VIEJO (relleno) NO pisa el resto guardado; solo añade rutas nuevas", async () => {
  olvidarColumnasOpcionales();
  const fake = makeFakeDbc({
    siniestroReturning: [{ id: "sin-1", wasInserted: false }],
    historia: { id: "sin-1", hash: null, nombres: [SIN_GUARDADO] },
    cimaExtraGuardado: { cimaExtra: [E("S.A", "guardado"), E("S.B", "b")] },
  });
  await persistCimaSiniestro(
    input({ fichero: ficheroLlamado(SIN_VIEJO), mapped: mapped({ cimaExtra: [E("S.A", "viejo"), E("S.C", "c")] }) }),
    fake.dbc,
  );
  assert.deepEqual(guardadoDe(fake).cimaExtra, [E("S.A", "guardado"), E("S.B", "b"), E("S.C", "c")]);
});

test("cimaExtra SIN: columna AÚN NO creada en la BD → no se escribe y el siniestro se persiste igual", async () => {
  olvidarColumnasOpcionales();
  const fake = makeFakeDbc({ columnaCimaExtra: false });
  const res = await persistCimaSiniestro(
    input({ mapped: mapped({ cimaExtra: [E("S.A", "1")] }) }),
    fake.dbc,
  );
  assert.equal(res.ok, true);
  assert.equal(res.outcome, "persisted");
  assert.equal(fake.updateParams, null, "sin columna no hay UPDATE (rompería la tx)");
  assert.ok(fake.inserts.some((i) => i.table === siniestros), "el siniestro entra");
  assert.ok(fake.inserts.some((i) => i.table === operationalEvents), "y su op_event");
});

test("fusionarCimaExtraSin: guardado ilegible = nada guardado; tope CIMA_EXTRA_MAX → truncado; truncado se arrastra", () => {
  assert.deepEqual(fusionarCimaExtraSin("basura", { entradas: [E("A", "1")], truncado: false }, false), {
    cimaExtra: [E("A", "1")],
  });
  const muchos = Array.from({ length: CIMA_EXTRA_MAX }, (_, i) => E(`N${i}`, "v"));
  const r = fusionarCimaExtraSin({ cimaExtra: muchos }, { entradas: [E("Z", "z")], truncado: false }, true);
  assert.equal(r.cimaExtra.length, CIMA_EXTRA_MAX);
  assert.equal(r.cimaExtraTruncado, true);
  const t = fusionarCimaExtraSin({ cimaExtra: [], cimaExtraTruncado: true }, { entradas: [], truncado: false }, false);
  assert.equal(t.cimaExtraTruncado, true, "lo truncado antes sigue sin estar completo");
});
