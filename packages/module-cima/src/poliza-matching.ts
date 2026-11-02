/**
 * LOO-496 — Estrategia de matching de pólizas legacy para la reconciliación CIMA.
 *
 * CIMA es la FUENTE de pólizas (ver auditoría LOO-492): cuando llega un fichero
 * EIAC describiendo una póliza, hay que decidir si se da de alta una nueva o se
 * actualiza una existente de la cartera legacy importada (LOO-420), SIN duplicar.
 * Este módulo es lógica pura (sin BD, sin red) para que esa decisión sea
 * testeable y quede validada ANTES de activar el pull real de ficheros.
 *
 * Hallazgos sobre las 121 pólizas legacy (auditoría empírica 2026-06-01):
 *  - 23 con `numero_poliza` plausible (>=5 chars) → match primario por número.
 *  - 52 con número placeholder basura ("0","1","5","21","367") sobre carriers
 *    REALES (helvetia/allianz/metropolis/generali/pelayo) → número inservible,
 *    pero rescatables por la clave de fallback.
 *  - 24 con número corto (<=4) → ambiguo, se trata como inservible → fallback.
 *  - 22 sin número (mayormente aseguradora "otra") → fallback si el carrier es real.
 *  - Las 22 sin número tienen la clave de fallback completa y 0 colisiones.
 *  - No-reconciliables con CIMA: aseguradora "otra"/"test" (sin codigoEntidad real;
 *    CIMA no enruta ficheros para esos carriers).
 *
 * Precedencia de match (de más fuerte a más débil):
 *   1. numero_poliza utilizable + aseguradora exacta.
 *   2. fallback (cliente_id + aseguradora + fecha_inicio).
 *   3. sin match → alta nueva (CIMA es la fuente).
 * Ante ambigüedad (≥2 candidatos en cualquier nivel) → `review` (nunca merge a ciegas):
 * un alta extra es recuperable; un merge equivocado corrompe datos.
 *
 * Nota de frontera: el matcher opera DESPUÉS de resolver el cliente_id del fichero
 * CIMA (CIMA entrega DNI/identificadores; la resolución cliente↔fichero es un paso
 * aparte, relacionado con el blind-index de LOO-498). El mapeo autoritativo
 * `nombre carrier → codigoEntidad` llega con los datos EIAC reales (LOO-210).
 */

/** Placeholders de número observados en la cartera legacy (52 filas, 5 valores). */
export const JUNK_POLIZA_NUMBERS: ReadonlySet<string> = new Set([
  "0",
  "1",
  "5",
  "21",
  "367",
]);

/** Mínimo de caracteres alfanuméricos para considerar un número de póliza utilizable. */
export const MIN_PLAUSIBLE_POLIZA_LENGTH = 5;

/**
 * LOO-911 — ¿el número es un placeholder tecleado a mano en vez de un número real?
 *
 * `JUNK_POLIZA_NUMBERS` + la longitud mínima solo cazan basura CORTA. En la cartera
 * legacy hay placeholders largos que pasaban el filtro y son veneno para cualquier
 * agrupación por número: `00000` (51 filas de 51 clientes distintos), `pendiente`
 * (23/22), `nolose` (18/18), `xxxxxxxxx`, `norecuerdo`, `notengodelante`… Una lista
 * negra de palabras siempre se queda corta (`pediente`, `nomeauerdo`), así que se
 * usan dos reglas estructurales:
 *
 * 1. **Sin ningún dígito** → no es un número. Medido en prod: de las 100 pólizas
 *    verificadas contra CIMA (las únicas reales), **cero** carecen de dígito.
 * 2. **Un solo carácter repetido** (`00000`, `xxxxxxxxx`) → relleno.
 *
 * Recibe el string YA normalizado a alfanuméricos en minúscula.
 */
export function isPlaceholderPolizaNumber(alnum: string): boolean {
  if (!/[0-9]/.test(alnum)) return true;
  if (/^(.)\1+$/.test(alnum)) return true;
  return false;
}

/**
 * Carriers sin `codigoEntidad` CIMA real → no enrutables (CIMA no entrega ficheros).
 * Cuando dispongamos del mapeo autoritativo nombre→codigoEntidad (LOO-210), esta
 * lista negra se sustituye por una validación positiva contra el catálogo CIMA.
 */
export const NON_CIMA_CARRIERS: ReadonlySet<string> = new Set(["otra", "test", ""]);

export function normalizeText(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Devuelve el número de póliza normalizado (lowercase, trimmed) si es utilizable
 * para match primario, o `null` si es vacío / placeholder basura / demasiado corto.
 */
export function normalizePolizaNumber(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const lower = trimmed.toLowerCase();
  if (JUNK_POLIZA_NUMBERS.has(lower)) return null;
  const alnum = lower.replace(/[^0-9a-z]/g, "");
  if (alnum.length < MIN_PLAUSIBLE_POLIZA_LENGTH) return null;
  // LOO-911 — un placeholder largo ("pendiente", "00000") nunca igualará un
  // `idPolizaEntidad` real: clasificarlo como `primary` es mentira y además le
  // niega el match por `fallbackKey`. Devolver null lo manda al fallback.
  if (isPlaceholderPolizaNumber(alnum)) return null;
  return lower;
}

/** Una póliza es enrutable por CIMA solo si su aseguradora mapea a un carrier real. */
export function isCimaRoutableCarrier(aseguradora: string | null | undefined): boolean {
  return !NON_CIMA_CARRIERS.has(normalizeText(aseguradora));
}

/**
 * LOO-973 — Occident/Catalana Occidente (C0468) numera algunas pólizas como
 * `8-D.DDD.DDD-L` (prefijo "8", núcleo con puntos de miles, letra de control) o,
 * en el import legacy de la cartera, variantes sueltas (`8/0DDDDDDD`,
 * `0DDDDDDD` sin el prefijo). `normalizePolizaNumber` solo limpia separadores,
 * así que "8-5.954.444-F" (CIMA) y "8/05954444" (BD, MISMA póliza) nunca
 * igualan: quedan con dígitos distintos por el prefijo "8" duplicado y el
 * padding con cero a la izquierda.
 *
 * Confirmado con 3 pólizas reales verificadas por Alberto en el panel de SCO
 * (13/09/2026): 8-5.954.444-F (hogar), 8-6.077.091-M (hogar), 8-5.874.010-V
 * (embarcaciones) — las tres en cartera con formato distinto al de CIMA, las
 * tres causando `sin_poliza_en_cartera` en sus SIN/REC.
 *
 * Extrae el núcleo numérico: quita un prefijo "8/" u "8-" inicial SI está
 * presente (no todas las filas de la cartera legacy lo llevan), se queda solo
 * con dígitos y quita los ceros a la izquierda. `null` si no queda ningún
 * dígito utilizable.
 *
 * SOLO se usa como intento ADICIONAL tras el match exacto por
 * `normalizePolizaNumber`, y solo dentro del mismo `codigo_entidad_dgs`
 * (ámbito ya impuesto por el caller): el núcleo tiene menos entropía que el
 * número completo (podría colisionar entre dos pólizas Occident distintas si
 * una difiere de otra solo en ceros a la izquierda), así que nunca sustituye
 * al match primario ni se usa fuera de esta entidad.
 */
export function extractOccidentPolizaCore(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (trimmed === "") return null;
  const withoutPrefix = /^8[/-]/.test(trimmed) ? trimmed.slice(2) : trimmed;
  const digits = withoutPrefix.replace(/[^0-9]/g, "");
  const core = digits.replace(/^0+/, "");
  return core === "" ? null : core;
}

/**
 * Número sin separadores ni ceros a la izquierda (`061089620` → `61089620`), o `null` si
 * no es utilizable. Allianz (C0109) numera con un cero delante en CIMA y sin él en el
 * número que devuelve la emisión (28/09/2026: la 061089620 de CIMA duplicó la emitida
 * 61089620 del mismo coche). Solo como intento ADICIONAL tras el exacto, dentro del
 * mismo carrier y con candidato único; la cautela es la misma que la del núcleo Occident.
 */
export function numeroSinCerosIzquierda(raw: string | null | undefined): string | null {
  const n = normalizePolizaNumber(raw);
  if (n === null) return null;
  const s = n.replace(/[^0-9a-z]/g, "").replace(/^0+/, "");
  return s.length >= MIN_PLAUSIBLE_POLIZA_LENGTH ? s : null;
}

/**
 * Entidades que numeran la misma póliza con y sin ceros a la izquierda entre
 * ficheros (03/10/2026: Allianz `061048939` en CIMA vs `61048939` en cartera). Solo
 * en ellas se reintenta por número sin ceros iniciales (recibos, siniestros, CEF).
 */
export const DGS_TOLERA_CEROS: ReadonlySet<string> = new Set(["C0109"]);

/**
 * Cartera viva = la fila la trajo o la ha tocado CIMA: `import_ref IS NULL` O
 * `eiac_xml_hash IS NOT NULL`. Misma regla que `esCarteraViva()` de
 * `@central/module-seguros` en central. OJO: NO es `import_ref IS NULL` a secas —
 * cuando CIMA trae una póliza que ya estaba en el volcado, actualiza la fila vieja
 * y le deja su `import_ref` (la `3021700291186` de Reale).
 */
export function esCarteraVivaFila(
  importRef: string | null | undefined,
  eiacXmlHash: string | null | undefined,
): boolean {
  return importRef == null || eiacXmlHash != null;
}

/**
 * Desempate de un match AMBIGUO (≥2 pólizas con el mismo número + DGS) por origen:
 * si EXACTAMENTE UNA es cartera viva, esa gana. Con 0 o ≥2 vivas → `null` (sigue
 * siendo ambiguo: cuarentena). Solo cuenta `carteraViva === true`; un candidato que
 * no trae el dato (undefined) no puede ganar, así que sin el dato nada cambia.
 *
 * Por qué: el volcado histórico (jun/2026) y CIMA crean dos filas con el mismo
 * número; exigir candidato único mandaba a cuarentena todo lo que colgaba de ellas
 * (40 recibos de Occident, 19 números en tres compañías, medido el 21/09/2026).
 * No relaja el emparejador: sigue exigiendo UN ganador.
 */
export function unicaCarteraViva<T extends { carteraViva?: boolean }>(
  hits: readonly T[],
): T | null {
  const vivas = hits.filter((h) => h.carteraViva === true);
  return vivas.length === 1 ? vivas[0] : null;
}

/**
 * Clave de fallback `cliente|aseguradora|fecha_inicio`. `null` si falta cualquiera
 * de los tres componentes (sin clave estable no hay match por fallback).
 */
export function buildFallbackKey(
  clienteId: string | null | undefined,
  aseguradora: string | null | undefined,
  fechaInicio: string | null | undefined,
): string | null {
  const aseg = normalizeText(aseguradora);
  if (!clienteId || aseg === "" || !fechaInicio) return null;
  return `${clienteId}|${aseg}|${fechaInicio}`;
}

export type PolizaReconcileClass = "primary" | "fallback" | "non_reconcilable";

/** Normaliza el código DGS (trim + uppercase). null/'' → null. Espejo de recibo/siniestro-matching. */
export function normCodigoDgs(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toUpperCase();
  return t === "" ? null : t;
}

export interface PolizaMatchInput {
  id: string;
  clienteId: string | null;
  aseguradora: string | null;
  numeroPoliza: string | null;
  /** ISO date string (`YYYY-MM-DD`). */
  fechaInicio: string | null;
  /** LOO-990 — código de entidad DGS (p.ej. "C0468"), cuando la fila lo trae. */
  codigoEntidadDgs: string | null;
}

export interface PolizaClassification {
  matchNumber: string | null;
  fallbackKey: string | null;
  class: PolizaReconcileClass;
  reason: string;
}

/**
 * Clasifica una póliza legacy según cómo podrá reconciliarse contra ficheros CIMA.
 * Sirve para "marcar" la cartera ANTES del sync (reporte/diagnóstico) y para que
 * el pipeline de reconciliación decida la estrategia por fila.
 */
export function classifyPolizaForCima(p: PolizaMatchInput): PolizaClassification {
  const matchNumber = normalizePolizaNumber(p.numeroPoliza);
  const fallbackKey = buildFallbackKey(p.clienteId, p.aseguradora, p.fechaInicio);
  const routable = isCimaRoutableCarrier(p.aseguradora);

  if (!routable) {
    return {
      matchNumber,
      fallbackKey,
      class: "non_reconcilable",
      reason: "carrier no enrutable por CIMA (sin codigoEntidad real)",
    };
  }
  if (matchNumber) {
    return {
      matchNumber,
      fallbackKey,
      class: "primary",
      reason: "numero_poliza utilizable + carrier CIMA",
    };
  }
  if (fallbackKey) {
    return {
      matchNumber,
      fallbackKey,
      class: "fallback",
      reason: "sin numero utilizable; clave cliente+aseguradora+fecha_inicio",
    };
  }
  return {
    matchNumber,
    fallbackKey,
    class: "non_reconcilable",
    reason: "carrier CIMA pero clave de fallback incompleta (falta cliente o fecha)",
  };
}

export type MatchAction = "update" | "insert" | "review";

export interface IncomingCimaPoliza {
  clienteId: string | null;
  aseguradora: string | null;
  numeroPoliza: string | null;
  /** ISO date string (`YYYY-MM-DD`). */
  fechaInicio: string | null;
  /** LOO-990 — código de entidad DGS del fichero EIAC entrante (p.ej. "C0468"). */
  codigoEntidadDgs: string | null;
}

export interface MatchResult {
  action: MatchAction;
  matchedId: string | null;
  /** `adopcion` = la puso el anti-duplicados (`decidirAntiDuplicado`), no el matcher. */
  matchedBy: "numero_poliza" | "fallback" | "adopcion" | null;
  reason: string;
}

/**
 * Decide qué hacer con una póliza entrante de CIMA frente a los candidatos legacy
 * de la MISMA correduría (filtrado de tenant es responsabilidad del caller).
 * Precedencia: numero_poliza (+ entidad DGS) → núcleo Occident → fallback → alta
 * nueva. Ambiguo en cualquier nivel → `review` (no se hace merge a ciegas).
 *
 * LOO-990 — dos fallos reales medidos el 17/09/2026 al rescatar pólizas de
 * Occident (C0468) atascadas en `review` por un gap de mapper ya arreglado:
 *
 * 1. **El match primario comparaba `aseguradora` como texto libre**, y esa
 *    columna en la cartera legacy tiene TRES grafías distintas para la MISMA
 *    entidad C0468 ("Plus Ultra", "Catalana Occidente", "Occident" — la marca
 *    ha cambiado con los años). Con nombres distintos el match por número
 *    fallaba en 0 candidatos aunque el número YA estuviera en cartera, y la
 *    póliza se duplicaba en vez de actualizarse (`BIDP019061`, `BIDP023227`,
 *    `BIDQ020971`, `BIDP036783` quedaron con dos filas). Arreglo: si AMBOS
 *    lados traen `codigoEntidadDgs` (estable, no cambia con el rebranding),
 *    se compara por ahí; el nombre libre queda solo de compat para filas sin
 *    entidad. También se añade el núcleo Occident (LOO-973, ya usado en
 *    recibo/siniestro-matching) al match POR NÚMERO, que aquí no se aplicaba
 *    nunca y dejaba sin encontrar `8-5.874.010-V` (CIMA) contra `8/05874010`
 *    (legacy).
 * 2. **El fallback (cliente+aseguradora+fecha_inicio) podía robarle el número a
 *    una póliza YA IDENTIFICADA.** Dos pólizas reales y distintas del mismo
 *    cliente, mismo carrier, misma fecha de efecto (`549212323` y
 *    `549215784`) colisionaban en la misma clave de fallback; la segunda en
 *    procesarse "actualizaba" a la primera y le PISABA el `numero_poliza`
 *    (`persist` escribe siempre `numeroPoliza: mapped.idPolizaEntidad` en un
 *    `update`), fusionando dos pólizas en una fila. El fallback es un rescate
 *    para candidatos SIN número propio utilizable (ver cabecera del módulo);
 *    nunca debe pisar uno que ya lo tiene. Arreglo: los candidatos de fallback
 *    excluyen a los que YA tienen un `numeroPoliza` propio plausible.
 */
export function matchIncomingCimaPoliza(
  incoming: IncomingCimaPoliza,
  candidates: readonly PolizaMatchInput[],
): MatchResult {
  const incDgs = normCodigoDgs(incoming.codigoEntidadDgs);

  /** ¿Mismo carrier? Por entidad DGS si ambos la traen (estable); si no, por nombre libre (compat legacy). */
  const sameCarrier = (c: PolizaMatchInput): boolean => {
    const cDgs = normCodigoDgs(c.codigoEntidadDgs);
    if (incDgs && cDgs) return cDgs === incDgs;
    return normalizeText(c.aseguradora) === normalizeText(incoming.aseguradora);
  };

  // 1. Primario: número de póliza utilizable + mismo carrier.
  const incNumber = normalizePolizaNumber(incoming.numeroPoliza);
  if (incNumber) {
    const byNumber = candidates.filter(
      (c) => normalizePolizaNumber(c.numeroPoliza) === incNumber && sameCarrier(c),
    );
    if (byNumber.length === 1) {
      return {
        action: "update",
        matchedId: byNumber[0].id,
        matchedBy: "numero_poliza",
        reason: "match exacto por numero_poliza + entidad/aseguradora",
      };
    }
    if (byNumber.length > 1) {
      return {
        action: "review",
        matchedId: null,
        matchedBy: "numero_poliza",
        reason: `numero_poliza ambiguo: ${byNumber.length} candidatos`,
      };
    }

    // 1b. LOO-973 — núcleo Occident, solo C0468 (misma cautela que recibo/siniestro-matching:
    // menor entropía que el número completo, no se generaliza a otros carriers sin evidencia).
    if (incDgs === "C0468") {
      const incCore = extractOccidentPolizaCore(incoming.numeroPoliza);
      if (incCore) {
        const coreHits = candidates.filter(
          (c) =>
            extractOccidentPolizaCore(c.numeroPoliza) === incCore &&
            normCodigoDgs(c.codigoEntidadDgs) === "C0468",
        );
        if (coreHits.length === 1) {
          return {
            action: "update",
            matchedId: coreHits[0].id,
            matchedBy: "numero_poliza",
            reason: "match por núcleo numérico Occident (formatos distintos, misma póliza)",
          };
        }
        if (coreHits.length > 1) {
          return {
            action: "review",
            matchedId: null,
            matchedBy: "numero_poliza",
            reason: `núcleo Occident ambiguo: ${coreHits.length} candidatos`,
          };
        }
      }
    }

    // 1c. Mismo número salvo ceros a la izquierda, mismo carrier (cualquiera). Candidato
    // único → update; varios → review. Nunca se generaliza más allá de los ceros.
    const incSinCeros = numeroSinCerosIzquierda(incoming.numeroPoliza);
    if (incSinCeros) {
      const hits = candidates.filter(
        (c) => numeroSinCerosIzquierda(c.numeroPoliza) === incSinCeros && sameCarrier(c),
      );
      if (hits.length === 1) {
        return {
          action: "update",
          matchedId: hits[0].id,
          matchedBy: "numero_poliza",
          reason: "match por numero_poliza sin ceros a la izquierda + entidad/aseguradora",
        };
      }
      if (hits.length > 1) {
        return {
          action: "review",
          matchedId: null,
          matchedBy: "numero_poliza",
          reason: `numero_poliza sin ceros ambiguo: ${hits.length} candidatos`,
        };
      }
    }
  }

  // 2. Fallback: cliente_id + aseguradora + fecha_inicio (exacta, conservador) —
  // SOLO contra candidatos que a su vez NO tengan ya un numero_poliza propio
  // utilizable. Un candidato con número propio es una póliza ya identificada:
  // el fallback nunca le pisa el número con el de otra póliza entrante.
  const incFallback = buildFallbackKey(
    incoming.clienteId,
    incoming.aseguradora,
    incoming.fechaInicio,
  );
  if (incFallback) {
    const fallbackCandidates = candidates.filter(
      (c) => normalizePolizaNumber(c.numeroPoliza) === null,
    );
    const byFallback = fallbackCandidates.filter(
      (c) =>
        buildFallbackKey(c.clienteId, c.aseguradora, c.fechaInicio) === incFallback,
    );
    if (byFallback.length === 1) {
      return {
        action: "update",
        matchedId: byFallback[0].id,
        matchedBy: "fallback",
        reason: "match por cliente_id + aseguradora + fecha_inicio",
      };
    }
    if (byFallback.length > 1) {
      return {
        action: "review",
        matchedId: null,
        matchedBy: "fallback",
        reason: `fallback ambiguo: ${byFallback.length} candidatos`,
      };
    }
  }

  // 3. Sin match → alta nueva (CIMA es la fuente).
  return {
    action: "insert",
    matchedId: null,
    matchedBy: null,
    reason: "sin match en cartera legacy; alta nueva desde CIMA",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Anti-duplicados (03/10/2026): antes de CREAR una póliza desde CIMA, buscar una
// ficha viva con el mismo número (en cualquier puntuación) y adoptarla si es
// inequívocamente la misma. Origen: 72 pólizas duplicadas fusionadas a mano el
// 03/10/2026. La ingesta creaba una fila nueva cuando ya había una ficha viva del
// volcado con ese número pero sin `codigo_entidad_dgs`, con aseguradora
// «(legacy)» o con un nombre de compañía, o con el número escrito con otra
// puntuación (`sameCarrier` exigía nombre idéntico y `normalizePolizaNumber`
// conserva los separadores).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Números comodín: nunca identifican una póliza, así que nunca adoptan nada ni
 * se cuentan como candidatas.
 * Ya normalizados (alfanuméricos en minúscula).
 */
export const COMODIN_POLIZA_NUMBERS: ReadonlySet<string> = new Set([
  "pendiente",
  "nose",
  "nolose",
  "nosabe",
  "sn",
  "sinnumero",
  "0",
  "1",
  "5",
  "12345",
  "",
]);

/**
 * Número de póliza normalizado para DEDUPLICAR: solo `[0-9a-z]` (sin espacios,
 * guiones, puntos ni barras), o `null` si no identifica nada (comodín, < 5
 * caracteres, sin dígitos o un solo carácter repetido — mismas reglas que
 * `normalizePolizaNumber`, más la lista de comodines).
 *
 * ESPEJO EXACTO de la expresión de `loadCandidatasPorNumero` (pull-deps) y del
 * índice de búsqueda de la migración 0107:
 *   translate(regexp_replace(coalesce(numero_poliza,''), '[^0-9A-Za-z]', '', 'g'), A-Z, a-z)
 * Se filtra a ASCII ANTES de pasar a minúsculas a propósito: así `toLowerCase`
 * de JS y `lower()` de Postgres no pueden discrepar con letras no ASCII (p.ej.
 * el signo Kelvin, que JS baja a una `k` ASCII). Si tocas esto, toca la consulta y la 0107.
 */
export function numeroPolizaNorm(raw: string | null | undefined): string | null {
  const alnum = (raw ?? "").replace(/[^0-9A-Za-z]/g, "").toLowerCase();
  if (COMODIN_POLIZA_NUMBERS.has(alnum)) return null;
  if (alnum.length < MIN_PLAUSIBLE_POLIZA_LENGTH) return null;
  if (isPlaceholderPolizaNumber(alnum)) return null;
  return alnum;
}

/** Aseguradora de una ficha del volcado que no dice de qué compañía es. */
const ASEGURADORAS_SIN_COMPANIA: ReadonlySet<string> = new Set(["(legacy)", "legacy", ""]);

/**
 * Nombres con los que la cartera escribe a cada entidad DGS (medido en prod el
 * 03/10/2026 sobre las fichas que YA tienen DGS: C0468 aparece como «Plus
 * Ultra», «Catalana Occidente» y «Occident» — la marca ha cambiado con los años).
 * Solo las entidades que CIMA nos entrega hoy. Una que no esté aquí no adopta por
 * nombre (solo por «(legacy)»/vacío): ante la duda, crear y avisar.
 */
export const ALIAS_ASEGURADORA_DGS: Readonly<Record<string, readonly string[]>> = {
  C0058: ["mapfre"],
  C0072: ["generali"],
  C0109: ["allianz"],
  C0468: ["occident", "plus ultra", "catalana occidente", "seguros catalana occidente"],
  C0613: ["reale"],
};

function normNombreAseguradora(raw: string | null | undefined): string {
  return normalizeText(raw).replace(/\s+/g, " ");
}

/** ¿El nombre libre de la ficha corresponde a la compañía de ese DGS? */
export function nombreCorrespondeADgs(
  aseguradora: string | null | undefined,
  dgs: string | null | undefined,
): boolean {
  const d = normCodigoDgs(dgs);
  if (!d) return false;
  const n = normNombreAseguradora(aseguradora);
  if (n === "") return false;
  return (ALIAS_ASEGURADORA_DGS[d] ?? []).includes(n);
}

/** Ficha viva con el mismo número normalizado, de CUALQUIER cliente de la correduría. */
export interface CandidataPorNumero {
  id: string;
  clienteId: string | null;
  aseguradora: string | null;
  numeroPoliza: string | null;
  codigoEntidadDgs: string | null;
}

export type DecisionAntiDuplicado =
  /** Nada que adoptar (número comodín, sin DGS entrante, o ninguna ficha parecida). */
  | { kind: "crear"; motivo: string }
  /** (b) Exactamente una ficha viva, misma compañía y mismo cliente → se actualiza esa. */
  | { kind: "adoptar"; polizaId: string; motivo: string }
  /** (c) Varias, o una de otro cliente/compañía dudosa → se crea como hoy y se avisa. */
  | { kind: "posible_duplicado"; candidatas: number; motivo: string };

/**
 * Decide qué hacer con una póliza CIMA que el matcher iba a dar de ALTA. Pura.
 *
 * `candidatas` = fichas VIVAS (`merged_into_poliza_id IS NULL`) de la MISMA
 * correduría con el mismo `numeroPolizaNorm` (el filtro de tenant es del caller;
 * aquí se re-filtra por número por defensa).
 *
 * Clasificación de cada candidata frente al DGS entrante:
 *  - DGS propio y DISTINTO → otra compañía: póliza legítimamente distinta, se ignora.
 *  - DGS igual, o sin DGS con aseguradora «(legacy)»/vacía o con un nombre de esa
 *    compañía → COMPATIBLE.
 *  - Sin DGS y con el nombre de OTRA compañía → DUDOSA (no se adopta, se avisa).
 *
 * Solo se adopta con exactamente 1 compatible, 0 dudosas y `clienteId` igual
 * (y no nulo) al cliente resuelto por NIF/blind index. Todo lo demás con alguna
 * candidata → `posible_duplicado` (crear como hoy). Un alta extra es recuperable;
 * adoptar la póliza de otro cliente no.
 */
export function decidirAntiDuplicado(
  incoming: { clienteId: string | null; numeroPoliza: string | null; codigoEntidadDgs: string | null },
  candidatas: readonly CandidataPorNumero[],
): DecisionAntiDuplicado {
  const clave = numeroPolizaNorm(incoming.numeroPoliza);
  if (!clave) return { kind: "crear", motivo: "numero_comodin_o_inservible" };
  const incDgs = normCodigoDgs(incoming.codigoEntidadDgs);
  if (!incDgs) return { kind: "crear", motivo: "sin_dgs_entrante" };

  const compatibles: CandidataPorNumero[] = [];
  let dudosas = 0;
  for (const c of candidatas) {
    if (numeroPolizaNorm(c.numeroPoliza) !== clave) continue;
    const cDgs = normCodigoDgs(c.codigoEntidadDgs);
    if (cDgs) {
      if (cDgs === incDgs) compatibles.push(c);
      continue; // otra compañía: otra póliza
    }
    const nombre = normNombreAseguradora(c.aseguradora);
    if (ASEGURADORAS_SIN_COMPANIA.has(nombre) || nombreCorrespondeADgs(nombre, incDgs)) {
      compatibles.push(c);
    } else {
      dudosas++;
    }
  }

  const total = compatibles.length + dudosas;
  if (total === 0) return { kind: "crear", motivo: "sin_fichas_con_ese_numero" };
  if (
    compatibles.length === 1 &&
    dudosas === 0 &&
    incoming.clienteId != null &&
    compatibles[0].clienteId === incoming.clienteId
  ) {
    return { kind: "adoptar", polizaId: compatibles[0].id, motivo: "ficha_viva_unica_mismo_cliente" };
  }
  const motivo =
    total > 1
      ? "varias_fichas_con_ese_numero"
      : dudosas > 0
        ? "ficha_de_otra_compania_sin_dgs"
        : "ficha_de_otro_cliente";
  return { kind: "posible_duplicado", candidatas: total, motivo };
}

/**
 * Nombre del índice único que planteó la PRIMERA versión de la 0107. Nunca se
 * aplicó y la 0107 se reescribió (04/10/2026) como índice NO único: pólizas
 * distintas de clientes distintos comparten número (ver `poliza_no_duplicado`,
 * 0108). La captura del 23505 queda inerte, como red si algún día existiera.
 */
export const UQ_POLIZAS_NUMERO_NORM = "uq_polizas_numero_norm_vivo";
/** `reason` con que `persistCimaFichero` informa del 23505 de ese índice. */
export const UNIQUE_VIOLATION_NUMERO_NORM = "unique_violation_numero_norm";

/**
 * ¿Es este error el 23505 del índice único de la 0107? Estricto: exige el nombre
 * del índice (postgres-js lo expone en `constraint_name`; Drizzle a veces envuelve
 * el error del driver en `.cause`). Otro 23505 sigue su camino de siempre.
 */
export function esViolacionNumeroNorm(e: unknown): boolean {
  const candidatos: unknown[] = [e, (e as { cause?: unknown } | null)?.cause];
  for (const c of candidatos) {
    if (c && typeof c === "object") {
      const x = c as { code?: string; constraint_name?: string; constraint?: string };
      if (x.code === "23505" && (x.constraint_name ?? x.constraint) === UQ_POLIZAS_NUMERO_NORM) return true;
    }
  }
  return false;
}
