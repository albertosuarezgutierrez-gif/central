/**
 * Cliente HTTP del adaptador CIMA (Java en Fly.io), PORT central (fase 3) de
 * `asegura/src/lib/integrations/cima/client.ts`.
 *
 * Divergencia ÚNICA con el CRM: las dependencias de red entran INYECTADAS. En el CRM
 * cada llamada leía `process.env` (`getCimaAdapterConfig()`) y usaba el `fetch`
 * global. Aquí `crearClienteAdaptadorCima({ config, fetch })` recibe ambas y nada lee
 * env al importar. La config de producción la construye `configAdaptadorCimaDesdeEnv()`
 * (token con `requireSecret`, sin fallback a literal), y solo cuando se la llama.
 *
 * El cuerpo de `request` (headers, timeout, logs sin URL ni body, errores) es el
 * del CRM línea a línea. `unwrapCimaWseEnvelope` ya se portó en la fase 2
 * (`pull-puro.ts`): se reexporta, no se redefine.
 *
 * 🚨 Credenciales CIMA/TIREA: viven en el adaptador. Este cliente solo conoce la
 * URL del adaptador y el `x-internal-token` compartido.
 */
import { performance } from "node:perf_hooks";

import { requireSecret } from "@central/core-identity/secret";

import {
  assertCimaAdapterCallable,
  getCimaAdapterConfig,
  type CimaAdapterConfig,
} from "./config.ts";
import { exigirEscritorCentral } from "./db/escritor.ts";

export { unwrapCimaWseEnvelope } from "./pull-puro.ts";

export const CIMA_ADAPTER_INTERNAL_TOKEN_HEADER = "x-internal-token";

export type CimaWseOp =
  | "recibirFicherosPendientes"
  | "ficherosDisponibles"
  | "recibirFichero"
  | "confirmarDescarga"
  | "enviarFichero"
  | "estadoEnvio"
  | "consultarPlantillaCredencial"
  | "consultarCredencial"
  | "agregarCredencial"
  | "modificarCredencial"
  | "eliminarCredencial"
  | "validarCredencial";

const WSE_OP_PATHS: Record<CimaWseOp, string> = {
  recibirFicherosPendientes: "/wse/recibir-ficheros-pendientes",
  ficherosDisponibles: "/wse/ficheros-disponibles",
  recibirFichero: "/wse/recibir-fichero",
  confirmarDescarga: "/wse/confirmar-descarga",
  enviarFichero: "/wse/enviar-fichero",
  estadoEnvio: "/wse/estado-envio",
  consultarPlantillaCredencial: "/wse/consultar-plantilla-credencial",
  consultarCredencial: "/wse/consultar-credencial",
  agregarCredencial: "/wse/agregar-credencial",
  modificarCredencial: "/wse/modificar-credencial",
  eliminarCredencial: "/wse/eliminar-credencial",
  validarCredencial: "/wse/validar-credencial",
};

export function getWseOpPath(op: CimaWseOp): string {
  return WSE_OP_PATHS[op];
}

export type CimaRequestLogContext = {
  operation: string;
};

export type CimaRequestInit = {
  method?: "GET" | "POST";
  body?: unknown;
};

export class CimaAdapterTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`cima_adapter_timeout (${operation} after ${timeoutMs}ms)`);
    this.name = "CimaAdapterTimeoutError";
  }
}

/** Copia literal de `errorSummary` (`asegura/src/lib/observability/safe-log.ts`). */
function errorSummary(error: unknown): { name?: string; message: string } {
  if (error instanceof Error) {
    // Trunca el message: un error de SDK externo puede arrastrar fragmentos del
    // request (posible PII voluntaria del usuario). Minimización RGPD.
    return { name: error.name, message: error.message.slice(0, 200) };
  }
  if (typeof error === "string") {
    return { message: error.slice(0, 200) };
  }
  return { message: "unknown_error" };
}

export type CimaFetch = typeof globalThis.fetch;

export interface ClienteAdaptadorCimaDeps {
  config: CimaAdapterConfig;
  fetch: CimaFetch;
  /** PORT central — 🚨 entorno del gate `CIMA_ESCRITOR` (normalmente `process.env`, el
   * MISMO que reciba `buildCimaPullDeps`). Se lee en CADA llamada: toda ruta que
   * confirme una descarga (IRREVERSIBLE en TIREA) exige `CIMA_ESCRITOR=central`. */
  env: Readonly<Record<string, string | undefined>>;
}

/** Ruta decodificada (hasta 3 veces); `null` si no se puede decodificar. */
function decodificarRuta(path: string): string | null {
  let p = path;
  for (let i = 0; i < 3; i++) {
    let d: string;
    try {
      d = decodeURIComponent(p);
    } catch {
      return null;
    }
    if (d === p) break;
    p = d;
  }
  return p;
}

/**
 * PURA. ¿Esta ruta del adaptador ESCRIBE en TIREA (confirmar una descarga o enviar un
 * fichero)? Conservadora: busca `confirmar` o `enviar` sin mirar mayúsculas en
 * CUALQUIER parte de la ruta decodificada (`/wse/confirmar-descarga`,
 * `WSE/Enviar-Fichero/`, `%63onfirmar`…). Indecodificable → sí (fail-CLOSED).
 */
export function rutaConfirmaDescarga(path: string): boolean {
  const p = decodificarRuta(path);
  return p === null || /confirmar|enviar/i.test(p);
}

/** PURA. ¿La ruta toca credenciales CIMA/TIREA? (`credencial` en cualquier parte,
 * sin mirar mayúsculas). Indecodificable → sí (fail-CLOSED). */
export function rutaTocaCredenciales(path: string): boolean {
  const p = decodificarRuta(path);
  return p === null || /credencial/i.test(p);
}

export const CREDENCIALES_BLOQUEADAS_MSG =
  "credenciales CIMA no se gestionan desde central (regla de Alberto)";

export class CimaCredencialesBloqueadasError extends Error {
  constructor() {
    super(CREDENCIALES_BLOQUEADAS_MSG);
    this.name = "CimaCredencialesBloqueadasError";
  }
}

export type CimaHealthResult = {
  ok: boolean;
  status: number;
  body?: unknown;
};

export interface ClienteAdaptadorCima {
  /** = `cimaAdapterRequest` del CRM. */
  request: (path: string, init?: CimaRequestInit, logCtx?: CimaRequestLogContext) => Promise<Response>;
  /** = `getCimaAdapterHealth` del CRM. */
  health: () => Promise<CimaHealthResult>;
  /** = `cimaInvokeWse` del CRM. */
  invokeWse: (op: CimaWseOp, body: Record<string, unknown>) => Promise<Response>;
}

/**
 * Config de PRODUCCIÓN desde el entorno. NO se llama al importar: la invoca el
 * caller (la ruta, en su fase). Token con `requireSecret` (sin fallback: en
 * production falta → lanza; fuera, también lanza). URL y timeout no son secretos.
 */
export function configAdaptadorCimaDesdeEnv(): CimaAdapterConfig {
  return {
    ...getCimaAdapterConfig(),
    internalToken: requireSecret("CIMA_ADAPTER_INTERNAL_TOKEN").trim(),
  };
}

/**
 * Fetch autenticada al CIMA adapter (Fly.io).
 *
 * - Sin retries: las ops WSE backend NO son idempotentes (un retry a ciegas podría
 *   disparar dos veces una operación TIREA). El caller decide reintentar tras inspección.
 * - Network errors / timeouts → throw (caller maneja).
 * - HTTP errors (4xx/5xx) → devuelve `Response` (caller inspecciona status + body).
 * - Logs: solo `operation`, `status`, `durationMs` (sin URL, sin body — pueden contener PII).
 */
export function crearClienteAdaptadorCima(deps: ClienteAdaptadorCimaDeps): ClienteAdaptadorCima {
  const fetch = deps.fetch;

  async function cimaAdapterRequest(
    path: string,
    init?: CimaRequestInit,
    logCtx?: CimaRequestLogContext,
  ): Promise<Response> {
    // PORT central — credenciales CIMA/TIREA: BLOQUEADAS siempre, sea cual sea el env.
    if (rutaTocaCredenciales(path)) throw new CimaCredencialesBloqueadasError();
    // PORT central — 🚨 IRREVERSIBLE: confirmar o enviar a TIREA no sale sin
    // CIMA_ESCRITOR=central (antes de validar config y de cualquier fetch).
    if (rutaConfirmaDescarga(path)) exigirEscritorCentral(deps.env, `escritura_tirea:${path}`);
    const cfg: CimaAdapterConfig = deps.config;
    assertCimaAdapterCallable(cfg);

    const rel = path.replace(/^\/+/, "");
    const url = `${cfg.baseUrl}/${rel}`;
    const method = init?.method ?? "GET";
    const hasBody = init?.body !== undefined && method !== "GET";
    const operation = logCtx?.operation ?? "cima_adapter_http";

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), cfg.timeoutMs);
    const t0 = performance.now();

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          [CIMA_ADAPTER_INTERNAL_TOKEN_HEADER]: cfg.internalToken,
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(init.body) : undefined,
        signal: ac.signal,
      });

      clearTimeout(timeout);
      const durationMs = performance.now() - t0;
      console.info(
        JSON.stringify({
          source: "lib.cima.client",
          event: "http_response",
          operation,
          status: res.status,
          durationMs: Math.round(durationMs),
        }),
      );
      return res;
    } catch (e) {
      clearTimeout(timeout);
      const durationMs = performance.now() - t0;
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort) {
        console.error(
          JSON.stringify({
            source: "lib.cima.client",
            event: "timeout",
            operation,
            durationMs: Math.round(durationMs),
            timeoutMs: cfg.timeoutMs,
          }),
        );
        throw new CimaAdapterTimeoutError(operation, cfg.timeoutMs);
      }
      console.error(
        JSON.stringify({
          source: "lib.cima.client",
          event: "network_error",
          operation,
          durationMs: Math.round(durationMs),
          error: errorSummary(e),
        }),
      );
      throw e instanceof Error ? e : new Error("cima_adapter_request_failed");
    }
  }

  /**
   * GET /health del adapter. No requiere semantic auth en el adapter (el filter excluye `/health`),
   * pero el cliente envía el header igualmente por consistencia.
   */
  async function getCimaAdapterHealth(): Promise<CimaHealthResult> {
    const res = await cimaAdapterRequest("/health", undefined, {
      operation: "health",
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    return { ok: res.ok, status: res.status, body };
  }

  /** Invoca una operación WSE tipada por nombre (body genérico; DTOs en el adapter). */
  async function cimaInvokeWse(op: CimaWseOp, body: Record<string, unknown>): Promise<Response> {
    return cimaAdapterRequest(getWseOpPath(op), { method: "POST", body }, { operation: `wse:${op}` });
  }

  return { request: cimaAdapterRequest, health: getCimaAdapterHealth, invokeWse: cimaInvokeWse };
}
