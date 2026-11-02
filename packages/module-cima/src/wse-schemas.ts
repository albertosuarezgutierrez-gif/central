import { z } from "zod/v4";

/**
 * LOO-521 — Esquemas Zod + parsers de las respuestas JSON del CIMA adapter
 * (Java sidecar, ver `asegura-app-cima-adapter/.../dto/wse/`). PURO: sin BD,
 * sin red, sin crypto — testeable y reusable por el ingest-pipeline (PR-5) y
 * pull-persist (PR-7).
 *
 * El adapter ya decodifica base64 + unzip + transforma el EIAC XML interno a un
 * árbol JSON (`datos`). Aquí NO re-parseamos XML: validamos la forma del JSON que
 * el adapter emite y damos tipos seguros downstream.
 *
 * Códigos (verificados contra los DTOs + tests del adapter): éxito =
 * codigoRespuesta `CIMA-200` + estadoProceso `FN`; error = `CIMA-4xx`/`CIMA-5xx`
 * con estadoProceso null y fichero/nombre null.
 *
 * Zod v4: usamos `z.looseObject` (NO `.passthrough()`, deprecado — ver
 * feedback_zod_v4_no_passthrough) donde queremos conservar campos no modelados
 * (el árbol `datos` del EIAC y tolerancia al doc drift de TIREA en la raíz).
 */

/** Código de respuesta de éxito de la WSE (TIREA). */
export const CIMA_SUCCESS_CODE = "CIMA-200" as const;
/** estadoProceso "finalizado" que acompaña a una respuesta correcta. */
export const CIMA_ESTADO_PROCESO_FINALIZADO = "FN" as const;

/** True si la respuesta WSE indica éxito (codigoRespuesta === CIMA-200). */
export function isCimaSuccess(
  codigoRespuesta: string | null | undefined,
): boolean {
  return codigoRespuesta === CIMA_SUCCESS_CODE;
}

/**
 * Un fichero EIAC parseado por el adapter (DTO Java `FicheroParseado`).
 *
 * `datos` es el árbol JSON del EIAC interno — forma fuertemente variable por
 * ramo/tipoObjeto; lo dejamos como `unknown` (lo navega el mapper PR-4). En
 * prod es PII REAL: NUNCA volcarlo en logs/tests.
 *
 * `zipEntryCount` (LOCKED, playbook §1.19): número de entradas .xml dentro del
 * ZIP TIREA. REQUIRED desde el inicio para forzar el guard multi-entry (>1 →
 * error) en el pipeline (PR-5) y no perder datos en silencio.
 *   El adapter Java lo emite NATIVO desde v35 (LOO-526; en prod desde v36,
 *   2026-07-01). La inyección interina `zipEntryCount:1` del route se retiró en
 *   LOO-557; si el campo falta, el route corta el pull con
 *   `cima_pull_failed.reason=adapter_missing_zip_entry_count` (regresión del
 *   adapter — ver `countFicherosSinZipEntryCount`).
 */
export const ficheroParseadoSchema = z.looseObject({
  nombreFicheroComprimido: z.string().min(1),
  estadoFicheroComprimido: z.string().nullable().optional(),
  fechaCreacionComprimido: z.string().nullable().optional(),
  // LOO-554 — trim: whitespace en codigoEntidad rompía el guard (0b) de
  // ingest-pipeline.ts y dejaba ficheros stuck en limbo TIREA. Workflow
  // adversarial Fase 2 finding P1 (codigoEntidad inconsistente).
  codigoEntidad: z
    .string()
    .nullable()
    .optional()
    .transform((s) => s?.trim() || null),
  /** POL | SIN | REC | CEF | LIQ. No restringimos a enum: el pipeline decide
   *  (solo POL se procesa; el resto va a `deferred`). Restringir aquí rompería
   *  ante un tipoObjeto nuevo de TIREA. */
  tipoObjeto: z.string().min(1),
  versionEiac: z.string().nullable().optional(),
  checksum: z.string().nullable().optional(),
  checksumVerified: z.boolean().optional().default(false),
  /** árbol JSON del EIAC interno; navegado por el mapper (PR-4). PII en prod. */
  datos: z.unknown(),
  /** XML interno crudo; base del xml_hash (MVP) — puede no venir en errores. */
  rawXml: z.string().nullable().optional(),
  /** LOCKED §1.19 — entradas .xml del ZIP. Guard >1 → error en pipeline. */
  zipEntryCount: z.number().int().nonnegative(),
});

export type FicheroParseado = z.infer<typeof ficheroParseadoSchema>;

/**
 * LOO-557 cleanup — guard estricto pre-parse del cron `cima-pull`: cuenta los
 * ficheros del envelope crudo SIN `zipEntryCount` (null/undefined). El adapter
 * ≥v35 lo emite siempre; `missing>0` = regresión → el route corta el pull con
 * `reason=adapter_missing_zip_entry_count` en vez de degradar a `parse_failed`
 * genérico (diagnóstico directo, runbook cima-tirea.md). Solo inspecciona
 * entradas objeto: cualquier otra forma la rechaza el parse zod después.
 */
export function countFicherosSinZipEntryCount(rawJson: unknown): {
  missing: number;
  total: number;
} {
  if (!rawJson || typeof rawJson !== "object") return { missing: 0, total: 0 };
  const ficheros = (rawJson as { ficheros?: unknown }).ficheros;
  if (!Array.isArray(ficheros)) return { missing: 0, total: 0 };
  let missing = 0;
  for (const f of ficheros) {
    if (f && typeof f === "object") {
      if ((f as Record<string, unknown>).zipEntryCount == null) missing++;
    }
  }
  return { missing, total: ficheros.length };
}

/**
 * Envelope de `POST /wse/recibir-ficheros-pendientes` SIN validar los ficheros
 * elemento a elemento (`ficheros: unknown[]`). Los ficheros se validan de forma
 * individual en `parseRecibirFicherosResponse` para que UN fichero malformado NO
 * tire la página entera (hazard P1 del review adversarial wf_0e1431cb-053).
 */
export const recibirFicherosEnvelopeSchema = z.looseObject({
  codigoRespuesta: z.string().min(1),
  descripcionRespuesta: z.string().nullable().optional(),
  estadoProceso: z.string().nullable().optional(),
  pagina: z.number().int().nullable().optional(),
  totalPaginas: z.number().int().nullable().optional(),
  totalResultadosPagina: z.number().int().nullable().optional(),
  totalResultados: z.number().int().nullable().optional(),
  ficheros: z.array(z.unknown()).default([]),
});

export type RecibirFicherosEnvelope = z.infer<
  typeof recibirFicherosEnvelopeSchema
>;

/**
 * Respuesta de `POST /wse/recibir-fichero` (descarga puntual). DTO Java
 * `WseRecibirFicheroResponse`: `fichero` es null en error.
 */
export const recibirFicheroResponseSchema = z.looseObject({
  codigoRespuesta: z.string().min(1),
  descripcionRespuesta: z.string().nullable().optional(),
  fichero: ficheroParseadoSchema.nullable().optional(),
});

export type RecibirFicheroResponse = z.infer<
  typeof recibirFicheroResponseSchema
>;

/**
 * Respuesta de `POST /wse/confirmar-descarga` (ack). DTO Java
 * `WseConfirmarDescargaResponse`: solo código + descripción + estadoProceso +
 * nombre. Sin payload.
 */
export const confirmarDescargaResponseSchema = z.looseObject({
  codigoRespuesta: z.string().min(1),
  descripcionRespuesta: z.string().nullable().optional(),
  estadoProceso: z.string().nullable().optional(),
  nombreFicheroComprimido: z.string().nullable().optional(),
});

export type ConfirmarDescargaResponse = z.infer<
  typeof confirmarDescargaResponseSchema
>;

/**
 * Resultado de parseo discriminado — NO lanza (idiom de
 * `codeoscopic/submit-response-schema.ts`: el caller decide). El pipeline puede
 * mandar a `error`/`review` sin try/catch.
 */
export type WseParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "invalid_shape" | "schema"; issues?: string[] };

function issueStrings(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

function safeParse<T>(schema: z.ZodType<T>, json: unknown): WseParseResult<T> {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, code: "invalid_shape" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, code: "schema", issues: issueStrings(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

/** Un fichero de la página que no validó, con su índice y los issues Zod. */
export interface RejectedFichero {
  index: number;
  issues: string[];
}

/**
 * Resultado de `parseRecibirFicherosResponse`. El envelope se valida atómico;
 * cada fichero se valida individualmente → `valid` (procesables) + `rejected`
 * (malformados, con su índice). Así un fichero corrupto NO descarta la página
 * completa; el pipeline registra los `rejected` en el ledger como `error`.
 */
export type RecibirFicherosParseResult =
  | {
      ok: true;
      codigoRespuesta: string;
      success: boolean;
      envelope: RecibirFicherosEnvelope;
      valid: FicheroParseado[];
      rejected: RejectedFichero[];
    }
  | { ok: false; code: "invalid_shape" | "schema"; issues?: string[] };

export function parseRecibirFicherosResponse(
  json: unknown,
): RecibirFicherosParseResult {
  const env = safeParse(recibirFicherosEnvelopeSchema, json);
  if (!env.ok) return env;

  const valid: FicheroParseado[] = [];
  const rejected: RejectedFichero[] = [];
  env.data.ficheros.forEach((raw, index) => {
    const parsed = ficheroParseadoSchema.safeParse(raw);
    if (parsed.success) valid.push(parsed.data);
    else rejected.push({ index, issues: issueStrings(parsed.error) });
  });

  return {
    ok: true,
    codigoRespuesta: env.data.codigoRespuesta,
    success: isCimaSuccess(env.data.codigoRespuesta),
    envelope: env.data,
    valid,
    rejected,
  };
}

export function parseRecibirFicheroResponse(
  json: unknown,
): WseParseResult<RecibirFicheroResponse> {
  return safeParse(recibirFicheroResponseSchema, json);
}

/**
 * Parsea el ack de confirmarDescarga. Además de validar la forma, expone si el
 * ACK fue OK (codigoRespuesta === CIMA-200) para que el caller (pull-persist,
 * PR-7) NO marque el fichero `confirmed` ante un 4xx/5xx (divergencia canónica
 * §1.2 del playbook).
 */
export type ConfirmarDescargaParseResult =
  | { ok: true; confirmed: boolean; data: ConfirmarDescargaResponse }
  | { ok: false; code: "invalid_shape" | "schema"; issues?: string[] };

export function parseConfirmarDescargaResponse(
  json: unknown,
): ConfirmarDescargaParseResult {
  const res = safeParse(confirmarDescargaResponseSchema, json);
  if (!res.ok) return res;
  return {
    ok: true,
    confirmed: isCimaSuccess(res.data.codigoRespuesta),
    data: res.data,
  };
}
