-- Rollback (las 21 filas borradas de operational_events no se recuperan salvo PITR).
ALTER TABLE archivo._backup_clientes_borrados_20260531 SET SCHEMA public;
ALTER TABLE archivo._backup_props_borradas_20260531 SET SCHEMA public;
ALTER TABLE archivo._backup_reasignacion_20260531 SET SCHEMA public;
ALTER TABLE archivo._csv_staging SET SCHEMA public;
ALTER TABLE archivo.cliente_emails_borrados_20260904 SET SCHEMA seguros;
DROP TABLE IF EXISTS archivo.vigilancia_app_user;
