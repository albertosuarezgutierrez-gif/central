/**
 * `codigoDgsDe` / `codigoEntidadFormatoDesconocido` — las dos formas de
 * `CodigoEntidad` que conviven desde el 16/11/2026 (EIAC 6.0 objeto, 7.1 texto).
 * Un brazo por aserción.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { codigoDgsDe, codigoEntidadFormatoDesconocido } from "./codigo-entidad.ts";

test("V06: objeto con CodigoDGS → su CodigoDGS recortado (sin tocar mayúsculas, como antes)", () => {
  assert.equal(codigoDgsDe({ CodigoInterno: "5", CodigoDGS: "C0468" }), "C0468");
  assert.equal(codigoDgsDe({ CodigoDGS: "  C0058 " }), "C0058");
  assert.equal(codigoDgsDe({ CodigoDGS: "m0083" }), "m0083", "el que llama decide si pasa a mayúsculas");
});

test("V06: objeto sin CodigoDGS (o vacío) → null", () => {
  assert.equal(codigoDgsDe({ CodigoInterno: "5" }), null);
  assert.equal(codigoDgsDe({ CodigoDGS: "" }), null);
});

test("V07.1: texto [A-Z]\\d{4} → normalizado (trim + mayúsculas)", () => {
  assert.equal(codigoDgsDe("C0001"), "C0001");
  assert.equal(codigoDgsDe("  c0109\n"), "C0109");
});

test("V07.1: texto con otra forma → null (nunca se inventa)", () => {
  assert.equal(codigoDgsDe("C001"), null);
  assert.equal(codigoDgsDe("C00011"), null);
  assert.equal(codigoDgsDe("0001"), null);
  assert.equal(codigoDgsDe("ALLIANZ"), null);
  assert.equal(codigoDgsDe(""), null);
});

test("otras formas → null", () => {
  assert.equal(codigoDgsDe(undefined), null);
  assert.equal(codigoDgsDe(null), null);
  assert.equal(codigoDgsDe(1), null);
  assert.equal(codigoDgsDe(["C0001", "C0002"]), null);
});

test("formato desconocido: SOLO cuando vino algo que no sabemos leer", () => {
  assert.equal(codigoEntidadFormatoDesconocido("ALLIANZ"), true);
  assert.equal(codigoEntidadFormatoDesconocido(1), true);
  assert.equal(codigoEntidadFormatoDesconocido(["C0001", "C0002"]), true);
});

test("formato desconocido: «falta» y formas válidas NO lo son", () => {
  assert.equal(codigoEntidadFormatoDesconocido(undefined), false, "ausente = falta");
  assert.equal(codigoEntidadFormatoDesconocido(null), false, "null = falta");
  assert.equal(codigoEntidadFormatoDesconocido("  "), false, "vacío = falta");
  assert.equal(codigoEntidadFormatoDesconocido({ CodigoInterno: "5" }), false, "objeto V06 sin DGS = falta");
  assert.equal(codigoEntidadFormatoDesconocido("C0001"), false, "V07.1 válido");
  assert.equal(codigoEntidadFormatoDesconocido({ CodigoDGS: "C0058" }), false, "V06 válido");
});

test("nodo con atributos `{ \"#text\": \"C0001\" }` → se lee como el texto V07.1", () => {
  assert.equal(codigoDgsDe({ "#text": " c0001 ", "@_version": "7.1" }), "C0001");
});

test("nodo con atributos legible → NO es formato desconocido", () => {
  assert.equal(codigoEntidadFormatoDesconocido({ "#text": "C0001" }), false);
});

test("nodo con atributos ilegible → formato desconocido, nunca «falta»", () => {
  assert.equal(codigoEntidadFormatoDesconocido({ "#text": "C001" }), true);
});
