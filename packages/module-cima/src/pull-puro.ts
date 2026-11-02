/**
 * PORT central (fase 2): funciones PURAS extraídas LITERALMENTE del CRM (repo `asegura`):
 * `classifyConfirmarDescargaAck` + `seguirFusionHastaSuperviviente` (de `pull-deps.ts`),
 * `getIngestaCodigosEntidad` + `isCodigoEntidadAutorizado` + `splitNombreCompleto`
 * (de `pull-persist.ts`) y `unwrapCimaWseEnvelope` (de `client.ts`, 9 líneas puras que
 * necesita el clasificador del ACK). Sin BD ni red: el resto de esos ficheros (capa
 * Drizzle) llega en la fase 3.
 */
import type { ConfirmAckResult } from "./ingest-pipeline.ts";
import { parseConfirmarDescargaResponse } from "./wse-schemas.ts";

/**
 * LOO-530 — El adapter Java envuelve cada respuesta WSE en un envelope
 * `{ ok, parsed, raw }` (ver `WseController.java`) para exponer metadata de exec
 * del subprocess (exitCode, durationMs, generatedFiles) junto al DTO TIREA
 * parseado. Los schemas Zod en `wse-schemas.ts` modelan SOLO el protocolo WSE
 * puro (lo que vive en `parsed`), no este wrapper.
 *
 * Caller pattern (post-`await res.json()`, pre-validación Zod):
 *   const wse = unwrapCimaWseEnvelope(await res.json());
 *   const parsed = parseRecibirFicherosResponse(wse);
 *
 * Si la respuesta no tiene `parsed` (legacy adapter o error path), devolvemos
 * el json tal cual — la validación Zod fallará downstream con `code: "schema"`
 * y el caller lo gestionará igual que cualquier otra divergencia de contrato.
 */
export function unwrapCimaWseEnvelope(json: unknown): unknown {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const obj = json as Record<string, unknown>;
    if ("parsed" in obj) return obj.parsed;
  }
  return json;
}

/** LOO-759 — Subconjunto de `Response` que la clasificación del ACK necesita.
 * Permite testear `classifyConfirmarDescargaAck` con un doble ligero, sin red. */
export interface ConfirmarDescargaHttpResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

/**
 * LOO-759 — Clasifica la respuesta HTTP de `confirmarDescarga` en un
 * {@link ConfirmAckResult}, distinguiendo fallo TRANSITORIO (retriable) de error
 * REAL de FORMA/contrato (parse). FUNCIÓN PURA (sin BD/red) → testeable directa.
 *
 * Orden de decisión:
 *  1. `!res.ok` (HTTP 4xx/5xx del edge Fly) → `confirm_transient_error`. El edge
 *     en cold-start puede 5xx; NO es un error de contrato → reintentar.
 *  2. `res.json()` lanza (body vacío/HTML, SyntaxError) → `confirm_transient_error`.
 *     Body no-JSON del edge = transitorio, NO parse de contrato.
 *  3. JSON bien formado pero el sobre WSE no desenvuelve → `confirm_parse_error`
 *     (error REAL de contrato: forma JSON válida pero estructura inesperada).
 *  4. Desenvuelto pero falla el schema Zod → `confirm_invalid:<code>`.
 *  5. ACK con codigoRespuesta ≠ CIMA-200 → `ack_not_ok` (rechazo lógico TIREA).
 *  6. ACK OK → `{ ok: true }`.
 *
 * Antes (LOO-758 y previos) CUALQUIER throw → `confirm_parse_error`, lo que
 * permitía que un 5xx/body-vacío del edge degradara un fichero ya `confirmed` →
 * `persisted` aguas arriba (drenado a mano en prod, fichero a7a177aa).
 */
export async function classifyConfirmarDescargaAck(
  res: ConfirmarDescargaHttpResponse,
): Promise<ConfirmAckResult> {
  if (!res.ok) {
    // HTTP 4xx/5xx del edge = transitorio → reintentar en el próximo pull.
    return { ok: false, reason: "confirm_transient_error" };
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    // Body NO parseable como JSON (HTML/vacío del edge en cold-start) =
    // transitorio. SyntaxError de res.json() → retriable, NO parse de contrato.
    return { ok: false, reason: "confirm_transient_error" };
  }
  // A partir de aquí el body es JSON bien formado: un fallo al desenvolver el
  // sobre WSE o al validar la forma es un error REAL de contrato (parse).
  let json: unknown;
  try {
    // Adapter envuelve en `{ ok, parsed, raw }` (LOO-530); desenvolvemos
    // antes de validar contra el schema WSE.
    json = unwrapCimaWseEnvelope(raw);
  } catch {
    return { ok: false, reason: "confirm_parse_error" };
  }
  const parsed = parseConfirmarDescargaResponse(json);
  if (!parsed.ok) return { ok: false, reason: `confirm_invalid:${parsed.code}` };
  // LOO-748 fix P1 — confirm() es WSE PURO: NO escribe `cima_ficheros`. El sellado de
  // estado/`confirmado_at` lo hace el ÚNICO writer del ledger (recordFicheroLedger /
  // recordLedgerWithAudit) DESPUÉS, con la fila ya creada y según `ackOk`. Antes este
  // UPDATE corría ANTES del INSERT del ledger (R2 movió el write fuera de persist) →
  // 0 filas afectadas → `confirmado_at` se perdía en todo fichero confirmado por 1ª vez.
  return { ok: parsed.confirmed, reason: parsed.confirmed ? undefined : "ack_not_ok" };
}

/** Nodo mínimo para seguir una fusión de clientes: a quién fue absorbido (o null si sobrevive). */
export interface NodoFusion {
  mergedIntoClienteId: string | null;
}

/** Tope de saltos al seguir una cadena de fusiones (A→B→C…); más es un dato roto, no una fusión. */
export const MAX_SALTOS_FUSION = 5;

/**
 * 26/09/2026 — sigue la cadena `merged_into_cliente_id` desde una ficha absorbida hasta
 * su SUPERVIVIENTE. Caso: dos fichas de la misma persona con DNIs distintos, fusionadas a
 * mano; la absorbida conserva su hash, y cuando CIMA trae la póliza con ESE DNI el SELECT
 * de supervivientes no lo encuentra → alta nueva → choca con el UNIQUE parcial
 * (`uq_clientes_dni_lookup_hash`, que incluye absorbidas) → fichero entero en `error`.
 * Resolver al superviviente NO resucita la tombstone (LOO-926): la póliza cae en la ficha
 * viva, que es lo que la fusión decidió. Devuelve `null` si la cadena se rompe (ficha que
 * no existe, ciclo o demasiados saltos): mejor cuarentena que adivinar.
 */
export async function seguirFusionHastaSuperviviente(
  absorbidaEn: string,
  cargar: (id: string) => Promise<NodoFusion | null>,
): Promise<string | null> {
  const vistos = new Set<string>();
  let actual = absorbidaEn;
  for (let i = 0; i < MAX_SALTOS_FUSION; i++) {
    if (vistos.has(actual)) return null;
    vistos.add(actual);
    const nodo = await cargar(actual);
    if (!nodo) return null;
    if (nodo.mergedIntoClienteId === null) return actual;
    actual = nodo.mergedIntoClienteId;
  }
  return null;
}

/** Allowlist de códigos DGS de entidad autorizados (CSV env). Vacío = nada autorizado. */
export function getIngestaCodigosEntidad(): ReadonlySet<string> {
  const raw = process.env.CIMA_INGESTA_CODIGOS_ENTIDAD?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0),
  );
}

export function isCodigoEntidadAutorizado(
  codigo: string | null | undefined,
  allow: ReadonlySet<string> = getIngestaCodigosEntidad(),
): boolean {
  if (!codigo) return false; // fail-closed
  return allow.has(codigo.trim().toUpperCase());
}

/** Parte `nombreCompleto` en nombre + apellidos (ambos NOT NULL en clientes). */
export function splitNombreCompleto(nombreCompleto: string | null | undefined): {
  nombre: string;
  apellidos: string;
} {
  const full = (nombreCompleto ?? "").trim();
  if (full === "") return { nombre: "Tomador CIMA", apellidos: "" };
  const sp = full.indexOf(" ");
  if (sp === -1) return { nombre: full, apellidos: "" };
  return { nombre: full.slice(0, sp), apellidos: full.slice(sp + 1).trim() };
}
