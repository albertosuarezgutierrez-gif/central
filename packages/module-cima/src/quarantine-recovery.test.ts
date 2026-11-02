import assert from "node:assert/strict";
import { test } from "node:test";

import {
  esRecuperablePorReconcile,
  recuperabilidadTone,
  type FicheroCuarentenaRow,
} from "./quarantine-recovery.ts";

const base: FicheroCuarentenaRow = {
  nombreFichero: "EIAC_X.zip",
  xmlHash: "abc",
  estado: "review",
  tipoObjeto: "SIN",
  confirmadoAt: null,
  tienePoliza: false,
};

test("SIN en review sin confirmar → recuperable", () => {
  assert.equal(esRecuperablePorReconcile(base), "recuperable");
});

test("REC en review_salud sin confirmar → recuperable", () => {
  assert.equal(
    esRecuperablePorReconcile({
      ...base,
      tipoObjeto: "REC",
      estado: "review_salud",
    }),
    "recuperable",
  );
});

// LOO-807 — POL en review también puede ser gap del clasificador (RiesgoComercios,
// Occident C0468): sin confirmar sigue en la cola de TIREA → el reconcile lo re-saca.
test("POL en review sin confirmar → recuperable (LOO-807)", () => {
  assert.equal(
    esRecuperablePorReconcile({ ...base, tipoObjeto: "POL" }),
    "recuperable",
  );
});

// LOO-807 review — DESACOPLE etiqueta vs drain: un POL en `review_salud` es Art.9.
// mapEiacPol SIEMPRE devuelve `review_salud` para RiesgoSalud → un POL 100% salud
// entra en bucle perpetuo (cada drain lo re-entrega y vuelve a review_salud con 0
// persistidas): el reconcile NUNCA lo resuelve solo, exige decisión humana/DPO.
// La etiqueta (badge /salud-cima + conteo `requiere_accion` de cima-health-alert,
// LOO-826 B1) NO debe silenciarlo, aunque el drain SÍ lo re-entregue (mixtos
// salud+comercio recuperan su parte no-salud; sobre-alertar mixtos es el fallo
// en dirección segura).
test("POL en review_salud sin confirmar → requiere_accion (Art.9; el drain sí lo re-entrega)", () => {
  assert.equal(
    esRecuperablePorReconcile({
      ...base,
      tipoObjeto: "POL",
      estado: "review_salud",
    }),
    "requiere_accion",
  );
});

// El carve-out es SOLO POL: un SIN en review_salud sigue siendo re-matcheable.
test("SIN en review_salud sin confirmar → recuperable (carve-out solo aplica a POL)", () => {
  assert.equal(
    esRecuperablePorReconcile({ ...base, estado: "review_salud" }),
    "recuperable",
  );
});

test("POL en review ya confirmado → requiere_accion (dequeuado, irrecuperable por re-pull)", () => {
  assert.equal(
    esRecuperablePorReconcile({
      ...base,
      tipoObjeto: "POL",
      confirmadoAt: new Date(),
    }),
    "requiere_accion",
  );
});

test("SIN confirmado con póliza vinculada → requiere_accion (ya matcheó, dequeuado)", () => {
  assert.equal(
    esRecuperablePorReconcile({
      ...base,
      confirmadoAt: new Date(),
      tienePoliza: true,
    }),
    "requiere_accion",
  );
});

test("SIN confirmado sin póliza (dequeuado, nada que matchear) → out_of_cartera", () => {
  assert.equal(
    esRecuperablePorReconcile({
      ...base,
      confirmadoAt: new Date(),
      tienePoliza: false,
    }),
    "out_of_cartera",
  );
});

// LOO-807 — confirmadoAt != null para que el criterio del reconcile no lo capture
// antes: lo que se fija aquí es que POL NUNCA cae a out_of_cartera (un POL es la
// póliza misma, no un objeto que matchear contra cartera) → revisión humana.
test("POL sin póliza → requiere_accion (POL nunca es out_of_cartera; revisión humana)", () => {
  assert.equal(
    esRecuperablePorReconcile({
      ...base,
      tipoObjeto: "POL",
      confirmadoAt: new Date(),
      tienePoliza: false,
    }),
    "requiere_accion",
  );
});

test("recuperabilidadTone mapea los 3 valores", () => {
  assert.equal(recuperabilidadTone("recuperable"), "success");
  assert.equal(recuperabilidadTone("requiere_accion"), "warning");
  assert.equal(recuperabilidadTone("out_of_cartera"), "neutral");
});
