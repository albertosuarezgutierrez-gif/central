/**
 * PORT central (fase 1): lógica PURA del dedup/reconcile del pull, extraída LITERAL
 * de `pull-deps.ts` del CRM (líneas de `RECONCILE_TIPOS` a `computeDedupSets`). En el
 * CRM viven dentro de `pull-deps.ts` (capa de BD); aquí se separan para que
 * `quarantine-recovery.ts` no arrastre la BD. Cuando se porte `pull-deps` (fase 2)
 * debe IMPORTAR estas funciones de aquí, no redefinirlas.
 */

/**
 * LOO-760 — Tipos de objeto EIAC recuperables por el modo RECONCILE. SIN/REC
 * cuelgan de una póliza (FK NOT NULL) y caen a `review` por timing (su POL se
 * procesó después): re-matchear contra la cartera ACTUAL los recupera.
 * LOO-807 — POL también entra: un POL puede caer a `review` por gap del
 * CLASIFICADOR (Occident C0468 emite `RiesgoComercios` en plural), causa que un
 * fix de código hace recuperable. Con `confirmado_at IS NULL` sigue en la cola
 * perpetua de TIREA → un reconcile tras deployar el fix del mapper lo
 * re-clasifica y persiste. Idempotente para los POL genuinamente ambiguos/Art.14
 * (re-caen a review sin escrituras).
 * OJO: el criterio del DRAIN (este) y el de la ETIQUETA/alerta NO son el mismo —
 * un POL en `review_salud` SÍ entra al drain (un mixto salud+comercio recupera su
 * parte no-salud) pero se etiqueta `requiere_accion` (Art.9, el reconcile nunca lo
 * resuelve solo; carve-out en quarantine-recovery.ts).
 */
const RECONCILE_TIPOS = new Set<string>(["SIN", "REC", "POL"]);

/** LOO-760 — Estados de cuarentena de los que el reconcile re-saca un fichero. Un
 * fichero `confirmed`/`persisted`/`deferred`/`error` NO se re-procesa (resuelto,
 * dequeuado o de causa distinta). */
const RECONCILE_ESTADOS_QUARANTINE = new Set<string>(["review", "review_salud"]);

/** Fila mínima del ledger que el cálculo de exclusiones del reconcile necesita. */
export interface ReconcileLedgerRow {
  nombreFichero: string;
  xmlHash: string | null;
  estado: string;
  tipoObjeto: string;
  confirmadoAt: Date | null;
}

/**
 * LOO-760 — PURO (sin BD): de las filas del ledger, devuelve los nombres y hashes a
 * EXCLUIR del dedup en modo reconcile → así esos ficheros NO se tratan como "ya
 * vistos" y vuelven a entrar al pipeline para re-matchearse contra la cartera
 * actual. Criterio (los 3 a la vez):
 *   - tipo SIN/REC/POL (LOO-807: POL review por gap de clasificador también se recupera),
 *   - estado `review`/`review_salud` (cuarentena, no resuelto),
 *   - `confirmado_at IS NULL` (sigue en la cola perpetua de TIREA → un re-pull lo
 *     re-entrega; los `confirmado_at != null` ya están dequeuados, irrecuperables
 *     por re-pull).
 * Idempotente: si un excluido sigue sin matchear, el pipeline lo deja en review
 * otra vez (sin daño).
 */
export function computeReconcileExclusions(rows: readonly ReconcileLedgerRow[]): {
  nombres: Set<string>;
  hashes: Set<string>;
} {
  const nombres = new Set<string>();
  const hashes = new Set<string>();
  for (const r of rows) {
    if (
      RECONCILE_TIPOS.has(r.tipoObjeto) &&
      RECONCILE_ESTADOS_QUARANTINE.has(r.estado) &&
      r.confirmadoAt == null
    ) {
      nombres.add(r.nombreFichero);
      if (r.xmlHash) hashes.add(r.xmlHash);
    }
  }
  return { nombres, hashes };
}

/** LOO-805 — Estado de fichero que NO persistió contenido y ES re-descargable, por lo
 * que NO debe poblar el dedup de CONTENIDO (`seenHashes`). Un fichero `error` graba
 * `xml_hash` NON-NULL pero su nombre SÍ se re-descarga (no entra en `seenNombres`, por
 * diseño LOO-746: reintento). `seenHashes` y `seenNombres` deben ser SIMÉTRICOS respecto
 * a este estado. */
const ESTADO_NO_PERSISTIDO_REPROCESABLE = "error";

/** Fila mínima del ledger que el cálculo de los sets de dedup necesita. */
export interface DedupLedgerRow {
  nombreFichero: string;
  xmlHash: string | null;
  estado: string;
}

/**
 * LOO-805 — PURO (sin BD): construye los 3 sets de deduplicación del pull a partir de
 * las filas del ledger y de las exclusiones del reconcile.
 *
 *  - `seenHashes` (dedup de CONTENIDO, lo lee `isDuplicateXmlHash`): hashes ya
 *    contabilizados → un re-pull del MISMO contenido NO se re-persiste.
 *  - `confirmedHashes` (LOO-700): subconjunto ya `confirmed` → saltar el re-ACK inútil.
 *  - `seenNombres` (LOO-746): nombres ya vistos → el cron no los re-descarga al paginar.
 *
 * INVARIANTE CRÍTICO (fix pérdida silenciosa, LOO-805): `seenHashes` y `seenNombres` son
 * SIMÉTRICOS respecto a `error`. Un fichero `error` (0 pólizas persistidas) graba
 * `xml_hash` NON-NULL pero su nombre SÍ se re-descarga (reintento, LOO-746). Si su hash
 * quedara en `seenHashes`, el re-fetch caería al duplicate-path → `confirm()`+dequeue de
 * TIREA SIN persistir → dato perdido en silencio (prod 2026-06-23, C0468: 4 `error` → 4
 * `duplicate_replay` → 7 pólizas rescatadas a mano). Por eso `error` se EXCLUYE de AMBOS
 * sets: el re-fetch RE-PROCESA en vez de deduplicar.
 *
 * Estados que SÍ pueblan `seenHashes` (contenido contabilizado): `confirmed`/`persisted`
 * (persistido o dequeuado), `deferred` (en cola, intencional), `review`/`review_salud`
 * (cuarentena humana: recuperable y con el nombre NO re-descargado). Solo `error` rompe la
 * simetría → solo `error` se excluye. El reconcile (LOO-760) resta además los review
 * SIN/REC/POL vía `exclusions`.
 */
export function computeDedupSets(
  rows: readonly DedupLedgerRow[],
  exclusions: { nombres: ReadonlySet<string>; hashes: ReadonlySet<string> },
): { seenHashes: Set<string>; confirmedHashes: Set<string>; seenNombres: Set<string> } {
  const seenHashes = new Set<string>();
  const confirmedHashes = new Set<string>();
  const seenNombres = new Set<string>();
  for (const r of rows) {
    const reprocesable = r.estado === ESTADO_NO_PERSISTIDO_REPROCESABLE;
    // seenNombres: el cron salta los ya-vistos al paginar. `error` se re-descarga
    // (reintento). El reconcile resta los review SIN/REC/POL vía exclusions.nombres.
    if (!reprocesable && !exclusions.nombres.has(r.nombreFichero)) {
      seenNombres.add(r.nombreFichero);
    }
    // seenHashes: dedup de contenido. SIMÉTRICO con seenNombres en `error` (ver doc): un
    // `error` NO debe bloquear el dedup o el re-fetch lo confirmaría sin persistir.
    if (r.xmlHash && !reprocesable && !exclusions.hashes.has(r.xmlHash)) {
      seenHashes.add(r.xmlHash);
      if (r.estado === "confirmed") confirmedHashes.add(r.xmlHash);
    }
  }
  return { seenHashes, confirmedHashes, seenNombres };
}
