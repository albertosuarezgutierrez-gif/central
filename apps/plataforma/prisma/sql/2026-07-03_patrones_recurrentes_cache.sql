-- Caché de etiquetas legibles (cosméticas) de los patrones de gasto/ingreso recurrentes
-- detectados para el bloque «🧾 Mi declaración» de /finanzas/fiscal.
-- La rellena el cron /api/cron/patrones-fiscal-refresh (1×/día) con IA; la petición de
-- UI solo LEE esta tabla, nunca llama al LLM. NO cachea cifras legales fiscales (esas
-- viven en IMPORTES_POR_ANIO de lib/fiscal-deducciones.ts, que mantiene fiscal-novedades).
-- `proyectable` se guarda solo como dato informativo de la IA; el número de la proyección
-- proyecta TODOS los recurrentes detectados (determinista), no depende de este campo.
CREATE TABLE IF NOT EXISTS patrones_recurrentes_cache (
  cuenta_id             UUID        NOT NULL,
  concepto_normalizado  TEXT        NOT NULL,
  destino               TEXT,
  etiqueta              TEXT        NOT NULL,
  proyectable           BOOLEAN     NOT NULL DEFAULT true,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, concepto_normalizado)
);
