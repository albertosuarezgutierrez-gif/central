-- 20260606_smart_scan_estado_archivado.sql
-- Alinea el CHECK de documentos_escaneados.estado con los valores que usa la app.
-- La BD remota tenía drift: el constraint solo admitía
-- ('pendiente','revision','ok','procesado','rechazado'), pero el escáner archiva
-- y descarta documentos con estado='archivado' / 'descartado' (PUT /api/owner/scanner),
-- y el puente etiqueta→recepción enlaza la auditoría poniendo estado='archivado'.
-- Sin esto, esas UPDATE fallaban con violación de CHECK.
-- Idempotente: re-ejecutar no tiene efecto.

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_namespace  nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'documentos_escaneados'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%estado%'
  LOOP
    EXECUTE format('ALTER TABLE documentos_escaneados DROP CONSTRAINT %I', cname);
  END LOOP;

  ALTER TABLE documentos_escaneados
    ADD CONSTRAINT documentos_escaneados_estado_chk
    CHECK (estado IN ('pendiente','revision','ok','procesado','rechazado','archivado','descartado'));
END $$;

COMMENT ON CONSTRAINT documentos_escaneados_estado_chk ON documentos_escaneados
  IS 'Estados del documento escaneado: flujo IA (pendiente/revision/ok/procesado/rechazado) + archivado/descartado del escáner.';
