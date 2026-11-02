import assert from "node:assert/strict";
import test from "node:test";

import { provinciaPorCp } from "./crm-provincia-por-cp.ts";

test("LOO-855 — provinciaPorCp: CP de 5 dígitos resuelve por los 2 primeros", () => {
  assert.equal(provinciaPorCp("28001"), "Madrid");
  assert.equal(provinciaPorCp("08015"), "Barcelona");
  assert.equal(provinciaPorCp("41003"), "Sevilla");
  assert.equal(provinciaPorCp("01001"), "Álava");
  assert.equal(provinciaPorCp("52001"), "Melilla");
});

test("LOO-855 — provinciaPorCp: acepta prefijo de 2 dígitos y espacios", () => {
  assert.equal(provinciaPorCp("46"), "Valencia");
  assert.equal(provinciaPorCp("  28001  "), "Madrid");
});

test("LOO-855 — provinciaPorCp: prefijo fuera de rango → null", () => {
  assert.equal(provinciaPorCp("00123"), null);
  assert.equal(provinciaPorCp("53001"), null);
  assert.equal(provinciaPorCp("99999"), null);
});

test("LOO-855 — provinciaPorCp: entradas no numéricas / vacías → null", () => {
  assert.equal(provinciaPorCp(""), null);
  assert.equal(provinciaPorCp(null), null);
  assert.equal(provinciaPorCp(undefined), null);
  assert.equal(provinciaPorCp("2"), null); // 1 dígito insuficiente
  assert.equal(provinciaPorCp("2A"), null);
  assert.equal(provinciaPorCp("ES28001"), null);
});

test("guardián CRM — provinciaPorCp: CP 07xxx → exactamente «Islas Baleares»", () => {
  assert.equal(provinciaPorCp("07001"), "Islas Baleares");
  assert.equal(provinciaPorCp("07"), "Islas Baleares");
});
