-- ============================================================
-- ia.rest · Migración: Motor de Flujos v2
-- Sprint 1: Multi-sección, horario, imprimir al marchar
-- Sprint 2: Impresora fallback
-- ============================================================

-- ── reglas_envio: nuevas columnas ───────────────────────────

-- Soporte multi-sección (array en lugar de valor único)
ALTER TABLE reglas_envio
  ADD COLUMN IF NOT EXISTS seccion_ids text[] NOT NULL DEFAULT '{}';

-- Imprimir ticket de pase automáticamente al marchar
ALTER TABLE reglas_envio
  ADD COLUMN IF NOT EXISTS imprimir_al_marchar boolean NOT NULL DEFAULT false;

-- Impresora destino para el ticket de pase
ALTER TABLE reglas_envio
  ADD COLUMN IF NOT EXISTS impresora_pase_id uuid REFERENCES impresoras(id) ON DELETE SET NULL;

-- Restricción de horario (NULL = siempre activa)
ALTER TABLE reglas_envio
  ADD COLUMN IF NOT EXISTS hora_desde time,
  ADD COLUMN IF NOT EXISTS hora_hasta time;

-- Migrar seccion_id existente a seccion_ids array (backward compat)
UPDATE reglas_envio
  SET seccion_ids = ARRAY[seccion_id]
  WHERE seccion_id IS NOT NULL
    AND (seccion_ids IS NULL OR seccion_ids = '{}');

-- ── impresoras: impresora de fallback ────────────────────────

-- Si la impresora principal falla, COURIER intenta esta
ALTER TABLE impresoras
  ADD COLUMN IF NOT EXISTS impresora_fallback_id uuid REFERENCES impresoras(id) ON DELETE SET NULL;

-- ── Índices ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reglas_envio_restaurante_activa
  ON reglas_envio(restaurante_id, activa);

CREATE INDEX IF NOT EXISTS idx_reglas_envio_seccion_ids
  ON reglas_envio USING GIN(seccion_ids);
