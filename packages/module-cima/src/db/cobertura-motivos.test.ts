/**
 * 03/10/2026 — Monitor de cobertura: «excluido a propósito» ≠ «sin leer». El medidor
 * guarda el motivo de exclusión (`cima_cobertura_campos.excluido_motivo`, 0106) y
 * tolera que la columna aún no exista en la BD (no rompe la ingesta).
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";

import { escribirMotivosExclusion } from "./cobertura-motivos.ts";
import { olvidarColumnasOpcionales } from "./columna-opcional.ts";
import type { RutaCampo } from "../field-coverage.ts";

const CORR = "11111111-2222-3333-4444-555555555555";

function fakeDb(columna: boolean) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  return {
    consultas,
    dbc: {
      execute: (q: unknown) => {
        const r = new PgDialect().sqlToQuery(q as never);
        consultas.push(r);
        if (/pg_attribute/.test(r.sql)) return Promise.resolve([{ existe: columna }]);
        return Promise.resolve([]);
      },
    },
  };
}

const RUTAS: RutaCampo[] = [
  { ruta: "Objetos.Recibo.X.IBAN", hoja: true, leido: false, excluido: "bancario" },
  { ruta: "Objetos.Recibo.X.Sexo", hoja: true, leido: false, excluido: "persona" },
  { ruta: "Objetos.Recibo.X.Leida", hoja: true, leido: true },
  { ruta: "Objetos.Recibo.X.SinMotivo", hoja: true, leido: false },
  { ruta: "Objetos.Recibo.X", hoja: false, leido: false, excluido: "persona" },
];

beforeEach(() => olvidarColumnasOpcionales());

// PORT central (fase 3): el test puro de `motivosExclusion` vive en `../cobertura-motivos.test.ts`;
// aquí los 4 «medidor: …» de BD que se recortaron en la fase 1.

test("medidor: una ruta que pasa a LEERSE limpia su excluido_motivo (NULL)", async () => {
  const f = fakeDb(true);
  await escribirMotivosExclusion(
    f.dbc,
    { correduriaId: CORR, tipoObjeto: "REC", codigoEntidad: "C0058" },
    [{ ruta: "Objetos.Recibo.X.AhoraSeLee", hoja: true, leido: true }],
  );
  const upd = f.consultas.find((c) => /^\s*update/i.test(c.sql));
  assert.ok(upd, "hay UPDATE para limpiar el motivo");
  assert.ok(upd.params.includes("Objetos.Recibo.X.AhoraSeLee"));
  assert.ok(upd.params.includes(null), "el motivo enviado es NULL");
  assert.match(upd.sql, /excluido_motivo"? is distinct from v\.motivo/i, "solo toca filas que cambian");
});

test("medidor: guarda el motivo de exclusión de cada ruta excluida (clave completa, NULL-safe en compañía)", async () => {
  const f = fakeDb(true);
  const n = await escribirMotivosExclusion(f.dbc, { correduriaId: CORR, tipoObjeto: "REC", codigoEntidad: null }, RUTAS);
  assert.equal(n, 3);
  const upd = f.consultas.find((c) => /^\s*update/i.test(c.sql));
  assert.ok(upd, "hay UPDATE");
  assert.match(upd.sql, /set "?excluido_motivo"? = v\.motivo/i);
  assert.match(upd.sql, /codigo_entidad"? is not distinct from/i);
  // Una hoja NO leída sin motivo no se envía: su motivo previo se conserva.
  for (const v of [CORR, "REC", "Objetos.Recibo.X.IBAN", "bancario", "Objetos.Recibo.X.Sexo", "persona"]) {
    assert.ok(upd.params.includes(v), `parámetro ${v}`);
  }
  assert.ok(!upd.params.includes("Objetos.Recibo.X.SinMotivo"));
});

test("medidor: columna excluido_motivo AÚN NO creada → no escribe nada (ni rompe)", async () => {
  const f = fakeDb(false);
  const n = await escribirMotivosExclusion(f.dbc, { correduriaId: CORR, tipoObjeto: "REC", codigoEntidad: "C0058" }, RUTAS);
  assert.equal(n, 0);
  assert.equal(f.consultas.filter((c) => /^\s*update/i.test(c.sql)).length, 0);
});

test("medidor: sin rutas excluidas ni leídas → ni siquiera consulta la BD", async () => {
  const f = fakeDb(true);
  const n = await escribirMotivosExclusion(
    f.dbc,
    { correduriaId: CORR, tipoObjeto: "REC", codigoEntidad: "C0058" },
    RUTAS.filter((r) => !r.excluido && !r.leido),
  );
  assert.equal(n, 0);
  assert.equal(f.consultas.length, 0);
});
