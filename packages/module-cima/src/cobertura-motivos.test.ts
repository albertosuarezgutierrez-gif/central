/**
 * 03/10/2026 — Monitor de cobertura: «excluido a propósito» ≠ «sin leer». El medidor
 * guarda el motivo de exclusión (`cima_cobertura_campos.excluido_motivo`, 0106) y
 * tolera que la columna aún no exista en la BD (no rompe la ingesta).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { motivosExclusion } from "./cobertura-motivos.ts";
import type { RutaCampo } from "./field-coverage.ts";

// PORT central (fase 1): los tests «medidor: …» de `escribirMotivosExclusion` (BD,
// drizzle PgDialect) se portan con la capa de BD en la fase 2.

const RUTAS: RutaCampo[] = [
  { ruta: "Objetos.Recibo.X.IBAN", hoja: true, leido: false, excluido: "bancario" },
  { ruta: "Objetos.Recibo.X.Sexo", hoja: true, leido: false, excluido: "persona" },
  { ruta: "Objetos.Recibo.X.Leida", hoja: true, leido: true },
  { ruta: "Objetos.Recibo.X.SinMotivo", hoja: true, leido: false },
  { ruta: "Objetos.Recibo.X", hoja: false, leido: false, excluido: "persona" },
];

test("motivosExclusion: hojas NO leídas con motivo; hojas LEÍDAS → motivo null (se limpia)", () => {
  assert.deepEqual(motivosExclusion(RUTAS), [
    { ruta: "Objetos.Recibo.X.IBAN", motivo: "bancario" },
    { ruta: "Objetos.Recibo.X.Sexo", motivo: "persona" },
    { ruta: "Objetos.Recibo.X.Leida", motivo: null },
  ]);
});
