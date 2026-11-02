import assert from "node:assert/strict";
import test from "node:test";

import {
  runCimaPull,
  type CimaAuditEvent,
  type CimaPullDeps,
  type CimaPullOptions,
  type LedgerEntry,
  type PersistInput,
} from "./ingest-pipeline.ts";
import type { EiacPolMapped } from "./eiac-pol-mapper.ts";
import type { FicheroParseado } from "./wse-schemas.ts";
import { CIMA_INGERIR_MANUAL_OPTS } from "./ingerir-manual-opts.ts";

// RESCATE MANUAL: `sinConfirmarTirea` NUNCA habla con TIREA (confirmar consume el
// fichero para siempre). Default false = pull programado intacto.

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


const RESCATE: CimaPullOptions = { dryRun: false, reprocess: true, sinConfirmarTirea: true };
const PULL: CimaPullOptions = { dryRun: false, reprocess: true };

function depsPorTipo(tipo: "POL" | "REC" | "SIN" | "CEF") {
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
  const persistOk = { ok: true, outcome: "persisted" } as const;
  const common = {
    loadSiniestroCandidates: async () => [
      { polizaId: "pol-1", clienteId: "cli-1", numeroPoliza: "POL123456", codigoEntidadDgs: "C0109" },
    ],
    loadReciboCandidates: async () => [
      { polizaId: "pol-1", clienteId: "cli-1", numeroPoliza: "POL123456", codigoEntidadDgs: "C0109" },
    ],
    loadCefReciboIndex: async () => new Map([["881227973|C0109", "rec-1"]]),
    loadCefPolizaIndex: async () => new Map([["POL123456|C0109", "pol-1"]]),
  };
  const r = makeDeps({
    ...common,
    sinEnabled: true,
    recEnabled: true,
    cefEnabled: true,
    mapperSin: () => [sinMapped],
    mapperRec: () => [recMapped],
    mapperCef: () => [cefMapped],
    persistSiniestro: async () => ({ ...persistOk, siniestroId: "sin-1" }),
    persistRecibo: async () => ({ ...persistOk, reciboId: "rec-1" }),
    persistCef: async () => ({ ...persistOk, cuentaEfectivoId: "c-1", liquidacionesCount: 0, movimientosCount: 0 }),
  });
  return { ...r, f: fichero({ tipoObjeto: tipo, nombreFicheroComprimido: `${tipo}.zip` }) };
}

for (const tipo of ["POL", "REC", "SIN", "CEF"] as const) {
  test(`sinConfirmarTirea: ${tipo} se persiste y confirm se llama 0 veces; fichero queda confirmed sin sellar confirmado_at`, async () => {
    const { deps, calls, f } = depsPorTipo(tipo);
    const r = await runCimaPull([f], deps, RESCATE);
    assert.equal(r.errors.length, 0);
    assert.equal(r.outcomes[0].estado, "confirmed");
    assert.equal(calls.confirm.length, 0, "el rescate NO debe hablar con TIREA");
    if (tipo === "POL") assert.equal(calls.persist.length, 1);
    assert.equal(calls.ficheroLedger.length, 1);
    assert.equal(calls.ficheroLedger[0].ledger.estado, "confirmed");
    assert.equal(calls.ficheroLedger[0].ackOk, false, "no inventa un dequeue: confirmado_at no se re-sella");
  });

  test(`regresión: ${tipo} SIN la opción sigue confirmando 1 vez (pull programado intacto)`, async () => {
    const { deps, calls, f } = depsPorTipo(tipo);
    const r = await runCimaPull([f], deps, PULL);
    assert.equal(r.outcomes[0].estado, "confirmed");
    assert.equal(calls.confirm.length, 1);
    assert.equal(calls.ficheroLedger[0].ackOk, true);
  });
}

test("sinConfirmarTirea: duplicado en el mismo lote tampoco confirma", async () => {
  const { deps, calls, f } = depsPorTipo("POL");
  await runCimaPull([f, { ...f, nombreFicheroComprimido: "POL2.zip" }], deps, RESCATE);
  assert.equal(calls.confirm.length, 0);
});

test("ingerir-manual: las opciones del rescate llevan sinConfirmarTirea y la ruta las usa", () => {
  assert.equal(CIMA_INGERIR_MANUAL_OPTS.sinConfirmarTirea, true);
  assert.equal(CIMA_INGERIR_MANUAL_OPTS.dryRun, false);
  assert.equal(CIMA_INGERIR_MANUAL_OPTS.reprocess, true);
  // PORT central (fase 1): la mitad de este test que lee las RUTAS
  // (`ingerir-manual/route.ts` usa estas opciones; `reprocesar-cuarentena/route.ts`
  // NO lleva `sinConfirmarTirea`) se restaura cuando se porten las rutas a
  // apps/asegura (fase 3). Aquí solo existen las opciones.
});
