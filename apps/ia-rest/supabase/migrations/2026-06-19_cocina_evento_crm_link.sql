-- ============================================================
-- Puente cocina_eventos → eventos (CRM) — unificación "boda"
-- BD: compartida wswbehlcuxqxyinousql · schema iarest (aplicada 2026-06-19)
-- Una boda = UNA ficha en `eventos`; cocina (cocina_eventos) y material
-- (materiales_asignacion, destino_ref) cuelgan del mismo evento.
-- ============================================================

SET search_path TO iarest, public;

ALTER TABLE cocina_eventos
  ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES eventos(id);

CREATE INDEX IF NOT EXISTS idx_cocina_eventos_evento
  ON cocina_eventos (evento_id) WHERE evento_id IS NOT NULL;
