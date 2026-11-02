/**
 * LOO-555 — Config tuneable del cron CIMA pull. Lee `process.env.CIMA_PULL_BATCH_SIZE`
 * con clamp [1,50] y default 5. Hasta s206 el batch estaba hardcoded en `route.ts`
 * (literal `= 5`), por lo que la env var añadida en el smoke s205 fue ignorada.
 *
 * Patrón seguro:
 *  - `Number()` (NO `parseInt`) → rechaza strings tipo `"5abc"` (parseInt los aceptaría).
 *  - `Number.isFinite` + `> 0` + `<= 50` + `Math.floor` → blinda contra NaN/0/negativos/decimales/excesos.
 *  - Default 5 preserva el comportamiento previo si la env no está definida.
 *
 * Llamar DENTRO del handler `GET()` (no en module scope): `dynamic = "force-dynamic"`
 * en el route evalúa el módulo por request en serverless → la env var sí se respeta.
 *
 * LOO-XXX — `override` opcional (de `?batchSize=` en el request, protegido por el
 * mismo Bearer CRON_SECRET que el resto del endpoint) para forzar un lote mayor en
 * UNA corrida manual sin tocar la env var de Vercel (evita el ciclo subir→correr→
 * bajar→redeploy). Mismo clamp [1,50] que la env var — nunca se salta el tope.
 */
const MIN_BATCH = 1;
const MAX_BATCH = 50;
const DEFAULT_BATCH = 5;

function clampBatch(raw: string | undefined | null): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < MIN_BATCH) return null;
  return Math.min(Math.floor(n), MAX_BATCH);
}

export function getCimaPullBatchSize(override?: string | null): number {
  return (
    clampBatch(override) ??
    clampBatch(process.env.CIMA_PULL_BATCH_SIZE) ??
    DEFAULT_BATCH
  );
}
