/**
 * LOO-753 (épica CIMA LOO-515) — Matching PURO de un recibo EIAC REC contra la
 * cartera de pólizas. Un recibo CIMA cuelga de una póliza (FK NOT NULL); hay que
 * resolver `polizaId` ANTES de persistir. Espejo de `siniestro-matching.ts`.
 *
 * Decisión operador D2/D4 (LOCKED, heredada del SIN): el lookup es por
 * `numero_poliza` normalizado (reusa `normalizePolizaNumber` del POL matching) +
 * `codigo_entidad_dgs` (la misma entidad). Resultado:
 *   - exactamente 1 candidato → `{ polizaId, clienteId }`.
 *   - 0 candidatos → `null` (sin póliza en cartera → CUARENTENA; el pipeline NO
 *     inventa la FK, registra `cima_recibo_sin_poliza_review`).
 *   - ≥2 candidatos → gana la ÚNICA de cartera viva si la hay (volcado + CIMA con
 *     el mismo número); si no, `null` (ambiguo → cuarentena; nunca colgar a ciegas).
 *
 * PURO: sin BD, sin red. El caller (pull-deps) carga los candidatos del tenant.
 */

import {
  DGS_TOLERA_CEROS,
  extractOccidentPolizaCore,
  normalizePolizaNumber,
  numeroSinCerosIzquierda,
  unicaCarteraViva,
} from "./poliza-matching.ts";

/** Candidato de póliza para el matching (cargado por el caller, ya filtrado por tenant). */
export interface ReciboPolizaCandidate {
  polizaId: string;
  clienteId: string;
  numeroPoliza: string | null;
  codigoEntidadDgs: string | null;
  /**
   * La fila es cartera viva (`esCarteraVivaFila`). Solo se usa para DESEMPATAR
   * cuando hay ≥2 candidatos; ausente = no se sabe → no puede ganar el desempate.
   */
  carteraViva?: boolean;
}

/** Lo que el matcher necesita del recibo entrante. */
export interface ReciboMatchInput {
  idPolizaEntidad: string | null;
  codigoEntidadDgs: string | null;
}

export interface ReciboMatch {
  polizaId: string;
  clienteId: string;
}

/** Candidatos de la misma entidad cuyo número, sin ceros iniciales, coincide. */
function hitsSinCeros(
  incoming: ReciboMatchInput,
  incDgs: string,
  candidates: readonly ReciboPolizaCandidate[],
): ReciboPolizaCandidate[] | null {
  if (!DGS_TOLERA_CEROS.has(incDgs)) return null;
  const incSin = numeroSinCerosIzquierda(incoming.idPolizaEntidad);
  if (!incSin) return null;
  return candidates.filter(
    (c) => numeroSinCerosIzquierda(c.numeroPoliza) === incSin && normCodigoDgs(c.codigoEntidadDgs) === incDgs,
  );
}

/** Normaliza el código DGS (trim + uppercase). null/'' → null. */
function normCodigoDgs(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return t === "" ? null : t;
}

/**
 * Resuelve la póliza de un recibo EIAC contra los candidatos del tenant. Devuelve
 * `{ polizaId, clienteId }` SOLO con match único e inequívoco; en cualquier otro
 * caso (0 / ≥2 / clave incompleta) → `null` (cuarentena, D2).
 */
export function matchReciboPoliza(
  incoming: ReciboMatchInput,
  candidates: readonly ReciboPolizaCandidate[],
): ReciboMatch | null {
  const incNumero = normalizePolizaNumber(incoming.idPolizaEntidad);
  const incDgs = normCodigoDgs(incoming.codigoEntidadDgs);
  // Sin número de póliza utilizable o sin entidad → no se puede matchear con
  // confianza → cuarentena (no inventamos la FK).
  if (!incNumero || !incDgs) return null;

  const hits = candidates.filter(
    (c) =>
      normalizePolizaNumber(c.numeroPoliza) === incNumero &&
      normCodigoDgs(c.codigoEntidadDgs) === incDgs,
  );
  if (hits.length === 1) return { polizaId: hits[0].polizaId, clienteId: hits[0].clienteId };
  if (hits.length > 1) {
    // Ambiguo: gana la ÚNICA de cartera viva (volcado + CIMA con el mismo número);
    // si no hay exactamente una → cuarentena.
    const viva = unicaCarteraViva(hits);
    return viva ? { polizaId: viva.polizaId, clienteId: viva.clienteId } : null;
  }

  // LOO-973 — 0 hits por el match exacto: Occident (C0468) numera parte de su
  // cartera como `8-D.DDD.DDD-L`, y la cartera legacy la guarda con separadores
  // distintos (`8/0DDDDDDD`, sin el prefijo "8"...). Reintenta por el núcleo
  // numérico, SOLO para C0468 y SOLO dentro de la misma entidad (menor entropía
  // que el número completo — fuera de Occident no hay evidencia de que el
  // patrón aplique, y ampliarlo a ciegas a todos los carriers solo añade
  // riesgo de colisión). Hallazgo de revisión (Graphify) el 13/09/2026: la
  // primera versión no comprobaba `incDgs === "C0468"` y se colaba para
  // cualquier entidad.
  if (incDgs !== "C0468") {
    // Allianz (C0109) y similares: reintento por número sin ceros iniciales.
    const sinCeros = hitsSinCeros(incoming, incDgs, candidates);
    if (!sinCeros || sinCeros.length === 0) return null;
    if (sinCeros.length === 1) return { polizaId: sinCeros[0].polizaId, clienteId: sinCeros[0].clienteId };
    const vivaSc = unicaCarteraViva(sinCeros);
    return vivaSc ? { polizaId: vivaSc.polizaId, clienteId: vivaSc.clienteId } : null;
  }
  const incCore = extractOccidentPolizaCore(incoming.idPolizaEntidad);
  if (!incCore) return null;
  const coreHits = candidates.filter(
    (c) =>
      extractOccidentPolizaCore(c.numeroPoliza) === incCore &&
      normCodigoDgs(c.codigoEntidadDgs) === incDgs,
  );
  if (coreHits.length === 1) return { polizaId: coreHits[0].polizaId, clienteId: coreHits[0].clienteId };
  const viva = unicaCarteraViva(coreHits);
  return viva ? { polizaId: viva.polizaId, clienteId: viva.clienteId } : null;
}

/**
 * Por qué NO hubo match (solo tiene sentido si el matcher devolvió `null`). Antes
 * las tres causas se registraban igual, como `sin_poliza_en_cartera`, y eso llevó
 * a buscar en la compañía pólizas que estaban en la cartera DOS veces.
 *  - `clave_incompleta`: falta número de póliza utilizable o código DGS.
 *  - `poliza_ambigua`: ≥2 pólizas con esa clave y no hay UNA sola viva que desempate.
 *  - `sin_poliza_en_cartera`: ninguna póliza con esa clave.
 */
export function motivoSinMatchRecibo(
  incoming: ReciboMatchInput,
  candidates: readonly ReciboPolizaCandidate[],
): "clave_incompleta" | "poliza_ambigua" | "sin_poliza_en_cartera" {
  const incNumero = normalizePolizaNumber(incoming.idPolizaEntidad);
  const incDgs = normCodigoDgs(incoming.codigoEntidadDgs);
  if (!incNumero || !incDgs) return "clave_incompleta";
  const exactos = candidates.filter(
    (c) =>
      normalizePolizaNumber(c.numeroPoliza) === incNumero &&
      normCodigoDgs(c.codigoEntidadDgs) === incDgs,
  ).length;
  if (exactos > 1) return "poliza_ambigua";
  if (exactos === 0 && incDgs === "C0468") {
    const incCore = extractOccidentPolizaCore(incoming.idPolizaEntidad);
    if (incCore) {
      const nucleo = candidates.filter(
        (c) =>
          extractOccidentPolizaCore(c.numeroPoliza) === incCore &&
          normCodigoDgs(c.codigoEntidadDgs) === incDgs,
      ).length;
      if (nucleo > 1) return "poliza_ambigua";
    }
  }
  if (exactos === 0) {
    const sinCeros = hitsSinCeros(incoming, incDgs, candidates);
    if (sinCeros && sinCeros.length > 1) return "poliza_ambigua";
  }
  return "sin_poliza_en_cartera";
}
