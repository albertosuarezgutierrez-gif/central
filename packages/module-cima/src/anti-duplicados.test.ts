/**
 * Anti-duplicados de la ingesta POL (03/10/2026). Origen: 72 pólizas duplicadas
 * fusionadas a mano el 03/10/2026 — CIMA creaba una fila nueva cuando ya había una
 * ficha viva con ese número (sin DGS, aseguradora «(legacy)» o nombre de la
 * compañía, o el número con otra puntuación).
 *
 * Datos SINTÉTICOS, nunca PII real.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  runCimaPull,
  type CimaAuditEvent,
  type CimaPullDeps,
  type PersistInput,
  type PersistResult,
} from "./ingest-pipeline.ts";
import type { EiacPolMapped } from "./eiac-pol-mapper.ts";
import type { FicheroParseado } from "./wse-schemas.ts";
import {
  decidirAntiDuplicado,
  esViolacionNumeroNorm,
  numeroPolizaNorm,
  UNIQUE_VIOLATION_NUMERO_NORM,
  UQ_POLIZAS_NUMERO_NORM,
  type CandidataPorNumero,
  type PolizaMatchInput,
} from "./poliza-matching.ts";

// ── fixtures ────────────────────────────────────────────────────────────────
function fichero(): FicheroParseado {
  return {
    nombreFicheroComprimido: "F.zip",
    tipoObjeto: "POL",
    versionEiac: "6.0",
    codigoEntidad: "C0109",
    checksumVerified: false,
    datos: {},
    rawXml: "<x/>",
    zipEntryCount: 1,
  } as FicheroParseado;
}

function mapped(over: Partial<EiacPolMapped> = {}): EiacPolMapped {
  return {
    outcome: "ok",
    reviewReasons: [],
    idPolizaEntidad: "061089620",
    codigoEntidadDgs: "C0109",
    ramoDgs: "241",
    situacion: "EV",
    estado: "activa",
    situacionConocida: true,
    riesgoShape: [],
    fechaEfectoInicial: "2026-01-01",
    fechaVencimiento: "2027-01-01",
    tipoSeguro: "auto",
    aseguradora: "Allianz",
    tomador: { tipoPersona: "fisica", tipoIdentificacion: "NI", idPersona: "00000001R", nombreCompleto: "X Y" },
    datosEspecificos: null,
    primaBruta: null,
    primaAnual: null,
    fraccionamiento: null,
    coberturas: [],
    intervinientes: [],
    ...over,
  };
}

/** Fila de la «BD» en memoria: lo justo para que el matcher y el anti-duplicados lean. */
interface FilaPoliza {
  id: string;
  correduriaId: string;
  clienteId: string | null;
  aseguradora: string | null;
  numeroPoliza: string | null;
  fechaInicio: string | null;
  codigoEntidadDgs: string | null;
  mergedIntoPolizaId: string | null;
}

const CORR = "corr-1";

/**
 * Deps con una cartera en memoria que imita a `pull-deps.ts`: el matcher ve las
 * fichas vivas del cliente; el anti-duplicados, las vivas de la correduría con el
 * mismo número normalizado; `persist` inserta o actualiza (con el guard de cliente
 * de `buildCimaPolizaUpdateConds`) y, opcionalmente, aplica el índice único 0107.
 */
function cartera(
  filas: FilaPoliza[],
  opts: { clienteResuelto?: string | null; indice0107?: boolean; sinBusquedaPrevia?: boolean; m?: Partial<EiacPolMapped> } = {},
) {
  const audit: CimaAuditEvent[] = [];
  const persistCalls: PersistInput[] = [];
  const clienteResuelto = opts.clienteResuelto === undefined ? "cli-1" : opts.clienteResuelto;
  let seq = 0;
  const vivas = () => filas.filter((r) => r.correduriaId === CORR && r.mergedIntoPolizaId === null);

  const persist = async (i: PersistInput): Promise<PersistResult> => {
    persistCalls.push(i);
    const clienteId = i.resolvedClienteId ?? `cli-nuevo-${++seq}`;
    const nueva = {
      clienteId,
      aseguradora: i.mapped.aseguradora,
      numeroPoliza: i.mapped.idPolizaEntidad,
      fechaInicio: i.mapped.fechaEfectoInicial,
      codigoEntidadDgs: i.mapped.codigoEntidadDgs,
    };
    const violaIndice = (exceptId: string | null) =>
      opts.indice0107 === true &&
      vivas().some(
        (r) =>
          r.id !== exceptId &&
          r.codigoEntidadDgs !== null &&
          r.codigoEntidadDgs === nueva.codigoEntidadDgs &&
          numeroPolizaNorm(r.numeroPoliza) !== null &&
          numeroPolizaNorm(r.numeroPoliza) === numeroPolizaNorm(nueva.numeroPoliza),
      );
    if (i.match.action === "update" && i.match.matchedId) {
      const f = filas.find(
        (r) => r.id === i.match.matchedId && r.correduriaId === CORR && r.clienteId === clienteId && r.mergedIntoPolizaId === null,
      );
      if (!f) return { ok: false, reason: `match_invariante_roto:${i.match.matchedId}` };
      if (violaIndice(f.id)) return { ok: false, reason: UNIQUE_VIOLATION_NUMERO_NORM };
      Object.assign(f, nueva);
      return { ok: true, polizaId: f.id };
    }
    if (violaIndice(null)) return { ok: false, reason: UNIQUE_VIOLATION_NUMERO_NORM };
    const id = `pol-nueva-${++seq}`;
    filas.push({ id, correduriaId: CORR, mergedIntoPolizaId: null, ...nueva });
    return { ok: true, polizaId: id };
  };

  const deps: CimaPullDeps = {
    mapper: () => [mapped(opts.m)],
    computeXmlHash: (xml) => `hash:${xml.length}`,
    isDuplicateXmlHash: () => false,
    isConfirmedXmlHash: () => false,
    resolveCliente: async () =>
      clienteResuelto ? { status: "matched", clienteId: clienteResuelto } : { status: "not_found" },
    loadMatchCandidates: async (_m, cli): Promise<readonly PolizaMatchInput[]> =>
      cli ? vivas().filter((r) => r.clienteId === cli) : [],
    ...(opts.sinBusquedaPrevia
      ? {}
      : {
          loadCandidatasPorNumero: async (n: string): Promise<readonly CandidataPorNumero[]> =>
            vivas().filter((r) => numeroPolizaNorm(r.numeroPoliza) === n),
        }),
    persist,
    confirm: async () => ({ ok: true }),
    recordLedgerWithAudit: async ({ event }) => {
      audit.push(event);
    },
    recordAuditEvent: async (e) => {
      audit.push(e);
    },
    recordFicheroLedger: async () => {},
    log: () => {},
  };
  return { deps, filas, audit, persistCalls };
}

function fila(over: Partial<FilaPoliza> & { id: string }): FilaPoliza {
  return {
    correduriaId: CORR,
    clienteId: "cli-1",
    aseguradora: "(legacy)",
    numeroPoliza: "061089620",
    fechaInicio: "2020-01-01",
    codigoEntidadDgs: null,
    mergedIntoPolizaId: null,
    ...over,
  };
}

const eventos = (audit: CimaAuditEvent[], name: string) => audit.filter((e) => e.eventName === name);

// ── numeroPolizaNorm ────────────────────────────────────────────────────────
test("numeroPolizaNorm: quita la puntuación y baja a minúsculas", () => {
  assert.equal(numeroPolizaNorm("8-5.954.444-F"), "85954444f");
  assert.equal(numeroPolizaNorm(" GUV 410/010.322 "), "guv410010322");
  assert.equal(numeroPolizaNorm("BIDP-019061"), numeroPolizaNorm("bidp019061"));
});

test("numeroPolizaNorm: los comodines y lo inservible son null", () => {
  for (const c of ["PENDIENTE", "NOSE", "NOLOSE", "NOSABE", "SN", "S/N", "SINNUMERO", "SIN NUMERO", "0", "1", "5", "12345", "1.2.3.4.5", "", "   ", null, "00000", "xxxxxxx", "123"]) {
    assert.equal(numeroPolizaNorm(c), null, `debía ser null: ${String(c)}`);
  }
});

test("numeroPolizaNorm: una letra no ASCII se descarta (no se baja a ASCII como hace JS con el signo Kelvin)", () => {
  // U+212A KELVIN SIGN: "K".toLowerCase() === "k" en JS; en SQL se descarta. Espejo de la 0107.
  assert.equal(numeroPolizaNorm("12345K678"), "12345678");
});

// ── decidirAntiDuplicado (puro) ─────────────────────────────────────────────
const inc = { clienteId: "cli-1", numeroPoliza: "061.089.620", codigoEntidadDgs: "C0109" };
const cand = (over: Partial<CandidataPorNumero> & { id: string }): CandidataPorNumero => ({
  clienteId: "cli-1",
  aseguradora: "(legacy)",
  numeroPoliza: "061089620",
  codigoEntidadDgs: null,
  ...over,
});

test("decidir (b): 1 ficha sin DGS «(legacy)» del mismo cliente → adoptar", () => {
  const d = decidirAntiDuplicado(inc, [cand({ id: "a" })]);
  assert.deepEqual(d.kind === "adoptar" && d.polizaId, "a");
});

test("decidir (b): nombre de la compañía del DGS (alias C0468) → adoptar", () => {
  const d = decidirAntiDuplicado({ ...inc, codigoEntidadDgs: "C0468" }, [cand({ id: "a", aseguradora: "Plus  Ultra" })]);
  assert.equal(d.kind, "adoptar");
});

test("decidir (c): 1 ficha de OTRO cliente → posible_duplicado, nunca adoptar", () => {
  const d = decidirAntiDuplicado(inc, [cand({ id: "a", clienteId: "cli-2" })]);
  assert.deepEqual(d, { kind: "posible_duplicado", candidatas: 1, motivo: "ficha_de_otro_cliente" });
});

test("decidir (c): cliente entrante desconocido (null) → nunca adopta", () => {
  const d = decidirAntiDuplicado({ ...inc, clienteId: null }, [cand({ id: "a", clienteId: null })]);
  assert.equal(d.kind, "posible_duplicado");
});

test("decidir (c): varias fichas compatibles → posible_duplicado con el recuento", () => {
  const d = decidirAntiDuplicado(inc, [cand({ id: "a" }), cand({ id: "b", aseguradora: "Allianz" })]);
  assert.deepEqual(d, { kind: "posible_duplicado", candidatas: 2, motivo: "varias_fichas_con_ese_numero" });
});

test("decidir (c): sin DGS y nombre de OTRA compañía → no adopta, avisa", () => {
  const d = decidirAntiDuplicado(inc, [cand({ id: "a", aseguradora: "Mapfre" })]);
  assert.deepEqual(d, { kind: "posible_duplicado", candidatas: 1, motivo: "ficha_de_otra_compania_sin_dgs" });
});

test("decidir: ficha con OTRO DGS es otra póliza → crear sin aviso", () => {
  const d = decidirAntiDuplicado(inc, [cand({ id: "a", codigoEntidadDgs: "C0058", aseguradora: "Mapfre" })]);
  assert.equal(d.kind, "crear");
});

test("decidir: comodín nunca adopta, aunque haya ficha idéntica", () => {
  for (const n of ["PENDIENTE", "12345", "SN", "0", ""]) {
    const d = decidirAntiDuplicado({ ...inc, numeroPoliza: n }, [cand({ id: "a", numeroPoliza: n })]);
    assert.equal(d.kind, "crear", n);
  }
});

// ── pipeline (a)/(b)/(c)/comodín ────────────────────────────────────────────
test("(a) 1 ficha con el mismo número y DGS del cliente → la actualiza el matcher (como hasta hoy)", async () => {
  const c = cartera([fila({ id: "a", codigoEntidadDgs: "C0109", aseguradora: "Allianz" })]);
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(c.persistCalls[0].match.action, "update");
  assert.equal(c.persistCalls[0].match.matchedBy, "numero_poliza");
  assert.equal(c.persistCalls[0].match.matchedId, "a");
  assert.equal(c.filas.length, 1);
  assert.equal(eventos(c.audit, "cima_poliza_adoptada").length, 0);
});

test("(b) ficha «(legacy)» sin DGS, mismo cliente, otra puntuación → ADOPTADA: le pone el DGS, sin fila nueva, evento", async () => {
  const c = cartera([fila({ id: "a", numeroPoliza: "061-089.620" })]);
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(c.filas.length, 1, "no se crea fila nueva");
  assert.equal(c.persistCalls.length, 1);
  assert.deepEqual(
    { action: c.persistCalls[0].match.action, id: c.persistCalls[0].match.matchedId, by: c.persistCalls[0].match.matchedBy },
    { action: "update", id: "a", by: "adopcion" },
  );
  assert.equal(c.filas[0].codigoEntidadDgs, "C0109");
  assert.equal(c.filas[0].numeroPoliza, "061089620");
  const ev = eventos(c.audit, "cima_poliza_adoptada");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.poliza_id, "a");
  assert.equal(ev[0].payload.numero, "061089620");
});

test("(b) ficha con un nombre antiguo de la compañía (Plus Ultra = C0468, sin DGS) → adoptada", async () => {
  // Con el mismo nombre que pone el mapper ya la cogía el matcher; con la marca antigua, no.
  const c = cartera([fila({ id: "a", aseguradora: "Plus Ultra", numeroPoliza: "BIDP-019061" })], {
    m: { idPolizaEntidad: "BIDP019061", codigoEntidadDgs: "C0468", aseguradora: "Occident" },
  });
  await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(c.filas[0].codigoEntidadDgs, "C0468");
  assert.equal(c.filas.length, 1);
  assert.equal(c.persistCalls[0].match.matchedBy, "adopcion");
});

test("(c) ficha con el número pero de OTRO cliente → crea como hoy + cima_posible_duplicado", async () => {
  const c = cartera([fila({ id: "a", clienteId: "cli-2" })]);
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(c.filas.length, 2);
  assert.equal(c.filas[0].codigoEntidadDgs, null, "la ficha del otro cliente no se toca");
  assert.equal(c.persistCalls[0].match.action, "insert");
  const ev = eventos(c.audit, "cima_posible_duplicado");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.numero, "061089620");
  assert.equal(ev[0].payload.candidatas, 1);
});

test("(c) varias fichas del mismo cliente con ese número → crea + aviso con candidatas: 2", async () => {
  const c = cartera([fila({ id: "a" }), fila({ id: "b", numeroPoliza: "061 089 620" })]);
  await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(c.persistCalls[0].match.action, "insert");
  assert.equal(eventos(c.audit, "cima_posible_duplicado")[0].payload.candidatas, 2);
});

test("(c) otra correduría: su ficha no es candidata (ni se adopta ni cuenta)", async () => {
  const c = cartera([fila({ id: "a", correduriaId: "corr-OTRA" })]);
  await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(c.persistCalls[0].match.action, "insert");
  assert.equal(c.audit.filter((e) => e.eventName.startsWith("cima_pos") || e.eventName === "cima_poliza_adoptada").length, 0);
});

test("comodín: número PENDIENTE con ficha idéntica del mismo cliente → no adopta, no avisa", async () => {
  const c = cartera([fila({ id: "a", numeroPoliza: "PENDIENTE" })], { m: { idPolizaEntidad: "PENDIENTE" } });
  await runCimaPull([fichero()], c.deps, { dryRun: false });
  // El matcher puede ir por fallback (cliente+aseguradora+fecha) pero JAMÁS por adopción.
  assert.notEqual(c.persistCalls[0].match.matchedBy, "adopcion");
  assert.equal(eventos(c.audit, "cima_poliza_adoptada").length, 0);
  assert.equal(eventos(c.audit, "cima_posible_duplicado").length, 0);
});

test("comodín 12345 (pasa normalizePolizaNumber) → tampoco adopta", async () => {
  const c = cartera([fila({ id: "a", numeroPoliza: "12345" })], { m: { idPolizaEntidad: "12345" } });
  await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.notEqual(c.persistCalls[0].match.matchedBy, "adopcion");
  assert.equal(eventos(c.audit, "cima_poliza_adoptada").length, 0);
});

// ── robustez: ante la duda, crear y avisar ──────────────────────────────────
test("la búsqueda previa falla → crea como hoy + aviso con candidatas null (no se sabe)", async () => {
  const c = cartera([fila({ id: "a" })]);
  c.deps.loadCandidatasPorNumero = async () => {
    throw new Error("boom");
  };
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(c.persistCalls[0].match.action, "insert");
  const ev = eventos(c.audit, "cima_posible_duplicado");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.candidatas, null);
});

test("la adopción falla en la tx (invariante roto) → se reintenta como alta + aviso, el fichero no se rompe", async () => {
  const c = cartera([fila({ id: "a" })]);
  const real = c.deps.persist;
  c.deps.persist = async (i) => (i.match.matchedBy === "adopcion" ? { ok: false, reason: "match_invariante_roto:a" } : real(i));
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed");
  assert.equal(c.filas.length, 2);
  assert.equal(eventos(c.audit, "cima_posible_duplicado").length, 1);
  assert.equal(eventos(c.audit, "cima_poliza_adoptada").length, 0);
});

test("23505 del índice 0107 → la póliza va a review + cima_posible_duplicado; el resto del fichero persiste", async () => {
  // Ficha viva de OTRO cliente con mismo número y DGS: no se adopta y el índice veta el alta.
  const c = cartera([fila({ id: "a", clienteId: "cli-2", codigoEntidadDgs: "C0109", aseguradora: "Allianz" })], { indice0107: true });
  const otra = mapped({ idPolizaEntidad: "99887766" });
  c.deps.mapper = () => [mapped(), otra];
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "confirmed", "1 de 2 persiste → el fichero se confirma");
  assert.equal(c.filas.length, 2, "solo se crea la 99887766");
  const ev = eventos(c.audit, "cima_posible_duplicado");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.numero, "061089620");
  assert.equal(eventos(c.audit, "cima_fichero_error").length, 0, "no es un error de persist");
});

test("23505 del índice 0107 sin búsqueda previa (dep ausente) → review + aviso con candidatas null", async () => {
  const c = cartera([fila({ id: "a", clienteId: "cli-2", codigoEntidadDgs: "C0109" })], { indice0107: true, sinBusquedaPrevia: true });
  const r = await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(r.outcomes[0].estado, "review");
  const ev = eventos(c.audit, "cima_posible_duplicado");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].payload.candidatas, null);
  assert.equal(ev[0].payload.motivo, "indice_unico_numero_norm");
});

test("esViolacionNumeroNorm: solo el 23505 de ESE índice (directo o en .cause)", () => {
  assert.equal(esViolacionNumeroNorm({ code: "23505", constraint_name: UQ_POLIZAS_NUMERO_NORM }), true);
  assert.equal(esViolacionNumeroNorm({ cause: { code: "23505", constraint_name: UQ_POLIZAS_NUMERO_NORM } }), true);
  assert.equal(esViolacionNumeroNorm({ code: "23505", constraint_name: "uq_cima_ficheros_xml_hash" }), false);
  assert.equal(esViolacionNumeroNorm({ code: "23505" }), false);
  assert.equal(esViolacionNumeroNorm(new Error("x")), false);
});

// ── GUARDIÁN ────────────────────────────────────────────────────────────────
test("GUARDIÁN: una póliza CIMA con número y compañía de una ficha viva NO crea fila nueva", async () => {
  // La ficha del volcado: sin DGS, aseguradora «(legacy)» y otra puntuación. Es el
  // patrón de las 72 duplicadas fusionadas a mano el 03/10/2026.
  const c = cartera([fila({ id: "viva", numeroPoliza: "0610-89620" })]);
  await runCimaPull([fichero()], c.deps, { dryRun: false });
  assert.equal(c.filas.length, 1, "la ingesta creó una fila nueva en vez de adoptar la ficha viva");
  assert.equal(c.filas[0].id, "viva");
  assert.equal(c.filas[0].codigoEntidadDgs, "C0109");
});

// PORT central (fase 1): el cepo «0107: índice NO único con la MISMA expresión que la
// consulta de pull-deps» lee `pull-deps.ts` y la migración 0107 (capa de BD); se porta
// con `src/db/` en la fase 2.
