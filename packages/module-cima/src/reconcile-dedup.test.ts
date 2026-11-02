// PORT central (fase 1): bloques LOO-760 y LOO-805 de `pull-deps.test.ts` del CRM,
// copiados literal. `classifyConfirmarDescargaAck` (ACK HTTP del adaptador) y
// `seguirFusionHastaSuperviviente` (BD) se portan con la capa de BD/red (fase 2).
import assert from "node:assert/strict";
import test from "node:test";

import {
  computeDedupSets,
  computeReconcileExclusions,
  type DedupLedgerRow,
  type ReconcileLedgerRow,
} from "./reconcile-dedup.ts";

// ─── LOO-760 — computeReconcileExclusions (qué se resta del dedup) ───────────
// El modo RECONCILE re-saca de la cuarentena los SIN/REC/POL en `review`/`review_salud`
// con `confirmado_at IS NULL` (siguen en la cola perpetua de TIREA). POL entró en
// LOO-807: también cae a review por gap del clasificador (fixeable por código).
// PURO: lista de filas del ledger → sets de nombres+hashes a EXCLUIR del dedup.

function row(over: Partial<ReconcileLedgerRow> = {}): ReconcileLedgerRow {
  return {
    nombreFichero: "F-SIN-1.zip",
    xmlHash: "hash-sin-1",
    estado: "review",
    tipoObjeto: "SIN",
    confirmadoAt: null,
    ...over,
  };
}

// (a) un review SIN/REC con confirmado_at null SÍ se resta del dedup.
test("computeReconcileExclusions: review SIN confirmado_at null → excluido (re-procesa)", () => {
  const { nombres, hashes } = computeReconcileExclusions([row()]);
  assert.ok(nombres.has("F-SIN-1.zip"));
  assert.ok(hashes.has("hash-sin-1"));
});

test("computeReconcileExclusions: review REC confirmado_at null → excluido (re-procesa)", () => {
  const { nombres, hashes } = computeReconcileExclusions([
    row({ nombreFichero: "F-REC-1.zip", xmlHash: "hash-rec-1", tipoObjeto: "REC" }),
  ]);
  assert.ok(nombres.has("F-REC-1.zip"));
  assert.ok(hashes.has("hash-rec-1"));
});

test("computeReconcileExclusions: review_salud SIN confirmado_at null → excluido", () => {
  const { nombres } = computeReconcileExclusions([row({ estado: "review_salud" })]);
  assert.ok(nombres.has("F-SIN-1.zip"));
});

// (b) NO se re-procesan confirmed / persisted / error (estados fuera de cuarentena).
test("computeReconcileExclusions: confirmed/persisted/error NO se excluyen (no re-procesa)", () => {
  const { nombres, hashes } = computeReconcileExclusions([
    row({ nombreFichero: "C.zip", estado: "confirmed" }),
    row({ nombreFichero: "P.zip", estado: "persisted" }),
    row({ nombreFichero: "E.zip", estado: "error" }),
    row({ nombreFichero: "D.zip", estado: "deferred" }),
  ]);
  assert.equal(nombres.size, 0);
  assert.equal(hashes.size, 0);
});

// review pero ya dequeuado (confirmado_at != null) → irrecuperable por re-pull → NO se resta.
test("computeReconcileExclusions: review con confirmado_at != null NO se excluye (ya dequeuado)", () => {
  const { nombres } = computeReconcileExclusions([
    row({ confirmadoAt: new Date("2026-06-01T00:00:00Z") }),
  ]);
  assert.equal(nombres.size, 0);
});

// LOO-807 — POL en review también puede ser gap del clasificador (RiesgoComercios,
// Occident C0468): con confirmado_at NULL sigue en la cola perpetua de TIREA →
// un reconcile tras el fix del mapper lo re-clasifica. Idempotente para los POL
// genuinamente ambiguos/Art.14 (vuelven a review sin escrituras).
test("computeReconcileExclusions: POL review confirmado_at null SÍ se excluye (LOO-807)", () => {
  const { nombres, hashes } = computeReconcileExclusions([
    row({ nombreFichero: "F-POL.zip", xmlHash: "hash-pol-1", tipoObjeto: "POL" }),
  ]);
  assert.ok(nombres.has("F-POL.zip"));
  assert.ok(hashes.has("hash-pol-1"));
});

// LOO-807 review — el criterio del DRAIN y el de la ETIQUETA se desacoplan: un POL
// en `review_salud` SÍ sigue entrando al drain (un fichero MIXTO salud+comercio con
// 0 persistidas queda en review_salud y el reconcile recupera su parte no-salud),
// aunque `esRecuperablePorReconcile` lo etiquete `requiere_accion` (Art.9, decisión
// humana; ver quarantine-recovery.ts).
test("computeReconcileExclusions: POL review_salud confirmado_at null SÍ se excluye (drain re-entrega)", () => {
  const { nombres } = computeReconcileExclusions([
    row({ nombreFichero: "F-POL-SALUD.zip", tipoObjeto: "POL", estado: "review_salud" }),
  ]);
  assert.ok(nombres.has("F-POL-SALUD.zip"));
});

// POL review pero ya dequeuado de TIREA → irrecuperable por re-pull → NO se resta.
test("computeReconcileExclusions: POL review confirmado_at != null NO se excluye", () => {
  const { nombres } = computeReconcileExclusions([
    row({ nombreFichero: "F-POL.zip", tipoObjeto: "POL", confirmadoAt: new Date() }),
  ]);
  assert.equal(nombres.size, 0);
});

// xml_hash null (review sin hash computable) → solo se resta el nombre, no rompe hashes.
test("computeReconcileExclusions: review SIN sin xml_hash → resta nombre, no hash", () => {
  const { nombres, hashes } = computeReconcileExclusions([row({ xmlHash: null })]);
  assert.ok(nombres.has("F-SIN-1.zip"));
  assert.equal(hashes.size, 0);
});

// (e) Mix realista: solo los review SIN/REC/POL con confirmado_at null entran.
test("computeReconcileExclusions: mix → solo review SIN/REC/POL confirmado_at null", () => {
  const { nombres } = computeReconcileExclusions([
    row({ nombreFichero: "sin-recuperable.zip", tipoObjeto: "SIN" }), // ✓
    row({ nombreFichero: "rec-recuperable.zip", tipoObjeto: "REC" }), // ✓
    row({ nombreFichero: "pol-review.zip", tipoObjeto: "POL" }), // ✓ LOO-807
    row({ nombreFichero: "sin-dequeuado.zip", confirmadoAt: new Date() }), // ✗ ya fuera de cola
    row({ nombreFichero: "cef-review.zip", tipoObjeto: "CEF" }), // ✗ tipo fuera del reconcile
    row({ nombreFichero: "sin-confirmed.zip", estado: "confirmed" }), // ✗ resuelto
    row({ nombreFichero: "sin-error.zip", estado: "error" }), // ✗ fuera de cuarentena
  ]);
  assert.deepEqual(
    [...nombres].sort(),
    ["pol-review.zip", "rec-recuperable.zip", "sin-recuperable.zip"],
  );
});

// ─── LOO-805 — computeDedupSets (fix pérdida silenciosa por dedup) ────────────
// INVARIANTE: seenHashes y seenNombres son SIMÉTRICOS respecto a `error`. Un fichero
// `error` (0 pólizas persistidas, xml_hash NON-NULL) NO debe bloquear el dedup: su
// nombre se re-descarga (no entra en seenNombres, LOO-746) y su hash NO entra en
// seenHashes → el re-fetch RE-PROCESA en vez de confirmar+dequeue sin persistir (la
// pérdida silenciosa que ocurrió en prod 2026-06-23, C0468).

const NO_EXCL = { nombres: new Set<string>(), hashes: new Set<string>() };

function drow(over: Partial<DedupLedgerRow> = {}): DedupLedgerRow {
  return { nombreFichero: "F.zip", xmlHash: "h", estado: "confirmed", ...over };
}

// (BUG) un fichero `error` NO entra ni en seenHashes ni en seenNombres → re-procesable.
test("computeDedupSets: fichero error NO bloquea dedup (hash fuera de seenHashes, nombre fuera de seenNombres)", () => {
  const { seenHashes, seenNombres, confirmedHashes } = computeDedupSets(
    [drow({ nombreFichero: "E.zip", xmlHash: "hash-error", estado: "error" })],
    NO_EXCL,
  );
  assert.equal(seenHashes.has("hash-error"), false, "error NO debe bloquear el dedup de contenido");
  assert.equal(seenNombres.has("E.zip"), false, "error debe poder re-descargarse (re-procesar)");
  assert.equal(confirmedHashes.has("hash-error"), false);
});

// (REGRESIÓN C0468) error no marca su contenido como visto → el re-fetch RE-PROCESA en
// vez de caer al duplicate-path que haría confirm()+dequeue de TIREA sin persistir.
test("computeDedupSets: error no marca su contenido como visto → re-fetch RE-PROCESA (escenario C0468)", () => {
  const { seenHashes } = computeDedupSets(
    [drow({ nombreFichero: "C0468-error.zip", xmlHash: "occ-hash", estado: "error" })],
    NO_EXCL,
  );
  // isDuplicateXmlHash(occ-hash) === seenHashes.has(occ-hash) === false → NO duplicate-path.
  assert.equal(seenHashes.has("occ-hash"), false);
});

// confirmed/persisted/deferred/review/review_salud SÍ pueblan seenHashes (contenido contabilizado).
test("computeDedupSets: confirmed/persisted/deferred/review/review_salud SÍ entran en seenHashes", () => {
  const { seenHashes } = computeDedupSets(
    [
      drow({ nombreFichero: "C.zip", xmlHash: "h-conf", estado: "confirmed" }),
      drow({ nombreFichero: "P.zip", xmlHash: "h-pers", estado: "persisted" }),
      drow({ nombreFichero: "D.zip", xmlHash: "h-def", estado: "deferred" }),
      drow({ nombreFichero: "R.zip", xmlHash: "h-rev", estado: "review" }),
      drow({ nombreFichero: "S.zip", xmlHash: "h-revs", estado: "review_salud" }),
    ],
    NO_EXCL,
  );
  assert.deepEqual([...seenHashes].sort(), ["h-conf", "h-def", "h-pers", "h-rev", "h-revs"]);
});

// confirmedHashes = SOLO los confirmed (LOO-700: saltar el re-ACK inútil de duplicados).
test("computeDedupSets: confirmedHashes contiene solo los confirmed", () => {
  const { confirmedHashes } = computeDedupSets(
    [
      drow({ xmlHash: "h-conf", estado: "confirmed" }),
      drow({ xmlHash: "h-pers", estado: "persisted" }),
      drow({ xmlHash: "h-def", estado: "deferred" }),
    ],
    NO_EXCL,
  );
  assert.deepEqual([...confirmedHashes], ["h-conf"]);
});

// seenNombres incluye todos los estados salvo error (LOO-746: el cron re-descarga los error).
test("computeDedupSets: seenNombres incluye todos los estados salvo error", () => {
  const { seenNombres } = computeDedupSets(
    [
      drow({ nombreFichero: "C.zip", estado: "confirmed" }),
      drow({ nombreFichero: "P.zip", estado: "persisted" }),
      drow({ nombreFichero: "R.zip", estado: "review" }),
      drow({ nombreFichero: "E.zip", estado: "error" }),
    ],
    NO_EXCL,
  );
  assert.deepEqual([...seenNombres].sort(), ["C.zip", "P.zip", "R.zip"]);
});

// xml_hash null → no entra en seenHashes; el nombre sí (si no es error).
test("computeDedupSets: xml_hash null no entra en seenHashes pero el nombre sí (no-error)", () => {
  const { seenHashes, seenNombres } = computeDedupSets(
    [drow({ nombreFichero: "N.zip", xmlHash: null, estado: "review" })],
    NO_EXCL,
  );
  assert.equal(seenHashes.size, 0);
  assert.ok(seenNombres.has("N.zip"));
});

// reconcile (LOO-760): las exclusiones restan de AMBOS sets.
test("computeDedupSets: exclusions del reconcile restan de seenHashes y seenNombres", () => {
  const { seenHashes, seenNombres } = computeDedupSets(
    [drow({ nombreFichero: "SIN.zip", xmlHash: "h-sin", estado: "review" })],
    { nombres: new Set(["SIN.zip"]), hashes: new Set(["h-sin"]) },
  );
  assert.equal(seenHashes.has("h-sin"), false);
  assert.equal(seenNombres.has("SIN.zip"), false);
});

// Mix realista: confirmed cuenta en ambos; error fuera de ambos; review cuenta en hashes.
test("computeDedupSets: mix realista (confirmed cuenta, error fuera de ambos)", () => {
  const { seenHashes, seenNombres, confirmedHashes } = computeDedupSets(
    [
      drow({ nombreFichero: "ok.zip", xmlHash: "h-ok", estado: "confirmed" }),
      drow({ nombreFichero: "err.zip", xmlHash: "h-err", estado: "error" }),
      drow({ nombreFichero: "rev.zip", xmlHash: "h-rev", estado: "review" }),
    ],
    NO_EXCL,
  );
  assert.deepEqual([...seenHashes].sort(), ["h-ok", "h-rev"]);
  assert.deepEqual([...seenNombres].sort(), ["ok.zip", "rev.zip"]);
  assert.deepEqual([...confirmedHashes], ["h-ok"]);
});

