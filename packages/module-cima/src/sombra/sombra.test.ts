/**
 * Cepos del comparador en SOMBRA (fase 4). Datos SINTÉTICOS: los 6 ficheros de ejemplo de
 * la norma EIAC V07.1 y el golden de escrituras del CRM (lo que el CRM escribe de verdad).
 *
 *  (a) el driver grabador NUNCA ejecuta escrituras: a la «BD» solo le llegan lecturas;
 *  (b) con CIMA_ESCRITOR=central la sombra (y el script) abortan antes de conectar;
 *  (c) la comparación clasifica bien igual / difiere (con campo) / solo-central / solo-crm;
 *  (d) el informe no lleva PII en claro (NIF, IBAN, email).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { olvidarColumnasOpcionales } from "../db/columna-opcional.ts";
import { ENV_ARNES } from "../db/equivalencia-persist-arnes.ts";
import { CASOS_ESCRITURAS } from "../db/equivalencia-persist-casos.ts";
import { parseEiacXml } from "../manual-xml.ts";
import {
  CimaSombraEscritorCentralError,
  clasificarEntidades,
  compararSombra,
  type CrudoSombra,
  type EntidadCentral,
  type FilaBd,
  type LectorEstadoActual,
} from "./comparar.ts";
import { prepararEntornoSombra } from "./ejecutar.ts";
import { valorVisible } from "./informe.ts";
import type { LectorSql } from "./grabador.ts";
import { esLectura, parsearEscritura } from "./sql-escrituras.ts";

const FX = join(import.meta.dirname, "..", "__fixtures__");
const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const GOLDEN = JSON.parse(readFileSync(join(FX, "golden", "escrituras-crm-2026-11-02.json"), "utf8")) as Record<
  string,
  { sentencias: Array<{ sql: string; params: unknown[] }> }
>;
const CORREDURIA = ENV_ARNES.CIMA_INGESTA_CORREDURIA_ID!;
// Entorno REAL de la sombra: el de los tests del golden, pero el escritor real NO es central.
const ENV_REAL: Record<string, string> = { ...ENV_ARNES, CIMA_ESCRITOR: "ninguno" };

let envPrevio: Record<string, string | undefined> = {};
before(() => {
  envPrevio = Object.fromEntries(Object.keys(ENV_REAL).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ENV_REAL);
});
after(() => {
  for (const [k, v] of Object.entries(envPrevio)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function crudo(nombreFichero: string, tipoObjeto: string, codigoEntidad = "C0001"): CrudoSombra {
  const xml = readFileSync(join(FX, nombreFichero), "utf8");
  return {
    nombreFichero,
    tipoObjeto,
    codigoEntidad,
    xmlHash: createHash("sha256").update(xml, "utf8").digest("hex"),
    datos: parseEiacXml(xml),
    // Como la copia preventiva real: sin XML (solo `datos`).
    rawXml: null,
  };
}
const TODOS = CASOS_ESCRITURAS.map((c) => crudo(c.nombreFichero, c.tipoObjeto, c.codigoEntidad));

const LECTOR_VACIO: LectorEstadoActual = { porClave: async () => null, porId: async () => null, porXmlHash: async () => [] };

/** «BD» espía: registra todo lo que le llega y responde como el golden. */
function bdEspia() {
  const recibidas: string[] = [];
  const leer: LectorSql = async (sql, _p, modo) => {
    recibidas.push(sql);
    return /pg_catalog\.pg_attribute/.test(sql) ? (modo === "all" ? [[true]] : [{ existe: true }]) : [];
  };
  return { recibidas, leer };
}

/** Fila de cuenta_efectivo tal como la dejó el CRM: los VALUES del golden, con los tipos
 * que devuelve postgres.js (timestamptz en texto de Postgres, jsonb ya parseado). */
function filaCefDelCrm(): FilaBd {
  const s = GOLDEN["eiac-ctaefectivo-V07-1_V06.xml"]!.sentencias.find((x) => x.sql.startsWith('insert into "cuenta_efectivo"'))!;
  const p = parsearEscritura(s.sql);
  const fila: FilaBd = { id: "aaaaaaaa-0000-4000-8000-000000000001" };
  p.columnas.forEach((col, i) => {
    const ex = p.filas[0]![i]!;
    if (ex.k === "param") fila[col] = s.params[ex.i];
  });
  fila.periodo_inicio = "2024-01-01 00:00:00+00";
  fila.periodo_fin = "2024-01-31 00:00:00+00";
  fila.datos_extra = JSON.parse(fila.datos_extra as string);
  return fila;
}

// ── (a) ────────────────────────────────────────────────────────────────────────

test("(a) clasificador: solo SELECT/WITH sin efectos es lectura", () => {
  assert.equal(esLectura('select "id" from "polizas" where "polizas"."id" = $1'), true);
  assert.equal(esLectura('select "id" from "siniestros" where x = $1 for update'), true);
  assert.equal(esLectura('select "updated_at", "delete" from "t"'), true);
  for (const w of [
    'insert into "polizas" ("id") values (default)',
    'update "polizas" set "estado" = $1',
    'delete from "poliza_coberturas" where 1=1',
    "with x as (delete from t returning *) select * from x",
    "select nextval('s')",
    "select pg_advisory_lock(1)",
    "select 1; delete from t",
    "set default_transaction_read_only = off",
  ]) {
    assert.equal(esLectura(w), false, w);
  }
});

test("(a) el grabador NUNCA ejecuta escrituras: a la BD solo llegan lecturas (6 ficheros)", async () => {
  olvidarColumnasOpcionales();
  const bd = bdEspia();
  const informe = await compararSombra({ crudos: TODOS, leerEstadoActual: LECTOR_VACIO, leerSelect: bd.leer, correduriaId: CORREDURIA, env: process.env });
  assert.ok(informe.sentencias.escriturasGrabadas > 0, "el pipeline tenía que intentar escribir");
  assert.ok(bd.recibidas.length > 0, "y leer");
  for (const sql of bd.recibidas) {
    assert.doesNotMatch(sql, /^\s*(insert|update|delete|merge|truncate)\b/i, sql.slice(0, 80));
    assert.doesNotMatch(sql, /\bfor\s+update\b/i, sql.slice(0, 80));
  }
  assert.equal(informe.sentencias.lecturasReenviadas, bd.recibidas.length);
});

// ── (b) ────────────────────────────────────────────────────────────────────────

test("(b) compararSombra aborta con CIMA_ESCRITOR=central sin tocar la BD", async () => {
  const bd = bdEspia();
  for (const env of [{ ...ENV_REAL, CIMA_ESCRITOR: "central" }, { ...ENV_REAL, CIMA_ESCRITOR: " central " }]) {
    await assert.rejects(
      compararSombra({ crudos: TODOS, leerEstadoActual: LECTOR_VACIO, leerSelect: bd.leer, correduriaId: CORREDURIA, env }),
      CimaSombraEscritorCentralError,
    );
  }
  assert.equal(bd.recibidas.length, 0);
  const env: Record<string, string | undefined> = { CIMA_ESCRITOR: "central" };
  assert.throws(() => prepararEntornoSombra(env), CimaSombraEscritorCentralError);
  const env2: Record<string, string | undefined> = { CIMA_ESCRITOR: "crm" };
  prepararEntornoSombra(env2);
  assert.equal(env2.CIMA_ESCRITOR, "ninguno", "el escritor del proceso queda forzado a ninguno");
});

test("(b) el script aborta (código 2) con CIMA_ESCRITOR=central antes de conectar", () => {
  for (const escritor of ["central", " central "]) {
    const r = spawnSync(process.execPath, [join(RAIZ, "scripts", "cima-sombra.mts")], {
      env: {
        PATH: process.env.PATH,
        CIMA_ESCRITOR: escritor,
        // Puerto 9 (discard): si llegara a conectar, el error sería otro.
        CIMA_SOMBRA_DATABASE_URL: "postgres://nadie:nada@127.0.0.1:9/nada",
        PII_ENCRYPTION_KEY: "a".repeat(64),
        PII_LOOKUP_KEY: "b".repeat(64),
      },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(r.status, 2, `${r.stderr}${r.stdout}`);
    assert.match(r.stderr, /cima_sombra_escritor_central/);
  }
});

// ── (c) ────────────────────────────────────────────────────────────────────────

test("(c) clasificarEntidades: igual / difiere (campo) / solo-central / solo-crm", () => {
  const ent = (clave: string, columnas: Record<string, unknown>, crm: FilaBd | null): EntidadCentral => ({
    tabla: "poliza_recibos",
    clave: `poliza_recibos|${CORREDURIA}|${clave}|C0001`,
    claveValores: { correduria_id: CORREDURIA, id_recibo: clave, codigo_entidad_dgs: "C0001" },
    columnas: new Map(Object.entries(columnas)),
    noEvaluables: new Set(),
    ficheros: new Set(["F.zip"]),
    crm,
  });
  const base = { correduria_id: CORREDURIA, codigo_entidad_dgs: "C0001" };
  const { entidades } = clasificarEntidades(
    [
      ent("R1", { situacion: "COB", prima_total: "12.50", fecha_emision: "2024-01-01T00:00:00.000Z", updated_at: "x" }, {
        ...base, id: "u1", id_recibo: "R1", situacion: "COB", prima_total: 12.5, fecha_emision: "2024-01-01 00:00:00+00", updated_at: "y",
      }),
      ent("R2", { situacion: "COB", prima_total: "10" }, { ...base, id: "u2", id_recibo: "R2", situacion: "PEN", prima_total: "10" }),
      ent("R3", { situacion: "COB" }, null),
    ],
    [
      { tabla: "poliza_recibos", fila: { ...base, id: "u1", id_recibo: "R1" } },
      { tabla: "poliza_recibos", fila: { ...base, id: "u4", id_recibo: "R4" } },
    ],
  );
  const por = Object.fromEntries(entidades.map((e) => [e.clave.id_recibo as string, e]));
  assert.equal(por.R1!.clasificacion, "igual");
  assert.equal(por.R2!.clasificacion, "difiere");
  assert.deepEqual(por.R2!.campos, [{ campo: "situacion", central: "COB", crm: "PEN" }]);
  assert.equal(por.R3!.clasificacion, "solo_central");
  assert.equal(por.R4!.clasificacion, "solo_crm");
  assert.equal(entidades.length, 4, "R1 del CRM no se cuenta dos veces");
});

test("(c) extremo a extremo con lo que escribe el CRM (golden): CEF igual, luego difiere en saldo_final; POL solo-central; fila CRM huérfana solo-crm", async () => {
  const cef = crudo("eiac-ctaefectivo-V07-1_V06.xml", "CEF");
  const pol = crudo("eiac-polizas-V07-1_V06.xml", "POL");
  const huerfana: FilaBd = { id: "bbbbbbbb-0000-4000-8000-000000000002", correduria_id: CORREDURIA, id_poliza_entidad: "OTRA", codigo_entidad_dgs: "C0001", eiac_xml_hash: pol.xmlHash };
  const lector = (cefCrm: FilaBd): LectorEstadoActual => ({
    porClave: async (tabla, clave) =>
      tabla === "cuenta_efectivo" && clave.codigo_entidad_dgs === "C0001" ? cefCrm : null,
    porId: async () => null,
    porXmlHash: async (tabla, hashes) => {
      if (tabla === "cuenta_efectivo" && hashes.includes(cef.xmlHash)) return [cefCrm];
      if (tabla === "polizas" && hashes.includes(pol.xmlHash)) return [huerfana];
      return [];
    },
  });

  olvidarColumnasOpcionales();
  const igual = await compararSombra({ crudos: [cef, pol], leerEstadoActual: lector(filaCefDelCrm()), leerSelect: bdEspia().leer, correduriaId: CORREDURIA, env: process.env });
  assert.equal(igual.resumen.porTabla.cuenta_efectivo.iguales, 1, JSON.stringify(igual.detalle));
  assert.equal(igual.resumen.porTabla.cuenta_efectivo.difieren, 0);
  assert.equal(igual.resumen.porTabla.polizas.soloCentral, 1);
  assert.equal(igual.resumen.porTabla.polizas.soloCrm, 1);

  olvidarColumnasOpcionales();
  const cambiada = { ...filaCefDelCrm(), saldo_final: "999.99" };
  const difiere = await compararSombra({ crudos: [cef, pol], leerEstadoActual: lector(cambiada), leerSelect: bdEspia().leer, correduriaId: CORREDURIA, env: process.env });
  assert.equal(difiere.resumen.porTabla.cuenta_efectivo.difieren, 1);
  assert.deepEqual(difiere.resumen.camposQueDifieren, { "cuenta_efectivo.saldo_final": 1 });
  const d = difiere.detalle.find((e) => e.clasificacion === "difiere")!;
  assert.deepEqual(d.campos, [{ campo: "saldo_final", central: "0", crm: "999.99" }]);
});

// ── (d) ────────────────────────────────────────────────────────────────────────

test("(d) el informe no lleva PII en claro (NIF, IBAN, email)", async () => {
  const NIF = "12345678Z";
  const IBAN = "ES7921000813610123456789";
  const EMAIL = "ana.perez@example.com";
  const cef = { ...crudo("eiac-ctaefectivo-V07-1_V06.xml", "CEF"), nombreFichero: `cef-${EMAIL}.zip` };
  const pol = crudo("eiac-polizas-V07-1_V06.xml", "POL");
  const cefCrm: FilaBd = {
    ...filaCefDelCrm(),
    // Campos NO sensibles por nombre con PII dentro: tiene que taparla el saneador.
    saldo_final: IBAN,
    remesas: EMAIL,
    retencion_otros: `NIF ${NIF}`,
    // Campo sensible por nombre: se oculta entero.
    datos_extra: { tomador: { nif: NIF, email: EMAIL, iban: IBAN } },
  };
  const huerfana: FilaBd = { id: "cccccccc-0000-4000-8000-000000000003", correduria_id: CORREDURIA, id_poliza_entidad: NIF, codigo_entidad_dgs: "C0001", eiac_xml_hash: pol.xmlHash };
  olvidarColumnasOpcionales();
  const informe = await compararSombra({
    crudos: [cef, pol],
    leerEstadoActual: {
      porClave: async (t) => (t === "cuenta_efectivo" ? cefCrm : null),
      porId: async () => null,
      porXmlHash: async (t) => (t === "cuenta_efectivo" ? [cefCrm] : t === "polizas" ? [huerfana] : []),
    },
    leerSelect: bdEspia().leer,
    correduriaId: CORREDURIA,
    env: process.env,
  });
  assert.ok(informe.resumen.difieren >= 1, "tiene que haber diferencias que enseñar");
  const texto = JSON.stringify(informe);
  for (const pii of [NIF, IBAN, EMAIL, "ana.perez", "21000813610123456789"]) {
    assert.ok(!texto.includes(pii), `PII en claro en el informe: ${pii}`);
  }
});

test("(d2) lista blanca: texto libre y columnas no listadas salen ocultos; estados e importes, visibles", () => {
  assert.equal(valorVisible("comentario", "Llamar a Maria Lopez"), "<oculto>");
  assert.equal(valorVisible("referencia", "Calle Mayor 5 Sevilla"), "<oculto>");
  assert.equal(valorVisible("columna_nueva_inventada", "Ana"), "<oculto>");
  assert.equal(valorVisible("columna_nueva_inventada", 12), "<oculto>");
  assert.equal(valorVisible("tipo", "Maria"), "<oculto>");
  // Una columna listada con un valor que no tiene la forma de su clase tampoco sale.
  assert.equal(valorVisible("saldo_final", "Calle Mayor 5"), "<oculto>");
  assert.equal(valorVisible("estado", "Llamar a Maria Lopez"), "<oculto>");
  // Lo no personal sigue visible.
  assert.equal(valorVisible("estado", "abierto"), "abierto");
  assert.equal(valorVisible("situacion", "V"), "V");
  assert.equal(valorVisible("codigo_entidad_dgs", "C0001"), "C0001");
  assert.equal(valorVisible("prima_total", "12.50"), "12.50");
  assert.equal(valorVisible("reserva_importe", 100), 100);
  assert.equal(valorVisible("se_considera_culpable", true), true);
  assert.equal(valorVisible("fecha_emision", "2026-01-31"), "2026-01-31");
  assert.equal(valorVisible("periodo_inicio", new Date("2026-01-01T00:00:00Z")), "2026-01-01T00:00:00.000Z");
  assert.equal(valorVisible("correduria_id", "cccccccc-0000-4000-8000-000000000003"), "<uuid>");
  assert.equal(valorVisible("estado", null), null);
});

test("(d3) claves naturales seudonimizadas: estables, distintas entre sí y sin el valor en claro", () => {
  const a = valorVisible("id_poliza_entidad", "POL-12345678Z");
  const b = valorVisible("id_poliza_entidad", "POL-12345678Z");
  const c = valorVisible("id_poliza_entidad", "POL-OTRA");
  assert.match(String(a), /^h:[0-9a-f]{8}$/);
  assert.equal(a, b, "igual valor → mismo seudónimo (la comparación sigue siendo útil)");
  assert.notEqual(a, c);
  assert.ok(!String(a).includes("12345678Z"));
  assert.match(String(valorVisible("id_recibo", "R-1")), /^h:[0-9a-f]{8}$/);
  assert.match(String(valorVisible("id_siniestro_entidad", "S-1")), /^h:[0-9a-f]{8}$/);
});
