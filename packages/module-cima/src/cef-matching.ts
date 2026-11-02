/**
 * LOO-757 (épica CIMA LOO-515) — Matching PURO best-effort de un MOVIMIENTO de
 * liquidación CEF contra el recibo y la póliza que lo originaron. A diferencia del
 * SIN/REC (donde sin match = CUARENTENA porque la FK es NOT NULL), aquí el match es
 * **best-effort y la FK es NULLABLE**: el registro financiero se guarda igual aunque
 * NO matchee (NO hay cuarentena). Las FK solo enriquecen la trazabilidad (link a
 * recibo/póliza en la vista de finanzas).
 *
 * - recibo: por `IdRecibo` + `CodigoEntidad/CodigoDGS` → `poliza_recibos.id` (reusa la
 *   misma clave de negocio que el upsert de recibos, LOO-753).
 * - póliza: por `IdPoliza` normalizado + `CodigoEntidad/CodigoDGS` → `polizas.id`
 *   (misma lógica que `matchReciboPoliza`).
 *
 * PURO: sin BD, sin red. El caller (pull-deps) carga los candidatos del tenant y
 * construye los índices; estos helpers solo resuelven.
 */

import {
  DGS_TOLERA_CEROS,
  normalizePolizaNumber,
  numeroSinCerosIzquierda,
  unicaCarteraViva,
} from "./poliza-matching.ts";

/** Candidato de recibo para el matching (cargado por el caller, ya filtrado por tenant). */
export interface ReciboCandidate {
  reciboId: string;
  idRecibo: string | null;
  codigoEntidadDgs: string | null;
}

/** Candidato de póliza para el matching (cargado por el caller, ya filtrado por tenant). */
export interface CefPolizaCandidate {
  polizaId: string;
  numeroPoliza: string | null;
  codigoEntidadDgs: string | null;
  /** Cartera viva: desempata una clave con ≥2 pólizas (ver `unicaCarteraViva`). */
  carteraViva?: boolean;
}

/** Normaliza el código DGS (trim + uppercase). null/'' → null. */
function normCodigoDgs(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return t === "" ? null : t;
}

/** Clave de índice compuesta (idRecibo|dgs). null si falta cualquiera de las dos. */
function reciboKey(
  idRecibo: string | null | undefined,
  dgs: string | null | undefined,
): string | null {
  const r = (idRecibo ?? "").trim();
  const d = normCodigoDgs(dgs);
  if (!r || !d) return null;
  return `${r}|${d}`;
}

/** Clave de índice compuesta (numeroPolizaNormalizado|dgs). null si falta cualquiera. */
function polizaKey(
  numero: string | null | undefined,
  dgs: string | null | undefined,
): string | null {
  const n = normalizePolizaNumber(numero ?? null);
  const d = normCodigoDgs(dgs);
  if (!n || !d) return null;
  return `${n}|${d}`;
}

/**
 * Clave de respaldo SIN ceros iniciales (`~sc|numero|dgs`), solo para entidades de
 * `DGS_TOLERA_CEROS`. El prefijo `~sc|` no puede chocar con una clave exacta
 * (`numero|dgs`: el número normalizado es alfanumérico).
 */
function polizaKeySinCeros(
  numero: string | null | undefined,
  dgs: string | null | undefined,
): string | null {
  const d = normCodigoDgs(dgs);
  if (!d || !DGS_TOLERA_CEROS.has(d)) return null;
  const n = numeroSinCerosIzquierda(numero ?? null);
  return n ? `~sc|${n}|${d}` : null;
}

/**
 * Índice recibo: clave `${idRecibo}|${dgs}` → `reciboId`. Si dos candidatos comparten
 * clave (no debería: la uq de negocio lo impide), el último gana (irrelevante para el
 * best-effort). Candidatos con clave incompleta se omiten.
 */
export function buildReciboIndex(
  candidates: readonly ReciboCandidate[],
): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of candidates) {
    const k = reciboKey(c.idRecibo, c.codigoEntidadDgs);
    if (k) idx.set(k, c.reciboId);
  }
  return idx;
}

/**
 * Índice póliza: clave `${numeroNormalizado}|${dgs}` → `polizaId`. Si dos pólizas
 * comparten clave (numero+dgs ambiguo), NO se indexa (no colgar a ciegas, igual que el
 * matcher único del REC). Candidatos con clave incompleta se omiten.
 */
export function buildPolizaIndex(
  candidates: readonly CefPolizaCandidate[],
): Map<string, string | null> {
  // Agrupa por clave; una clave con ≥2 pólizas distintas es ambigua → gana la
  // ÚNICA de cartera viva si la hay, si no null (no matchear a ciegas).
  const grupos = new Map<string, CefPolizaCandidate[]>();
  for (const c of candidates) {
    const k = polizaKey(c.numeroPoliza, c.codigoEntidadDgs);
    if (!k) continue;
    const g = grupos.get(k) ?? [];
    if (!g.some((x) => x.polizaId === c.polizaId)) g.push(c);
    grupos.set(k, g);
  }
  const idx = new Map<string, string | null>();
  for (const [k, g] of grupos) {
    idx.set(k, g.length === 1 ? g[0].polizaId : (unicaCarteraViva(g)?.polizaId ?? null));
  }
  // Respaldo sin ceros (Allianz C0109): mismas reglas que la clave exacta sobre las
  // pólizas distintas que comparten el número sin ceros (≥2 → solo gana la única viva).
  const gruposSc = new Map<string, CefPolizaCandidate[]>();
  for (const c of candidates) {
    const k = polizaKeySinCeros(c.numeroPoliza, c.codigoEntidadDgs);
    if (!k) continue;
    const g = gruposSc.get(k) ?? [];
    if (!g.some((x) => x.polizaId === c.polizaId)) g.push(c);
    gruposSc.set(k, g);
  }
  for (const [k, g] of gruposSc) {
    idx.set(k, g.length === 1 ? g[0].polizaId : (unicaCarteraViva(g)?.polizaId ?? null));
  }
  return idx;
}

/** Resuelve el `reciboId` de un movimiento (best-effort). null si no hay match. */
export function matchMovimientoRecibo(
  idReciboEiac: string | null,
  codigoEntidadDgs: string | null,
  index: Map<string, string>,
): string | null {
  const k = reciboKey(idReciboEiac, codigoEntidadDgs);
  if (!k) return null;
  return index.get(k) ?? null;
}

/** Resuelve el `polizaId` de un movimiento (best-effort). null si no hay match/ambiguo. */
export function matchMovimientoPoliza(
  idPolizaEntidad: string | null,
  codigoEntidadDgs: string | null,
  index: Map<string, string | null>,
): string | null {
  const k = polizaKey(idPolizaEntidad, codigoEntidadDgs);
  if (!k) return null;
  // La clave exacta manda: si existe (aunque sea ambigua → null) no se reintenta.
  if (index.has(k)) return index.get(k) ?? null;
  const sc = polizaKeySinCeros(idPolizaEntidad, codigoEntidadDgs);
  return sc ? (index.get(sc) ?? null) : null;
}
