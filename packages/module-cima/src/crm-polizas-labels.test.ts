import assert from "node:assert/strict";
import test from "node:test";

import { CIMA_DGS_CARRIERS, nombreCarrierCima } from "./crm-polizas-labels.ts";

test("guardián CRM — nombreCarrierCima: códigos DGS reales (C0058 = Mapfre, C0109 = Allianz)", () => {
  assert.equal(nombreCarrierCima("C0058"), "Mapfre");
  assert.equal(nombreCarrierCima("C0109"), "Allianz");
  assert.equal(nombreCarrierCima("C0468"), "Occident");
  assert.equal(CIMA_DGS_CARRIERS.C0072, "Generali");
});

test("nombreCarrierCima: normaliza espacios/minúsculas; no mapeado o vacío → null", () => {
  assert.equal(nombreCarrierCima("  c0058 "), "Mapfre");
  assert.equal(nombreCarrierCima("C9999"), null);
  assert.equal(nombreCarrierCima(null), null);
  assert.equal(nombreCarrierCima(""), null);
});
