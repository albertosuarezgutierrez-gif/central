-- ============================================================
-- Preaviso de marcha — Fase 2: disparo AUTOMÁTICO por umbral de tiempo.
-- Schema iarest. Aditiva. BD compartida wswbehlcuxqxyinousql.
--
-- El dueño configura "avisar X minutos después de que la comanda entra en
-- cocina". El cron /api/cron/preavisos-auto crea el preaviso solo (emitido_por
-- = 'auto') para las comandas que superan ese umbral y aún no tienen preaviso.
-- 0 = desactivado (solo disparo manual con el botón 📣 del KDS).
--
-- Requiere preaviso_activo = true (gate maestro de la Fase 1) para actuar.
-- ============================================================

SET search_path TO iarest, public;

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS preaviso_auto_min INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN restaurantes.preaviso_auto_min IS
  'Minutos tras entrar en cocina para auto-disparar el preaviso. 0 = solo manual. Requiere preaviso_activo.';
