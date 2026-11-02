-- 02/11/2026 · Aprobado por Alberto. Pendiente de aplicar (el MCP pide confirmación interactiva).
-- Reversible: las tablas solo cambian de schema (rollback en el _rollback.sql). El DELETE afecta a 21 filas >180 días sin FK entrante.
CREATE SCHEMA IF NOT EXISTS archivo;
REVOKE ALL ON SCHEMA archivo FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_clientes_borrados_20260531 SET SCHEMA archivo;
ALTER TABLE public._backup_props_borradas_20260531 SET SCHEMA archivo;
ALTER TABLE public._backup_reasignacion_20260531 SET SCHEMA archivo;
ALTER TABLE public._csv_staging SET SCHEMA archivo;
ALTER TABLE seguros.cliente_emails_borrados_20260904 SET SCHEMA archivo;
DELETE FROM seguros.operational_events e
 WHERE e.occurred_at < now() - interval '180 days'
   AND NOT EXISTS (SELECT 1 FROM seguros.solicitud_cambio_documentos d WHERE d.operational_event_id = e.id);
CREATE TABLE IF NOT EXISTS archivo.vigilancia_app_user (medido_en timestamptz PRIMARY KEY DEFAULT now(), llamadas bigint NOT NULL);
REVOKE ALL ON archivo.vigilancia_app_user FROM PUBLIC, anon, authenticated;
INSERT INTO archivo.vigilancia_app_user (llamadas)
 SELECT coalesce(sum(s.calls),0) FROM pg_stat_statements s JOIN pg_roles r ON r.oid=s.userid WHERE r.rolname='app_user';
