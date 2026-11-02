/**
 * CIMA adapter (Java sidecar en Fly.io) — config consumida por el cliente HTTP.
 *
 * Variables de entorno (server-only, NUNCA `NEXT_PUBLIC_*`):
 *   CIMA_ADAPTER_URL              — base del adapter (sin trailing slash)
 *   CIMA_ADAPTER_INTERNAL_TOKEN   — secreto compartido (32+ chars, mismo INTERNAL_TOKEN del Fly secret)
 *   CIMA_ADAPTER_TIMEOUT_MS       — timeout fetch (default 200000, deja margen sobre el subprocess timeout 180s del adapter — LOO-395)
 *
 * Sin valor → cliente devuelve `disabled` y no realiza llamadas (apto para dev/preview sin secret seteado).
 */

export const CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH = 32;
export const CIMA_ADAPTER_DEFAULT_TIMEOUT_MS = 200_000;

export type CimaAdapterConfig = {
  baseUrl: string;
  internalToken: string;
  timeoutMs: number;
};

function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getCimaAdapterConfig(): CimaAdapterConfig {
  return {
    baseUrl: (process.env.CIMA_ADAPTER_URL?.trim() ?? "").replace(/\/+$/, ""),
    internalToken: process.env.CIMA_ADAPTER_INTERNAL_TOKEN?.trim() ?? "",
    timeoutMs: envInt("CIMA_ADAPTER_TIMEOUT_MS", CIMA_ADAPTER_DEFAULT_TIMEOUT_MS),
  };
}

export function assertCimaAdapterCallable(cfg: CimaAdapterConfig): void {
  if (!cfg.baseUrl) throw new Error("cima_adapter_missing_url");
  if (!cfg.internalToken) throw new Error("cima_adapter_missing_token");
  if (cfg.internalToken.length < CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH) {
    throw new Error("cima_adapter_token_too_short");
  }
}

export function isCimaAdapterConfigured(
  cfg: CimaAdapterConfig = getCimaAdapterConfig(),
): boolean {
  try {
    assertCimaAdapterCallable(cfg);
    return true;
  } catch {
    return false;
  }
}
