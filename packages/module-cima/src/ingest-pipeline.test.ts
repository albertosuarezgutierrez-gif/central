import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  runCimaPull,
  type CimaAuditEvent,
  type CimaPullDeps,
  type CimaFicheroFsmEstado,
  type LedgerEntry,
  type PersistInput,
} from "./ingest-pipeline.ts";
import { mapEiacPolAll, type EiacPolMapped } from "./eiac-pol-mapper.ts";
import { mapEiacRecAll, type ParsedEiacRec } from "./eiac-rec-mapper.ts";
import { mapEiacSinAll, type ParsedEiacSin } from "./eiac-sin-mapper.ts";
import { parseEiacXml } from "./manual-xml.ts";
import { CODIGO_ENTIDAD_FORMATO_DESCONOCIDO } from "./codigo-entidad.ts";
import type { FicheroParseado } from "./wse-schemas.ts";
// PORT central (fase 1): sin capa de BD todavía; copia LITERAL de los valores de
// `cimaFicheroEstadoEnum` (pgEnum `cima_fichero_estado`, src/db/schema.ts del CRM).
// En la fase 2 este cepo vuelve a importar el enum del schema Drizzle portado.
const cimaFicheroEstadoEnum = {
  enumValues: ["pending", "persisted", "confirmed", "review", "review_salud", "deferred", "error"] as const,
};

// --- fixtures (datos SINTÉTICOS, nunca PII real) ---
function fichero(over: Partial<FicheroParseado> = {}): FicheroParseado {
  return {
    nombreFicheroComprimido: "F.zip",
    tipoObjeto: "POL",
    versionEiac: "6.0",
    codigoEntidad: "C0058",
    checksumVerified: false,
    datos: {},
    rawXml: "<x/>",
    zipEntryCount: 1,
    ...over,
  } as FicheroParseado;
}

// LOO-748 — wrapper array para los mocks de mapper (que ahora devuelve N pólizas).
function okMappedArr(over: Partial<EiacPolMapped> = {}): EiacPolMapped[] {
  return [okMapped(over)];
}

function okMapped(over: Partial<EiacPolMapped> = {}): EiacPolMapped {
  return {
    outcome: "ok",
    reviewReasons: [],
    idPolizaEntidad: "POL12345",
    codigoEntidadDgs: "C0058",
    ramoDgs: "241",
    situacion: "EV",
    // LOO-915 — coherente con `situacion: "EV"` (en vigor).
    estado: "activa",
    situacionConocida: true,
    // LOO-918 — auto ⇒ sin forma de riesgo no-auto que aprender.
    riesgoShape: [],
    fechaEfectoInicial: "2026-01-01",
    fechaVencimiento: "2027-01-01",
    tipoSeguro: "auto",
    aseguradora: "Allianz",
    tomador: {
      tipoPersona: "fisica",
      tipoIdentificacion: "NI",
      idPersona: "00000001R",
      nombreCompleto: "Nombre Apellido",
    },
    datosEspecificos: null,
    primaBruta: null,
    primaAnual: null,
    fraccionamiento: null,
    coberturas: [],
    intervinientes: [],
    ...over,
  };
}

type Calls = {
  ledger: LedgerEntry[];
  /** LOO-555 — todos los audit events emitidos (ledger-with-audit + audit-only). */
  audit: CimaAuditEvent[];
  persist: PersistInput[];
  /** LOO-551 — guarda [nombre, codigoEntidad] para validar que el body al adapter lleva ambos. */
  confirm: Array<{ nombre: string; codigoEntidad: string }>;
  /** LOO-748 — escrituras de ledger de FICHERO (recordFicheroLedger). */
  ficheroLedger: Array<{ ledger: LedgerEntry; polizasCount: number; polizasPersisted: number; polizaId: string | null; ackOk: boolean }>;
  /** Cuarentena de crudo (ver `recordRawQuarantine`). */
  rawQuarantine: Array<{ fichero: FicheroParseado; xmlHash: string; motivo: string | null; conIncidencia: boolean }>;
  /** Cobertura de campos (ver `recordFieldCoverage`). */
  fieldCoverage: Array<{
    tipoObjeto: string;
    codigoEntidad: string | null;
    rutas: readonly { ruta: string; hoja: boolean; leido: boolean }[];
  }>;
};

function makeDeps(over: Partial<CimaPullDeps> = {}): {
  deps: CimaPullDeps;
  calls: Calls;
} {
  const calls: Calls = { ledger: [], audit: [], persist: [], confirm: [], ficheroLedger: [], rawQuarantine: [], fieldCoverage: [] };
  const deps: CimaPullDeps = {
    mapper: () => okMappedArr(),
    computeXmlHash: (xml) => `hash:${xml.length}`,
    isDuplicateXmlHash: () => false,
    isConfirmedXmlHash: () => false,
    resolveCliente: async () => ({ status: "matched", clienteId: "cli-1" }),
    loadMatchCandidates: async () => [],
    persist: async (i) => {
      calls.persist.push(i);
      return { ok: true, polizaId: "pol-1" };
    },
    confirm: async (n, codigoEntidad) => {
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: true };
    },
    recordLedgerWithAudit: async ({ ledger, event }) => {
      calls.ledger.push(ledger);
      calls.audit.push(event);
    },
    recordAuditEvent: async (event) => {
      calls.audit.push(event);
    },
    recordFicheroLedger: async (input) => {
      calls.ficheroLedger.push(input);
    },
    recordRawQuarantine: async (input) => {
      calls.rawQuarantine.push(input);
    },
    recordFieldCoverage: async (input) => {
      calls.fieldCoverage.push(input);
    },
    log: () => {},
    ...over,
  };
  return { deps, calls };
}

// --- sentinel: los literales del pipeline son subset del enum del schema ---
test("CimaFicheroFsmEstado ⊆ cimaFicheroEstadoEnum", () => {
  const allowed = new Set<string>(cimaFicheroEstadoEnum.enumValues);
  const all: CimaFicheroFsmEstado[] = [
    "pending",
    "persisted",
    "confirmed",
    "review",
    "review_salud",
    "deferred",
    "error",
  ];
  for (const e of all) assert.ok(allowed.has(e), e);
});

// LOO-673 — datos_especificos (vehículo) del mapper llega íntegro a persist
test("mapped.datosEspecificos (vehículo) se propaga a persist", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => okMappedArr({ datosEspecificos: { matricula: "1234ABC", marca: "SEAT" } }),
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed"); // persist → confirm en no-dryRun
  assert.equal(calls.persist.length, 1);
  assert.deepEqual(calls.persist[0].mapped.datosEspecificos, {
    matricula: "1234ABC",
    marca: "SEAT",
  });
});

// (0a) guard multi-entry
test("zipEntryCount>1 → error, sin hash, sin persist, sin confirm", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero({ zipEntryCount: 2 })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "error");
  assert.equal(r.outcomes[0].xmlHash, null);
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.ledger[0].estado, "error");
});

// (0b) LOO-551 — guard codigoEntidad ausente (caso que cazó el ack-test contra prod TIREA)
test("LOO-551: codigoEntidad null → error, sin persist, sin confirm", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull(
    [fichero({ codigoEntidad: null })],
    deps,
    { dryRun: false },
  );
  assert.equal(r.outcomes[0].estado, "error");
  assert.match(r.outcomes[0].reason ?? "", /codigoEntidad ausente/);
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.confirm.length, 0); // CRÍTICO: no llamar confirm sin codigoEntidad → 400
  assert.equal(calls.ledger[0].estado, "error");
  assert.equal(calls.ledger[0].errorDetalle, "codigo_entidad_ausente");
});

test("LOO-551: codigoEntidad string vacío → error, sin persist, sin confirm", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull(
    [fichero({ codigoEntidad: "   " })], // whitespace puro
    deps,
    { dryRun: false },
  );
  assert.equal(r.outcomes[0].estado, "error");
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.confirm.length, 0);
});

// (1) sin rawXml → error
test("rawXml ausente → error", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero({ rawXml: null })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "error");
  assert.equal(calls.persist.length, 0);
});

// (2) DEDUP — el fix P1: confirma para sacar de la cola + ledger xml_hash null
test("xmlHash duplicado → confirma (dequeue) + ledger xml_hash null, sin persist", async () => {
  const { deps, calls } = makeDeps({ isDuplicateXmlHash: () => true });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].confirmed, true);
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.confirm.length, 1); // SÍ confirma (no deja en cola TIREA)
  assert.equal(calls.confirm[0].nombre, "F.zip");
  assert.equal(calls.confirm[0].codigoEntidad, "C0058"); // LOO-551 — body lleva codigoEntidad
  assert.equal(calls.ledger.length, 1);
  assert.equal(calls.ledger[0].xmlHash, null); // no colisiona con uq parcial
  assert.equal(calls.ledger[0].errorDetalle, "duplicate_xml_hash");
});

test("xmlHash duplicado + confirm falla → deferred (reintentar), confirmed false", async () => {
  const { deps } = makeDeps({
    isDuplicateXmlHash: () => true,
    confirm: async () => ({ ok: false, reason: "ack_no_ok" }),
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "deferred");
  assert.equal(r.outcomes[0].confirmed, false);
});

// LOO-700 — duplicado YA confirmado en el ledger: re-ACK inútil (TIREA no hace
// dequeue) → se SALTA el confirm() (ahorra ~4s/fichero, baja el pull bajo maxDuration).
test("xmlHash duplicado ya confirmado → NO re-confirma (skip re-ACK), sigue confirmed", async () => {
  const { deps, calls } = makeDeps({
    isDuplicateXmlHash: () => true,
    isConfirmedXmlHash: () => true,
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].confirmed, true);
  assert.equal(calls.confirm.length, 0); // CLAVE: no se llama a confirmarDescarga
  assert.equal(calls.ledger.length, 1);
  assert.equal(calls.ledger[0].errorDetalle, "duplicate_xml_hash");
  assert.match(r.outcomes[0].reason ?? "", /re-ACK saltado/);
  // audit refleja el skip
  const ev = calls.audit.find((a) => a.eventName === "cima_fichero_duplicate_replay");
  assert.equal(ev?.payload.reackSkipped, true);
  assert.equal(ev?.payload.ackOk, true);
});

test("xmlHash duplicado NO confirmado aún → SÍ reintenta el ACK", async () => {
  const { deps, calls } = makeDeps({
    isDuplicateXmlHash: () => true,
    isConfirmedXmlHash: () => false,
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.confirm.length, 1); // reintenta porque no estaba confirmado
});

test("xmlHash duplicado en dryRun → no confirma ni escribe ledger", async () => {
  const { deps, calls } = makeDeps({ isDuplicateXmlHash: () => true });
  const r = await runCimaPull([fichero()], deps, { dryRun: true });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.ledger.length, 0);
});

// (3) deferred no-POL
test("tipoObjeto SIN (flag OFF) → deferred, NO confirmar, ledger deferred", async () => {
  // makeDeps NO setea sinEnabled → SIN sigue cayendo a deferred (sin regresión).
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "deferred");
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.ledger[0].estado, "deferred");
});

// LOO-750 — (3-SIN) flag ON → procesa el siniestro (mapper SIN + match + persist)
test("tipoObjeto SIN (flag ON) → processSiniestro: persiste, confirma 1 vez", async () => {
  const sinMapped = {
    outcome: "ok" as const,
    reviewReasons: [],
    idSiniestroEntidad: "SIN0001",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL123456",
    fechaOcurrencia: "2026-03-01",
    estado: "abierto" as const,
    tipo: "17",
    lugarDireccion: null,
    lugarCp: null,
    lugarCiudad: null,
    lugarProvincia: null,
    comentario: null,
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
  };
  const persistSiniestroCalls: unknown[] = [];
  const { deps, calls } = makeDeps({
    sinEnabled: true,
    mapperSin: () => [sinMapped],
    loadSiniestroCandidates: async () => [
      { polizaId: "pol-1", clienteId: "cli-1", numeroPoliza: "POL123456", codigoEntidadDgs: "C0109" },
    ],
    persistSiniestro: async (i) => {
      persistSiniestroCalls.push(i);
      return { ok: true, outcome: "persisted", siniestroId: "sin-1" };
    },
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].siniestrosCount, 1);
  assert.equal(r.outcomes[0].siniestrosPersisted, 1);
  assert.equal(r.siniestrosTotal, 1);
  assert.equal(r.siniestrosPersisted, 1);
  assert.equal(persistSiniestroCalls.length, 1);
  assert.equal(calls.confirm.length, 1); // confirma 1 vez
  assert.equal(calls.persist.length, 0); // NO toca el persist de pólizas
});

// LOO-750 — flag ON pero sin póliza en cartera (match null) → review, NO confirma
test("tipoObjeto SIN (flag ON) sin póliza en cartera → review, NO confirma", async () => {
  const sinMapped = {
    outcome: "ok" as const,
    reviewReasons: [],
    idSiniestroEntidad: "SIN0002",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL999999",
    fechaOcurrencia: "2026-03-01",
    estado: "abierto" as const,
    tipo: "17",
    lugarDireccion: null,
    lugarCp: null,
    lugarCiudad: null,
    lugarProvincia: null,
    comentario: null,
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
  };
  const { deps, calls } = makeDeps({
    sinEnabled: true,
    mapperSin: () => [sinMapped],
    loadSiniestroCandidates: async () => [], // 0 candidatos → match null
    persistSiniestro: async () => ({ ok: false, outcome: "review", reason: "sin_poliza_en_cartera" }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(r.outcomes[0].siniestrosPersisted, 0);
  assert.equal(calls.confirm.length, 0); // cuarentena → NO confirma (queda en cola)
});

// LOO-753 — (3-REC) flag OFF → deferred, sin regresión POL/SIN
test("tipoObjeto REC (flag OFF) → deferred, NO confirmar, ledger deferred", async () => {
  // makeDeps NO setea recEnabled → REC sigue cayendo a deferred (sin regresión).
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero({ tipoObjeto: "REC" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "deferred");
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.persist.length, 0); // NO toca el persist de pólizas
  assert.equal(calls.ledger[0].estado, "deferred");
  assert.equal(r.outcomes[0].recibosCount, 0);
  assert.equal(r.recibosTotal, 0);
});

// LOO-753 — (3-REC) flag ON → procesa el recibo (mapper REC + match + persist)
test("tipoObjeto REC (flag ON) → processRecibo: persiste, confirma 1 vez", async () => {
  const recMapped = {
    outcome: "ok" as const,
    reviewReasons: [],
    idRecibo: "REC0001",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL123456",
    situacion: "cobrado" as const,
    claseRecibo: "NP",
    fechaEfectoInicial: "2026-01-01",
    fechaEfectoActual: "2026-01-01",
    fechaVencimiento: "2027-01-01",
    fechaEmision: "2026-01-05",
    fechaSituacion: "2026-03-01",
    primaTotal: "731.15",
    primaNeta: "667.48",
    formaPago: "CC",
    iban: "ES9121000418450200051332",
    comisionBruta: "63.67",
    comisionLiquida: "50.00",
    datosExtra: null,
  };
  const persistReciboCalls: unknown[] = [];
  const { deps, calls } = makeDeps({
    recEnabled: true,
    mapperRec: () => [recMapped],
    loadReciboCandidates: async () => [
      { polizaId: "pol-1", clienteId: "cli-1", numeroPoliza: "POL123456", codigoEntidadDgs: "C0109" },
    ],
    persistRecibo: async (i) => {
      persistReciboCalls.push(i);
      return { ok: true, outcome: "persisted", reciboId: "rec-1" };
    },
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "REC" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].recibosCount, 1);
  assert.equal(r.outcomes[0].recibosPersisted, 1);
  assert.equal(r.recibosTotal, 1);
  assert.equal(r.recibosPersisted, 1);
  assert.equal(persistReciboCalls.length, 1);
  assert.equal(calls.confirm.length, 1); // confirma 1 vez
  assert.equal(calls.persist.length, 0); // NO toca el persist de pólizas
});

// LOO-753 — flag ON pero sin póliza en cartera (match null) → review, NO confirma
test("tipoObjeto REC (flag ON) sin póliza en cartera → review, NO confirma", async () => {
  const recMapped = {
    outcome: "ok" as const,
    reviewReasons: [],
    idRecibo: "REC0002",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL999999",
    situacion: "pendiente" as const,
    claseRecibo: "NP",
    fechaEfectoInicial: null,
    fechaEfectoActual: null,
    fechaVencimiento: null,
    fechaEmision: null,
    fechaSituacion: null,
    primaTotal: null,
    primaNeta: null,
    formaPago: null,
    iban: null,
    comisionBruta: null,
    comisionLiquida: null,
    datosExtra: null,
  };
  const { deps, calls } = makeDeps({
    recEnabled: true,
    mapperRec: () => [recMapped],
    loadReciboCandidates: async () => [], // 0 candidatos → match null
    persistRecibo: async () => ({ ok: false, outcome: "review", reason: "sin_poliza_en_cartera" }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "REC" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(r.outcomes[0].recibosPersisted, 0);
  assert.equal(calls.confirm.length, 0); // cuarentena → NO confirma (queda en cola)
});

// LOO-753 — REC flag ON NO altera la rama POL (sin regresión): un POL sigue persistiendo
test("REC flag ON no rompe el flujo POL: un fichero POL sigue persistiendo y confirmando", async () => {
  const { deps, calls } = makeDeps({
    recEnabled: true,
    mapperRec: () => [],
    loadReciboCandidates: async () => [],
    persistRecibo: async () => ({ ok: true, outcome: "persisted", reciboId: "rec-x" }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "POL" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.persist.length, 1); // el persist de pólizas SÍ corre
  assert.equal(r.outcomes[0].recibosCount, 0); // POL no cuenta recibos
});

// LOO-757 — (3-CEF) flag OFF → deferred, sin regresión POL/SIN/REC
test("tipoObjeto CEF (flag OFF) → deferred, NO confirmar, ledger deferred", async () => {
  // makeDeps NO setea cefEnabled → CEF sigue cayendo a deferred (sin regresión).
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero({ tipoObjeto: "CEF" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "deferred");
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.persist.length, 0); // NO toca el persist de pólizas
  assert.equal(calls.ledger[0].estado, "deferred");
  assert.equal(r.outcomes[0].cuentasCount, 0);
  assert.equal(r.cuentasTotal, 0);
});

// LOO-757 — (3-CEF) flag ON → procesa la cuenta (mapper CEF + persist snapshot)
test("tipoObjeto CEF (flag ON) → processCuenta: persiste, confirma 1 vez", async () => {
  const cefMapped = {
    reviewReasons: [],
    codigoEntidadDgs: "C0109",
    periodo: { inicio: "2026-01-01", fin: "2026-01-31" },
    saldos: { inicial: "10.00", final: "95.03" },
    conceptos: {
      recibosCobrados: "0",
      comisionesRecibos: "95.03",
      retencionComisiones: "12.00",
      siniestrosPagados: "0",
      otrosConceptos: "0",
      retencionOtros: "0",
      remesas: "80.77",
    },
    liquidaciones: [],
  };
  const persistCefCalls: unknown[] = [];
  const { deps, calls } = makeDeps({
    cefEnabled: true,
    mapperCef: () => [cefMapped],
    loadCefReciboIndex: async () => new Map([["881227973|C0109", "rec-1"]]),
    loadCefPolizaIndex: async () => new Map([["POL123456|C0109", "pol-1"]]),
    persistCef: async (i) => {
      persistCefCalls.push(i);
      return { ok: true, outcome: "persisted", cuentaEfectivoId: "cuenta-1", liquidacionesCount: 0, movimientosCount: 0 };
    },
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "CEF" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].cuentasCount, 1);
  assert.equal(r.outcomes[0].cuentasPersisted, 1);
  assert.equal(r.cuentasTotal, 1);
  assert.equal(r.cuentasPersisted, 1);
  assert.equal(persistCefCalls.length, 1);
  assert.equal(calls.confirm.length, 1); // confirma 1 vez
  assert.equal(calls.persist.length, 0); // NO toca el persist de pólizas
});

// #5 red de review CEF — cuenta con reviewReasons (estado liquidación desconocido)
// persiste y confirma IGUAL, pero emite un audit event AUDIT-ONLY de señal (no bloquea).
test("tipoObjeto CEF (flag ON) cuenta persistida con reviewReasons → señal AUDIT-ONLY, sigue confirmando", async () => {
  const cefMapped = {
    reviewReasons: ["estado_liquidacion_desconocido"],
    codigoEntidadDgs: "C0109",
    periodo: { inicio: "2026-01-01", fin: "2026-01-31" },
    saldos: { inicial: "10.00", final: "95.03" },
    conceptos: {
      recibosCobrados: "0",
      comisionesRecibos: "95.03",
      retencionComisiones: "12.00",
      siniestrosPagados: "0",
      otrosConceptos: "0",
      retencionOtros: "0",
      remesas: "80.77",
    },
    liquidaciones: [],
  };
  const { deps, calls } = makeDeps({
    cefEnabled: true,
    mapperCef: () => [cefMapped],
    loadCefReciboIndex: async () => new Map(),
    loadCefPolizaIndex: async () => new Map(),
    persistCef: async () => ({ ok: true, outcome: "persisted", cuentaEfectivoId: "cuenta-1", liquidacionesCount: 0, movimientosCount: 0 }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "CEF" })], deps, { dryRun: false });
  // La cuenta persiste y el fichero confirma: la señal NO degrada el outcome.
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].cuentasPersisted, 1);
  assert.equal(calls.confirm.length, 1);
  // Se emitió el audit event de señal con las reviewReasons del mapper.
  const signal = calls.audit.find(
    (e) => (e.payload as { reviewKind?: string }).reviewKind === "cef_signal",
  );
  assert.ok(signal, "esperaba un audit event de señal CEF");
  assert.deepEqual(
    (signal!.payload as { reviewReasons: string[] }).reviewReasons,
    ["estado_liquidacion_desconocido"],
  );
});

// LOO-757 — flag ON pero la cuenta va a review (sin entidad) → review, NO confirma
test("tipoObjeto CEF (flag ON) cuenta sin entidad → review, NO confirma", async () => {
  const cefMapped = {
    reviewReasons: [],
    codigoEntidadDgs: null,
    periodo: { inicio: null, fin: null },
    saldos: { inicial: null, final: null },
    conceptos: {
      recibosCobrados: null,
      comisionesRecibos: null,
      retencionComisiones: null,
      siniestrosPagados: null,
      otrosConceptos: null,
      retencionOtros: null,
      remesas: null,
    },
    liquidaciones: [],
  };
  const { deps, calls } = makeDeps({
    cefEnabled: true,
    mapperCef: () => [cefMapped],
    loadCefReciboIndex: async () => new Map(),
    loadCefPolizaIndex: async () => new Map(),
    persistCef: async () => ({ ok: false, outcome: "review", reason: "falta_codigo_entidad_dgs" }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "CEF" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(r.outcomes[0].cuentasPersisted, 0);
  assert.equal(calls.confirm.length, 0); // review → NO confirma (queda en cola)
});

// LOO-757 — CEF flag ON NO altera la rama POL (sin regresión)
test("CEF flag ON no rompe el flujo POL: un fichero POL sigue persistiendo y confirmando", async () => {
  const { deps, calls } = makeDeps({
    cefEnabled: true,
    mapperCef: () => [],
    persistCef: async () => ({ ok: true, outcome: "persisted", cuentaEfectivoId: "c-x", liquidacionesCount: 0, movimientosCount: 0 }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "POL" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.persist.length, 1); // el persist de pólizas SÍ corre
  assert.equal(r.outcomes[0].cuentasCount, 0); // POL no cuenta cuentas CEF
});

// (5) mapper review_salud
test("mapper outcome review_salud → review_salud, sin persist", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => okMappedArr({ outcome: "review_salud", tipoSeguro: "salud", reviewReasons: ["salud_riesgo_art9"] }),
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review_salud");
  assert.equal(calls.persist.length, 0);
  // LOO-748 — el outcome per-póliza va a audit; el ledger del FICHERO (0 persisted) a recordFicheroLedger.
  assert.equal(calls.audit[0].eventName, "cima_fichero_review_salud");
  assert.equal(calls.ficheroLedger[0].ledger.estado, "review_salud");
});

// (6) mapper review
test("mapper outcome review → review, sin persist", async () => {
  const { deps, calls } = makeDeps({
    // LOO-752 (D6): `art14_asegurado_distinto` ya no existe (el asegurado se
    // persiste). Usamos otra razón de review del mapper (falta de fecha).
    mapper: () => okMappedArr({ outcome: "review", reviewReasons: ["falta_fecha_vencimiento"] }),
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(calls.persist.length, 0);
});

// (7) collision DNI
test("resolveCliente collision → review, deja null, sin persist", async () => {
  const { deps, calls } = makeDeps({
    resolveCliente: async () => ({ status: "collision", reason: "2 legacy mismo DNI" }),
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(calls.persist.length, 0);
});

// (7) not_found → sigue, persiste con resolvedClienteId null
test("resolveCliente not_found → persiste con clienteId null (alta nueva)", async () => {
  const { deps, calls } = makeDeps({ resolveCliente: async () => ({ status: "not_found" }) });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.persist[0].resolvedClienteId, null);
});

// (8) match ambiguo → review
test("match ambiguo (2 candidatos mismo numero+aseguradora) → review, sin persist", async () => {
  const cand = {
    clienteId: "cli-1",
    aseguradora: "Allianz",
    numeroPoliza: "POL12345",
    fechaInicio: "2026-01-01",
    codigoEntidadDgs: null,
  };
  const { deps, calls } = makeDeps({
    loadMatchCandidates: async () => [
      { id: "a", ...cand },
      { id: "b", ...cand },
    ],
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  // LOO-748 — matchedBy es per-póliza → en el audit event, no en el outcome del fichero.
  assert.equal(calls.audit[0].payload.matchedBy, "numero_poliza");
  assert.equal(calls.persist.length, 0);
});

// happy update por numero_poliza → persist + confirm → confirmed
test("match update (1 candidato numero_poliza) → persist + confirm → confirmed", async () => {
  const { deps, calls } = makeDeps({
    loadMatchCandidates: async () => [
      { id: "a", clienteId: "cli-1", aseguradora: "Allianz", numeroPoliza: "POL12345", fechaInicio: "2026-01-01", codigoEntidadDgs: null },
    ],
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.persist[0].match.matchedBy, "numero_poliza");
  assert.equal(r.outcomes[0].polizaId, "pol-1");
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.confirm[0].nombre, "F.zip");
  assert.equal(calls.confirm[0].codigoEntidad, "C0058");
});

// insert (sin candidatos) → persist + confirm → confirmed
test("sin candidatos → insert → persist + confirm → confirmed (matchedBy null)", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.persist[0].match.matchedBy, null);
  assert.equal(calls.persist.length, 1);
});

// (9) dryRun corta antes de persist/confirm/ledger
test("dryRun: outcome 'persisted' (intención), cero persist/confirm/ledger", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero()], deps, { dryRun: true });
  assert.equal(r.outcomes[0].estado, "persisted");
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.ledger.length, 0);
});

// (10) persist fail → error
test("persist ok:false → error + ledger error", async () => {
  const { deps, calls } = makeDeps({ persist: async () => ({ ok: false, reason: "tx_fail" }) });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "error");
  assert.equal(calls.confirm.length, 0); // NO confirma si persist falló
  // LOO-748 — error per-póliza a audit; ledger del FICHERO (0 persisted) a recordFicheroLedger.
  assert.equal(calls.audit[0].eventName, "cima_fichero_error");
  assert.equal(calls.ficheroLedger[0].ledger.estado, "error");
});

// (11) confirm fail tras persist OK → persisted (no confirmed)
test("confirm ok:false tras persist OK → persisted, confirmed false", async () => {
  const { deps } = makeDeps({ confirm: async () => ({ ok: false, reason: "ack_no_ok" }) });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "persisted");
  assert.equal(r.outcomes[0].confirmed, false);
});

// LOO-555 — confirm fail tras persist OK emite `cima_confirmacion_ack_fallida`
test("LOO-555: confirm ok:false post-persist → emite cima_confirmacion_ack_fallida", async () => {
  const { deps, calls } = makeDeps({ confirm: async () => ({ ok: false, reason: "ack_no_ok" }) });
  await runCimaPull([fichero()], deps, { dryRun: false });
  const ackFailed = calls.audit.filter((e) => e.eventName === "cima_confirmacion_ack_fallida");
  assert.equal(ackFailed.length, 1);
  assert.match(ackFailed[0].sourceEventId, /:confirm_failed$/);
  assert.equal((ackFailed[0].payload as { ackReason: string }).ackReason, "ack_no_ok");
});

// LOO-555 — confirm OK NO emite ack_fallida
test("LOO-555: confirm ok:true post-persist → NO emite cima_confirmacion_ack_fallida", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero()], deps, { dryRun: false });
  const ackFailed = calls.audit.filter((e) => e.eventName === "cima_confirmacion_ack_fallida");
  assert.equal(ackFailed.length, 0);
});

// excepción por-fichero NO aborta el lote
test("excepción en un fichero → ese a error, los demás siguen", async () => {
  let n = 0;
  const { deps } = makeDeps({
    persist: async () => {
      n++;
      if (n === 1) throw new Error("boom");
      return { ok: true, polizaId: "pol-2" };
    },
  });
  const r = await runCimaPull(
    [fichero({ nombreFicheroComprimido: "A.zip" }), fichero({ nombreFicheroComprimido: "B.zip" })],
    deps,
    { dryRun: false },
  );
  assert.equal(r.processed, 2);
  assert.equal(r.outcomes[0].estado, "error");
  assert.equal(r.outcomes[1].estado, "confirmed");
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].nombreFichero, "A.zip");
});

// counts agregados
test("counts agrega por estado", async () => {
  const { deps } = makeDeps();
  const r = await runCimaPull(
    // rawXml distinto → hash distinto (POL y REC reales nunca son byte-idénticos; el dedup
    // de contenido en-run los trataría como duplicados si compartieran rawXml sintético).
    [fichero({ nombreFicheroComprimido: "a" }), fichero({ nombreFicheroComprimido: "b", tipoObjeto: "REC", rawXml: "<rec/>" })],
    deps,
    { dryRun: false },
  );
  assert.equal(r.counts.confirmed, 1);
  assert.equal(r.counts.deferred, 1);
});

// integración con el mapper REAL (PR-4): un árbol EIAC POL ok → persist + confirm
test("integración mapEiacPol real: POL auto válido → confirmed", async () => {
  const datos = {
    Objetos: {
      Poliza: {
        DatosPoliza: {
          IdPoliza: "POL12345",
          CodigoEntidad: { CodigoDGS: "C0058" },
          DatosRamo: { RamoDGS: "241", DescripcionRamo: "ALLIANZ AUTO" },
        },
        SituacionPoliza: "EV",
        Fechas: {
          FechaEfectoInicial: "2026-01-01T00:00:00",
          FechaVencimiento: "2027-01-01T00:00:00",
        },
        DatosRiesgos: { Riesgo: { RiesgoAutos: { Vehiculo: { ClaseVehiculo: "AU" } } } },
        Tomador: {
          PersonaFisica: { TipoIdentificacion: "NI", IdPersona: "00000001R", Nombre: "N", Apellido1: "A" },
        },
      },
    },
  };
  const { deps, calls } = makeDeps({ mapper: (d) => mapEiacPolAll(d as never) });
  const r = await runCimaPull([fichero({ datos })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.persist[0].mapped.tipoSeguro, "auto");
});

// integración mapper REAL + salud: bloquea regresión de la precedencia cross-PR
// (una póliza de salud NUNCA debe llegar a persist). compliance P3-1.
test("integración mapEiacPol real: RiesgoSalud → review_salud, sin persist", async () => {
  const datos = {
    Objetos: {
      Poliza: {
        DatosPoliza: { IdPoliza: "POL99999", CodigoEntidad: { CodigoDGS: "C0058" } },
        Fechas: {
          FechaEfectoInicial: "2026-01-01T00:00:00",
          FechaVencimiento: "2027-01-01T00:00:00",
        },
        DatosRiesgos: { Riesgo: { RiesgoSalud: {} } },
        Tomador: { PersonaFisica: { TipoIdentificacion: "NI", IdPersona: "00000001R" } },
      },
    },
  };
  const { deps, calls } = makeDeps({ mapper: (d) => mapEiacPolAll(d as never) });
  const r = await runCimaPull([fichero({ datos })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review_salud");
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.confirm.length, 0);
});

// =============================================================================
// LOO-555 — Sentinel tests: FSM↔eventType + payload anti-PII + audit completo
// =============================================================================

// LOO-555 — Cada outcome no-persist tiene un audit event correspondiente
test("LOO-555 sentinel: zip_multi_entry → cima_fichero_error con errorKind", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero({ zipEntryCount: 3 })], deps, { dryRun: false });
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].eventName, "cima_fichero_error");
  assert.equal(
    (calls.audit[0].payload as { errorKind: string }).errorKind,
    "zip_multi_entry",
  );
});

test("LOO-555 sentinel: codigo_entidad_ausente → cima_fichero_error", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero({ codigoEntidad: null })], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_error");
  assert.equal(
    (calls.audit[0].payload as { errorKind: string }).errorKind,
    "codigo_entidad_ausente",
  );
});

test("LOO-555 sentinel: raw_xml_ausente → cima_fichero_error", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero({ rawXml: null })], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_error");
  assert.equal(
    (calls.audit[0].payload as { errorKind: string }).errorKind,
    "raw_xml_ausente",
  );
});

test("LOO-555 sentinel: deferred no-POL → cima_fichero_deferred", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero({ tipoObjeto: "REC" })], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_deferred");
});

test("LOO-555 sentinel: review_salud → cima_fichero_review_salud", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => okMappedArr({ outcome: "review_salud", reviewReasons: ["salud_art9"] }),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_review_salud");
  assert.deepEqual(
    (calls.audit[0].payload as { reviewReasons: string[] }).reviewReasons,
    ["salud_art9"],
  );
});

test("LOO-555 sentinel: mapper review → cima_fichero_review (kind=mapper)", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => okMappedArr({ outcome: "review", reviewReasons: ["art14"] }),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_review");
  assert.equal((calls.audit[0].payload as { reviewKind: string }).reviewKind, "mapper");
});

test("LOO-555 sentinel: dni_collision → cima_fichero_review (kind=dni_collision)", async () => {
  const { deps, calls } = makeDeps({
    resolveCliente: async () => ({ status: "collision", reason: "2 legacy mismo DNI" }),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_review");
  assert.equal(
    (calls.audit[0].payload as { reviewKind: string }).reviewKind,
    "dni_collision",
  );
});

test("LOO-555 sentinel: duplicate_xml_hash → cima_fichero_duplicate_replay", async () => {
  const { deps, calls } = makeDeps({ isDuplicateXmlHash: () => true });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_duplicate_replay");
  assert.equal((calls.audit[0].payload as { ackOk: boolean }).ackOk, true);
});

test("LOO-555 sentinel: persist_failed → cima_fichero_error (kind=persist_failed)", async () => {
  const { deps, calls } = makeDeps({
    persist: async () => ({ ok: false, reason: "tx_fail" }),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.audit[0].eventName, "cima_fichero_error");
  assert.equal(
    (calls.audit[0].payload as { errorKind: string }).errorKind,
    "persist_failed",
  );
});

// LOO-555 — sourceEventId determinístico (mismo input → mismo sourceEventId)
test("LOO-555 sentinel: sourceEventId determinístico con xmlHash", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => okMappedArr({ outcome: "review", reviewReasons: ["art14"] }),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  // LOO-748 — formato `${xmlHash}:${polizaKey}:${stateTo}` (per-póliza, R1). Hash
  // mock `hash:${xml.length}` → "<x/>" (4) + idPolizaEntidad "POL12345".
  assert.equal(calls.audit[0].sourceEventId, "hash:4:POL12345:review");
});

test("LOO-555 sentinel: sourceEventId fallback nombreFichero si xmlHash null (error path)", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull(
    [fichero({ nombreFicheroComprimido: "F.zip", rawXml: null })],
    deps,
    { dryRun: false },
  );
  assert.equal(calls.audit[0].sourceEventId, "F.zip:error");
});

// LOO-555 — Payload NUNCA debe contener PII Tier 1 ES
test("LOO-555 sentinel: payload NO contiene PII Tier 1 (DNI/NIE/CIF/email/tel)", async () => {
  // Fixture con tomador que TIENE PII real (DNI/email/tel/etc) en el mapper.
  // Cualquier outcome que toque audit no debe propagarla a payload.
  const { deps, calls } = makeDeps({
    mapper: () =>
      okMappedArr({
        outcome: "review",
        reviewReasons: ["art14"],
        tomador: {
          tipoPersona: "fisica",
          tipoIdentificacion: "NI",
          idPersona: "12345678Z", // DNI ES
          nombreCompleto: "Juan Pérez García",
        },
      }),
    resolveCliente: async () => ({
      status: "collision",
      reason: "conflict on key (dni_lookup_hash)=(00000000T), email=juan.perez@example.com, tel=+34 612 345 678",
    }),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  const payloadStr = JSON.stringify(calls.audit);
  // Regex de PII española
  const DNI = /\b\d{8}[A-HJ-NP-TV-Z]\b/i;
  const NIE = /\b[XYZ]\d{7}[A-HJ-NP-TV-Z]\b/i;
  const CIF = /\b[A-HJNPQRSUVW]\d{7}[\dA-J]\b/i;
  const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const PHONE_ES = /\b(?:(?:\+|00)?34[\s.-]?)?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/;
  assert.doesNotMatch(payloadStr, DNI, "DNI leaked to payload");
  assert.doesNotMatch(payloadStr, NIE, "NIE leaked to payload");
  assert.doesNotMatch(payloadStr, CIF, "CIF leaked to payload");
  assert.doesNotMatch(payloadStr, EMAIL, "email leaked to payload");
  assert.doesNotMatch(payloadStr, PHONE_ES, "teléfono ES leaked to payload");
  // Nombre tampoco
  assert.doesNotMatch(payloadStr, /Juan Pérez/, "nombre completo leaked");
});

// LOO-555 — Cobertura FSM ↔ eventType (sentinel de drift)
test("LOO-555 sentinel: cada CimaFicheroFsmEstado terminal tiene cobertura audit", () => {
  // Mapping FSM-state → eventName que debe emitirse cuando el pipeline llega
  // a ese estado terminal (excluye 'pending' = no-terminal, 'persisted'/'confirmed'
  // = ya cubiertos por cima_poliza_persisted dentro de tx persistCimaFichero).
  const expectedAuditCoverage: Record<CimaFicheroFsmEstado, string | "via_persist_tx" | "non_terminal"> = {
    pending: "non_terminal",
    persisted: "via_persist_tx",
    confirmed: "via_persist_tx",
    deferred: "cima_fichero_deferred",
    review: "cima_fichero_review",
    review_salud: "cima_fichero_review_salud",
    error: "cima_fichero_error",
  };
  for (const [state, expected] of Object.entries(expectedAuditCoverage)) {
    assert.ok(expected, `state ${state} sin definición de coverage`);
  }
});

// ── LOO-748 — multi-póliza ────────────────────────────────────────────────
test("LOO-748 multi-póliza: 3 pólizas ok → 3 persist, fichero confirmed, confirm 1 vez", async () => {
  let pid = 0;
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "P2" }),
      okMapped({ idPolizaEntidad: "P3" }),
    ],
    persist: async (i) => {
      calls.persist.push(i);
      return { ok: true, polizaId: `pol-${++pid}` };
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.persist.length, 3);
  assert.equal(calls.confirm.length, 1); // confirm 1 vez por fichero, no por póliza
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].polizasCount, 3);
  assert.equal(r.outcomes[0].polizasPersisted, 3);
  assert.equal(r.outcomes[0].polizaIds.length, 3);
  assert.equal(r.polizasTotal, 3);
  assert.equal(r.polizasPersisted, 3);
  assert.equal(calls.ficheroLedger.length, 1);
  assert.equal(calls.ficheroLedger[0].polizasCount, 3);
  assert.equal(calls.ficheroLedger[0].polizasPersisted, 3);
});

test("LOO-748 multi-póliza mixto: 2 ok + 1 review → 2 persist, fichero confirmed", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "P2", outcome: "review", reviewReasons: ["art14"] }),
      okMapped({ idPolizaEntidad: "P3" }),
    ],
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.persist.length, 2); // solo las ok
  assert.equal(calls.confirm.length, 1);
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].polizasCount, 3);
  assert.equal(r.outcomes[0].polizasPersisted, 2);
  assert.equal(calls.audit.filter((e) => e.eventName === "cima_fichero_review").length, 1);
  // Incidente 16/09/2026 (Occident C0468, 4/44 en review): el fichero se
  // confirma igual (2 ok) y saca el review sin recuperación posible salvo
  // cuarentena de crudo, escrita ANTES de confirm.
  // Dos escrituras de crudo: la copia PREVENTIVA (todo fichero, sin motivo) y la
  // PROMOCIÓN a incidencia, que es la que lleva el motivo y el TTL largo.
  assert.equal(calls.rawQuarantine.length, 2);
  assert.deepEqual(
    calls.rawQuarantine.map((q) => q.conIncidencia),
    [false, true],
  );
  assert.equal(calls.rawQuarantine[0].motivo, null);
  assert.equal(calls.rawQuarantine[1].motivo, "review: art14");
  assert.ok(calls.confirm.length === 1, "confirm se llamó");
});

test("cuarentena de crudo: se escribe ANTES de confirm (orden), no cuando todo persiste ok", async () => {
  const order: string[] = [];
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "P2", outcome: "review", reviewReasons: ["art14"] }),
    ],
    recordRawQuarantine: async (input) => {
      order.push("quarantine");
      calls.rawQuarantine.push(input);
    },
    confirm: async (n, codigoEntidad) => {
      order.push("confirm");
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: true };
    },
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  // Las DOS escrituras van antes del confirm: confirmar saca el fichero de la
  // cola de TIREA para siempre, así que después ya no habría nada que copiar.
  assert.deepEqual(order, ["quarantine", "quarantine", "confirm"]);

  // Un fichero SANO también deja copia — ése es el agujero que tapa esto: un
  // campo que el mapper no lee no produce review ni error, el fichero sale
  // «bien» y el dato se iría sin dejar rastro. Copia preventiva, sin incidencia.
  const okOnly = makeDeps({ mapper: () => okMappedArr() });
  await runCimaPull([fichero()], okOnly.deps, { dryRun: false });
  assert.equal(okOnly.calls.rawQuarantine.length, 1);
  assert.equal(okOnly.calls.rawQuarantine[0].conIncidencia, false);
  assert.equal(okOnly.calls.rawQuarantine[0].motivo, null);
});

test("cuarentena de crudo: 0 pólizas persisten (todo review) → igual se guarda, aunque NO se confirma", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [okMapped({ outcome: "review", reviewReasons: ["falta_fecha_vencimiento"] })],
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(calls.rawQuarantine.length, 2); // preventiva + promoción a incidencia
  assert.equal(calls.rawQuarantine[1].conIncidencia, true);
  assert.equal(calls.confirm.length, 0); // 0 persistidas → no se confirma (LOCKED)
});

test("cuarentena de crudo: dep ausente (undefined) no rompe el pipeline (opcional, back-compat)", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "P2", outcome: "review", reviewReasons: ["art14"] }),
    ],
    recordRawQuarantine: undefined,
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.rawQuarantine.length, 0);
});

test("LOO-748 R1: 2 review en el mismo fichero → sourceEventId distinto (anti-colisión Art.30)", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "PA", outcome: "review", reviewReasons: ["art14"] }),
      okMapped({ idPolizaEntidad: "PB", outcome: "review", reviewReasons: ["art14"] }),
    ],
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  const ids = calls.audit.map((e) => e.sourceEventId);
  assert.equal(new Set(ids).size, ids.length); // todos distintos → no colisionan
  assert.ok(ids.includes("hash:4:PA:review"));
  assert.ok(ids.includes("hash:4:PB:review"));
});

// ── LOO-748 fixes review wf_4565e9cf ──────────────────────────────────────
// P2 — dedup EN-RUN: 2 ficheros de mismo contenido (xml_hash) y distinto nombre en
// el MISMO lote. El 2º debe ir por duplicate-path (NO re-persistir, confirmar para
// dequeue), evitando el 23505 en uq_cima_ficheros_xml_hash tras persist+confirm.
test("LOO-748 P2: 2 ficheros mismo xml_hash en un lote → 2º por duplicate-path (no re-persist)", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull(
    [fichero({ nombreFicheroComprimido: "A.zip" }), fichero({ nombreFicheroComprimido: "B.zip" })],
    deps,
    { dryRun: false },
  );
  // mismo rawXml "<x/>" → mismo hash "hash:4" para ambos
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[1].estado, "confirmed");
  assert.equal(calls.persist.length, 1); // el 2º NO se re-persiste
  assert.equal(calls.confirm.length, 2); // ambos se confirman (cada nombre se dequea de TIREA)
  assert.equal(
    calls.audit.filter((e) => e.eventName === "cima_fichero_duplicate_replay").length,
    1,
  );
  assert.equal(calls.ficheroLedger.length, 1); // solo el 1º escribe ledger de FICHERO (con hash)
});

// P1 — ackOk sella confirmado_at: fichero confirmado feliz → recordFicheroLedger.ackOk=true.
test("LOO-748 P1: fichero confirmed → recordFicheroLedger recibe ackOk=true", async () => {
  const { deps, calls } = makeDeps();
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.ficheroLedger.length, 1);
  assert.equal(calls.ficheroLedger[0].ackOk, true);
});

// P1 — 0 persistidas (todas review) → NO confirm → ackOk=false (confirmado_at NULL).
test("LOO-748 P1: 0 persistidas (review) → sin confirm → recordFicheroLedger ackOk=false", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [okMapped({ outcome: "review", reviewReasons: ["art14"] })],
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(calls.confirm.length, 0);
  assert.equal(calls.ficheroLedger.length, 1);
  assert.equal(calls.ficheroLedger[0].ackOk, false);
});

// P1/finding3 — errores PARCIALES con ack OK: fichero 'persisted' pero ackOk=true
// (dequeued, NO re-entrega) + evento cima_fichero_persistido_parcial (observabilidad).
test("LOO-748 finding3: 2 ok + 1 persist-fail + ack OK → persisted, ackOk=true, evento persistido_parcial", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "PERR" }),
      okMapped({ idPolizaEntidad: "P3" }),
    ],
    persist: async (i) => {
      calls.persist.push(i);
      if (i.mapped.idPolizaEntidad === "PERR") return { ok: false, reason: "boom_db" };
      return { ok: true, polizaId: `pol-${i.mapped.idPolizaEntidad}` };
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "persisted"); // parcial → NO 'confirmed'
  assert.equal(r.outcomes[0].polizasPersisted, 2);
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.ficheroLedger.length, 1);
  assert.equal(calls.ficheroLedger[0].ackOk, true); // ack OK → dequeued → confirmado_at se sella
  const parcial = calls.audit.filter((e) => e.eventName === "cima_fichero_persistido_parcial");
  assert.equal(parcial.length, 1);
  assert.equal(parcial[0].payload.polizasError, 1);
});

// ─── LOO-759 — GUARD anti-degrade del FSM ────────────────────────────────────
// Bug raíz: un confirm TRANSITORIO (edge 5xx / body no-JSON) sobre un fichero ya
// `confirmed` en el ledger lo degradaba a `persisted` vía onConflictDoUpdate. El
// guard: ante `confirm_transient_error` + fichero ya `confirmed`, NO bajar el
// estado (queda `confirmed`; el próximo pull reintenta el confirm). Probado en el
// re-procesado (reprocess=true), que es el path que re-persiste un fichero ya visto.

test("LOO-759 guard: confirm TRANSITORIO + ya confirmed → NO degrada (sigue confirmed)", async () => {
  const { deps, calls } = makeDeps({
    isConfirmedXmlHash: () => true, // ya `confirmed` en el ledger (snapshot)
    confirm: async (n, codigoEntidad) => {
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: false, reason: "confirm_transient_error" }; // edge 5xx / body no-JSON
    },
  });
  // reprocess=true → bypassa el dedup y re-persiste el fichero (path del backfill).
  const r = await runCimaPull([fichero()], deps, { dryRun: false, reprocess: true });
  assert.equal(r.outcomes[0].estado, "confirmed"); // CLAVE: NO baja a persisted
  assert.equal(calls.confirm.length, 1); // sí se intentó confirmar
  assert.equal(calls.ficheroLedger.length, 1);
  assert.equal(calls.ficheroLedger[0].ledger.estado, "confirmed"); // el ledger NO escribe persisted
  assert.equal(calls.ficheroLedger[0].ackOk, false); // ack no OK → no re-sella confirmado_at (ya estaba)
});

test("LOO-759 guard: confirm TRANSITORIO pero NO confirmed previo → persisted (sin regresión)", async () => {
  const { deps, calls } = makeDeps({
    isConfirmedXmlHash: () => false, // NO había confirmación previa → nada que proteger
    confirm: async (n, codigoEntidad) => {
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: false, reason: "confirm_transient_error" };
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "persisted"); // sin confirmado previo → persisted normal
  assert.equal(calls.ficheroLedger[0].ledger.estado, "persisted");
  assert.equal(calls.ficheroLedger[0].ackOk, false);
});

test("LOO-759 guard: confirm NO transitorio (ack_not_ok) + ya confirmed → persisted (error real degrada)", async () => {
  const { deps, calls } = makeDeps({
    isConfirmedXmlHash: () => true,
    confirm: async (n, codigoEntidad) => {
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: false, reason: "ack_not_ok" }; // rechazo lógico de TIREA, NO transitorio
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false, reprocess: true });
  // Un fallo de contrato/lógico NO está cubierto por el guard → degrada como antes.
  assert.equal(r.outcomes[0].estado, "persisted");
  assert.equal(calls.ficheroLedger[0].ledger.estado, "persisted");
});

test("LOO-759 guard: confirm OK + ya confirmed → confirmed (happy-path intacto)", async () => {
  const { deps, calls } = makeDeps({
    isConfirmedXmlHash: () => true,
    // confirm default = { ok: true }
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false, reprocess: true });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.confirm.length, 1);
  assert.equal(calls.ficheroLedger[0].ackOk, true); // ack OK → dequeue → sella confirmado_at
});

// ─── LOO-760 — RECONCILE: re-procesa un review SIN/REC contra la cartera actual ──
// El modo reconcile resta del dedup (en pull-deps) los review SIN/REC con
// confirmado_at null → re-entran al pipeline con `reprocess: true` (bypass del
// dedup de contenido). Si AHORA matchean cartera → persisten y salen de review;
// si siguen sin matchear → vuelven a review (idempotente, sin daño).

function sinMappedFixture(over: Record<string, unknown> = {}) {
  return {
    outcome: "ok" as const,
    reviewReasons: [],
    idSiniestroEntidad: "SIN-RECON",
    codigoEntidadDgs: "C0109",
    idPolizaEntidad: "POL777",
    fechaOcurrencia: "2026-03-01",
    estado: "abierto" as const,
    tipo: "17",
    lugarDireccion: null,
    lugarCp: null,
    lugarCiudad: null,
    lugarProvincia: null,
    comentario: null,
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

// (c) un review que AHORA matchea la cartera → persiste + sale de review (confirmed).
test("LOO-760 reconcile: review SIN re-procesado que ahora matchea cartera → persiste + confirma", async () => {
  const persistSiniestroCalls: unknown[] = [];
  const { deps, calls } = makeDeps({
    sinEnabled: true,
    // Simula el snapshot del reconcile: en pull-deps el hash de un review SIN/REC se
    // RESTA de seenHashes; aquí lo modelamos como NO-duplicado + reprocess.
    isDuplicateXmlHash: () => true, // estaba ya en el ledger (review previo)
    mapperSin: () => [sinMappedFixture()],
    // La cartera AHORA tiene la póliza (antes no → cayó a review por timing).
    loadSiniestroCandidates: async () => [
      { polizaId: "pol-recon", clienteId: "cli-recon", numeroPoliza: "POL777", codigoEntidadDgs: "C0109" },
    ],
    persistSiniestro: async (i) => {
      persistSiniestroCalls.push(i);
      return { ok: true, outcome: "persisted", siniestroId: "sin-recon-1" };
    },
  });
  // reconcile usa reprocess=true → ignora isDuplicateXmlHash y re-procesa el review.
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false, reprocess: true });
  assert.equal(r.outcomes[0].estado, "confirmed"); // recuperado: sale de review
  assert.equal(r.siniestrosPersisted, 1);
  assert.equal(persistSiniestroCalls.length, 1);
  assert.equal(calls.confirm.length, 1); // confirma → dequeue de TIREA
});

// (d) un review que SIGUE sin matchear → vuelve a review (idempotente, no confirma).
test("LOO-760 reconcile: review SIN re-procesado que sigue sin matchear → vuelve a review", async () => {
  const { deps, calls } = makeDeps({
    sinEnabled: true,
    isDuplicateXmlHash: () => true, // estaba ya en el ledger (review previo)
    mapperSin: () => [sinMappedFixture()],
    loadSiniestroCandidates: async () => [], // sigue SIN póliza en cartera (out-of-cartera)
    persistSiniestro: async () => ({ ok: false, outcome: "review", reason: "sin_poliza_en_cartera" }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false, reprocess: true });
  assert.equal(r.outcomes[0].estado, "review"); // idempotente: vuelve a review
  assert.equal(r.siniestrosPersisted, 0);
  assert.equal(calls.confirm.length, 0); // NO confirma → queda en la cola para el próximo reconcile
});

// (e) el pull NORMAL (sin reprocess) NO re-procesa un duplicado: lo trata como visto.
// Garantiza que el reconcile es opt-in y el comportamiento por defecto no cambia.
test("LOO-760: pull normal (sin reprocess) NO re-procesa un SIN duplicado (comportamiento intacto)", async () => {
  const persistSiniestroCalls: unknown[] = [];
  const { deps } = makeDeps({
    sinEnabled: true,
    isDuplicateXmlHash: () => true, // contenido ya en el ledger
    mapperSin: () => [sinMappedFixture()],
    loadSiniestroCandidates: async () => [
      { polizaId: "pol-recon", clienteId: "cli-recon", numeroPoliza: "POL777", codigoEntidadDgs: "C0109" },
    ],
    persistSiniestro: async (i) => {
      persistSiniestroCalls.push(i);
      return { ok: true, outcome: "persisted", siniestroId: "sin-recon-1" };
    },
  });
  // SIN reprocess → el dedup de contenido corta antes del re-proceso (duplicate-path).
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false });
  assert.equal(persistSiniestroCalls.length, 0); // NO re-persiste
  assert.equal(r.siniestrosPersisted, 0);
  // duplicate-path: confirma para dequeue pero NO re-procesa el SIN.
  assert.equal(r.outcomes[0].estado, "confirmed");
});

// ─── LOO-826 A2 — residuo por REVIEW también marca persistido_parcial ───────────
// Antes el evento solo se emitía con anyError: un fichero `confirmed` con pólizas
// en review (cuarentena) era residuo INVISIBLE. Ahora: evento + marca en el ledger
// (`review_parcial*`) que la query de residuo del panel /salud-cima detecta (A3).

test("LOO-826 A2 POL: 1 ok + 1 review + ack OK → confirmed + review_parcial + persistido_parcial", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "PREV", outcome: "review", reviewReasons: ["art14_sin_dni"] }),
    ],
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  // Sin errores → el estado del FICHERO sigue siendo confirmed (el residuo se
  // observa vía evento + ledger, NO degradando el estado).
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].polizasPersisted, 1);
  assert.equal(calls.ficheroLedger[0].ledger.errorDetalle, "review_parcial");
  const parcial = calls.audit.filter((e) => e.eventName === "cima_fichero_persistido_parcial");
  assert.equal(parcial.length, 1);
  assert.equal(parcial[0].payload.polizasReview, 1);
  assert.equal(parcial[0].payload.polizasError, 0);
  // stateTo = estado REAL del fichero (confirmed cuando solo hay review).
  assert.equal(parcial[0].payload.stateTo, "confirmed");
});

test("LOO-826 A2 POL: residuo por ERROR conserva errores_parciales (prioridad sobre review)", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "P1" }),
      okMapped({ idPolizaEntidad: "PERR" }),
      okMapped({ idPolizaEntidad: "PREV", outcome: "review", reviewReasons: ["art14_sin_dni"] }),
    ],
    persist: async (i) => {
      calls.persist.push(i);
      if (i.mapped.idPolizaEntidad === "PERR") return { ok: false, reason: "boom_db" };
      return { ok: true, polizaId: `pol-${i.mapped.idPolizaEntidad}` };
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "persisted"); // error → degrada como siempre
  assert.equal(calls.ficheroLedger[0].ledger.errorDetalle, "errores_parciales");
  const parcial = calls.audit.filter((e) => e.eventName === "cima_fichero_persistido_parcial");
  assert.equal(parcial.length, 1);
  assert.equal(parcial[0].payload.polizasError, 1);
  assert.equal(parcial[0].payload.polizasReview, 1);
});

test("LOO-826 A2 SIN: 1 persistido + 1 review + ack OK → confirmed + review_parcial_siniestros + persistido_parcial", async () => {
  const { deps, calls } = makeDeps({
    sinEnabled: true,
    mapperSin: () => [
      sinMappedFixture({ idSiniestroEntidad: "SIN-OK" }),
      sinMappedFixture({ idSiniestroEntidad: "SIN-REV", outcome: "review", reviewReasons: ["figura_desconocida"] }),
    ],
    loadSiniestroCandidates: async () => [
      { polizaId: "pol-1", clienteId: "cli-1", numeroPoliza: "POL777", codigoEntidadDgs: "C0109" },
    ],
    persistSiniestro: async () => ({ ok: true, outcome: "persisted", siniestroId: "sin-1" }),
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].siniestrosPersisted, 1);
  assert.equal(calls.ficheroLedger[0].ledger.errorDetalle, "review_parcial_siniestros");
  const parcial = calls.audit.filter((e) => e.eventName === "cima_fichero_persistido_parcial");
  assert.equal(parcial.length, 1);
  assert.equal(parcial[0].payload.siniestrosReview, 1);
  assert.equal(parcial[0].payload.siniestrosError, 0);
});

// ─── LOO-826 B5 — telemetría: los defaults de mkOutcome ya NO inflan contadores ──
// Antes: duplicate-replay confirmado contaba polizasCount=1 y polizasPersisted=1
// (sin haber persistido nada en esta corrida) y deferred/error temprano contaban
// polizasCount=1 → `cima_pull_completed` inflado (hallazgo #8 auditoría).

test("LOO-826 B5: duplicate-replay confirmado NO cuenta pólizas (0/0)", async () => {
  const { deps } = makeDeps({ isDuplicateXmlHash: () => true });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(r.outcomes[0].polizasCount, 0);
  assert.equal(r.outcomes[0].polizasPersisted, 0);
  assert.equal(r.polizasTotal, 0);
  assert.equal(r.polizasPersisted, 0);
});

test("LOO-826 B5: deferred no-POL NO cuenta pólizas vistas", async () => {
  const { deps } = makeDeps();
  const r = await runCimaPull([fichero({ tipoObjeto: "LIQ" })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "deferred");
  assert.equal(r.outcomes[0].polizasCount, 0);
  assert.equal(r.polizasTotal, 0);
});

test("LOO-826 B5: error temprano (zip multi-entry) NO cuenta pólizas vistas", async () => {
  const { deps } = makeDeps();
  const r = await runCimaPull([fichero({ zipEntryCount: 3 })], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "error");
  assert.equal(r.outcomes[0].polizasCount, 0);
  assert.equal(r.polizasTotal, 0);
  assert.equal(r.polizasPersisted, 0);
});

// ── Copia preventiva del crudo + cobertura de campos (agujero silencioso) ────

test("copia preventiva: un fichero SANO deja crudo igualmente, y ANTES de confirm", async () => {
  const order: string[] = [];
  const { deps, calls } = makeDeps({
    recordRawQuarantine: async (input) => {
      order.push("crudo");
      calls.rawQuarantine.push(input);
    },
    confirm: async (n, codigoEntidad) => {
      order.push("confirm");
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: true };
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  // Sin esto, un campo que el mapper no lee se va con el fichero confirmado y no
  // queda NADA: ni review, ni error, ni copia.
  assert.deepEqual(order, ["crudo", "confirm"]);
  assert.equal(calls.rawQuarantine[0].conIncidencia, false);
});

test("copia preventiva: también antes del confirm del DUPLICADO (que igual dequeuea)", async () => {
  const order: string[] = [];
  const { deps, calls } = makeDeps({
    isDuplicateXmlHash: () => true,
    isConfirmedXmlHash: () => false,
    recordRawQuarantine: async (input) => {
      order.push("crudo");
      calls.rawQuarantine.push(input);
    },
    confirm: async (n, codigoEntidad) => {
      order.push("confirm");
      calls.confirm.push({ nombre: n, codigoEntidad });
      return { ok: true };
    },
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.deepEqual(order, ["crudo", "confirm"]);
});

test("copia preventiva: en dryRun NO se escribe nada (ni crudo ni cobertura)", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero()], deps, { dryRun: true });
  assert.equal(calls.rawQuarantine.length, 0);
  assert.equal(calls.fieldCoverage.length, 0);
});

test("copia preventiva: si falla, el fichero SIGUE procesándose pero deja evento visible", async () => {
  const { deps, calls } = makeDeps({
    recordRawQuarantine: async ({ conIncidencia }) => {
      if (!conIncidencia) throw new Error("db caída");
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  // Degrada VISIBLE: se procesa (si no, TIREA re-entregaría en bucle) pero el
  // fallo deja rastro — un fichero sin copia no puede parecerse a uno copiado.
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(
    calls.audit.filter((e) => e.eventName === "cima_crudo_snapshot_fallido").length,
    1,
  );
});

test("cobertura de campos: se registra por fichero, con rutas leídas y NO leídas", async () => {
  const datos = { DatosPoliza: { IdPoliza: "P1", NumeroColectivo: "7" } };
  const { deps, calls } = makeDeps({
    mapper: (d) => {
      void (d as { DatosPoliza?: { IdPoliza?: string } }).DatosPoliza?.IdPoliza;
      return okMappedArr();
    },
  });
  await runCimaPull([fichero({ datos })], deps, { dryRun: false });
  assert.equal(calls.fieldCoverage.length, 1);
  const rutas = new Map(calls.fieldCoverage[0].rutas.map((r) => [r.ruta, r.leido]));
  assert.equal(rutas.get("DatosPoliza.IdPoliza"), true);
  assert.equal(rutas.get("DatosPoliza.NumeroColectivo"), false);
  assert.equal(calls.fieldCoverage[0].codigoEntidad, "C0058");
});

test("cobertura de campos: NUNCA sale un valor del árbol, sólo nombres de ruta", async () => {
  const datos = { Tomador: { PersonaFisica: { IdPersona: "00000001R" } } };
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero({ datos })], deps, { dryRun: false });
  assert.ok(!JSON.stringify(calls.fieldCoverage).includes("00000001R"));
});

test("cobertura de campos: si el registro falla, la ingesta NO cae (es observabilidad)", async () => {
  const { deps } = makeDeps({
    recordFieldCoverage: async () => {
      throw new Error("db caída");
    },
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
});

test("cobertura de campos: dep ausente no rompe el pipeline (opcional, back-compat)", async () => {
  const { deps, calls } = makeDeps({ recordFieldCoverage: undefined });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(calls.fieldCoverage.length, 0);
});

// --- EIAC V07.1 (20/10/2026): CodigoEntidad presente pero ilegible ≠ «falta» ---
// Con los mappers REALES sobre el ejemplo oficial V07.1 con el código estropeado.
const FIXTURE_V071 = (n: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", n), "utf8").replace(
    /<CodigoEntidad>C0001<\/CodigoEntidad>/g,
    "<CodigoEntidad>ALLIANZ</CodigoEntidad>",
  );

test("V07.1 REC con CodigoEntidad ilegible → cuarentena con motivo codigo_entidad_formato_desconocido", async () => {
  const motivos: unknown[] = [];
  const { deps, calls } = makeDeps({
    recEnabled: true,
    mapperRec: () => mapEiacRecAll(parseEiacXml(FIXTURE_V071("eiac-recibos-V07-1_V06.xml")) as ParsedEiacRec),
    loadReciboCandidates: async () => [],
    persistRecibo: async (i) => {
      motivos.push(i.motivoSinMatch);
      return { ok: false, outcome: "review", reason: i.motivoSinMatch ?? "sin_poliza_en_cartera" };
    },
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "REC" })], deps, { dryRun: false });
  assert.deepEqual(motivos, [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO]);
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(calls.confirm.length, 0);
});

test("V07.1 SIN con CodigoEntidad ilegible → cuarentena con motivo codigo_entidad_formato_desconocido", async () => {
  const motivos: unknown[] = [];
  const { deps, calls } = makeDeps({
    sinEnabled: true,
    mapperSin: () => mapEiacSinAll(parseEiacXml(FIXTURE_V071("eiac-siniestro-dec-V07-1_V06.xml")) as ParsedEiacSin),
    loadSiniestroCandidates: async () => [],
    persistSiniestro: async (i) => {
      motivos.push(i.motivoSinMatch);
      return { ok: false, outcome: "review", reason: i.motivoSinMatch ?? "sin_poliza_en_cartera" };
    },
  });
  const r = await runCimaPull([fichero({ tipoObjeto: "SIN" })], deps, { dryRun: false });
  assert.deepEqual(motivos, [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO]);
  assert.equal(r.outcomes[0].estado, "review");
  assert.equal(calls.confirm.length, 0);
});

test("V07.1 POL con CodigoEntidad ilegible → persiste igual y deja señal pol_signal", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => okMappedArr({ codigoEntidadDgs: null, reviewReasons: [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO] }),
  });
  const r = await runCimaPull([fichero()], deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed", "el flujo de la POL no cambia");
  const senal = calls.audit.find((e) => (e.payload as { reviewKind?: string }).reviewKind === "pol_signal");
  assert.deepEqual((senal?.payload as { reviewReasons?: string[] } | undefined)?.reviewReasons, [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO]);
});

test("V07.1 POL: 47 pólizas con CodigoEntidad ilegible → UNA sola señal pol_signal por fichero", async () => {
  const { deps, calls } = makeDeps({
    mapper: () =>
      Array.from({ length: 47 }, (_, i) =>
        okMapped({ idPolizaEntidad: `POL${i}`, codigoEntidadDgs: null, reviewReasons: [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO] }),
      ),
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  const senales = calls.audit.filter((e) => (e.payload as { reviewKind?: string }).reviewKind === "pol_signal");
  assert.equal(senales.length, 1);
});

test("V07.1 POL: la señal agregada lleva el recuento de pólizas afectadas", async () => {
  const { deps, calls } = makeDeps({
    mapper: () => [
      okMapped({ idPolizaEntidad: "POL1", codigoEntidadDgs: null, reviewReasons: [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO] }),
      okMapped({ idPolizaEntidad: "POL2" }),
      okMapped({ idPolizaEntidad: "POL3", codigoEntidadDgs: null, reviewReasons: [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO] }),
    ],
  });
  await runCimaPull([fichero()], deps, { dryRun: false });
  const senal = calls.audit.find((e) => (e.payload as { reviewKind?: string }).reviewKind === "pol_signal");
  assert.equal((senal?.payload as { polizasAfectadas?: number } | undefined)?.polizasAfectadas, 2);
});

test("POL sin nota de formato → sin señal pol_signal (no hay ruido)", async () => {
  const { deps, calls } = makeDeps();
  await runCimaPull([fichero()], deps, { dryRun: false });
  assert.ok(!calls.audit.some((e) => (e.payload as { reviewKind?: string }).reviewKind === "pol_signal"));
});
