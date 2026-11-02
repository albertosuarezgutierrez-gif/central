import assert from "node:assert/strict";
import { test } from "node:test";

import { ficheroTotalmenteResuelto } from "./fichero-resuelto.ts";

const cero = {
  polizasCount: 0,
  polizasPersisted: 0,
  siniestrosCount: 0,
  siniestrosPersisted: 0,
  recibosCount: 0,
  recibosPersisted: 0,
  cuentasCount: 0,
  cuentasPersisted: 0,
};

test("REC 1/2 (caso 03/10/2026) → no resuelto", () => {
  assert.equal(ficheroTotalmenteResuelto({ ...cero, recibosCount: 2, recibosPersisted: 1 }), false);
});
test("REC 2/2 → resuelto", () => {
  assert.equal(ficheroTotalmenteResuelto({ ...cero, recibosCount: 2, recibosPersisted: 2 }), true);
});
test("POL 44/44 → resuelto", () => {
  assert.equal(ficheroTotalmenteResuelto({ ...cero, polizasCount: 44, polizasPersisted: 44 }), true);
});
test("POL 40/44 → no resuelto", () => {
  assert.equal(ficheroTotalmenteResuelto({ ...cero, polizasCount: 44, polizasPersisted: 40 }), false);
});
test("SIN con 1 en review → no resuelto", () => {
  assert.equal(ficheroTotalmenteResuelto({ ...cero, siniestrosCount: 3, siniestrosPersisted: 2 }), false);
});
test("SIN 3/3 → resuelto; CEF 1/2 → no; CEF 2/2 → sí", () => {
  assert.equal(ficheroTotalmenteResuelto({ ...cero, siniestrosCount: 3, siniestrosPersisted: 3 }), true);
  assert.equal(ficheroTotalmenteResuelto({ ...cero, cuentasCount: 2, cuentasPersisted: 1 }), false);
  assert.equal(ficheroTotalmenteResuelto({ ...cero, cuentasCount: 2, cuentasPersisted: 2 }), true);
});
test("mixto: un tipo completo y otro incompleto → no resuelto", () => {
  assert.equal(
    ficheroTotalmenteResuelto({ ...cero, polizasCount: 2, polizasPersisted: 2, recibosCount: 2, recibosPersisted: 1 }),
    false,
  );
});
test("fichero sin ningún objeto (todo 0) → no resuelto (conservador)", () => {
  assert.equal(ficheroTotalmenteResuelto(cero), false);
});
