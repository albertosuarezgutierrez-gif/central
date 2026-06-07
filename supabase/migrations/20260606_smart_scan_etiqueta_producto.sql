-- 20260606_smart_scan_etiqueta_producto.sql
-- Permite tipo='etiqueta_producto' en documentos_escaneados.
-- El CHECK original (20260518_smart_scan.sql) solo admitía
-- ('cv','albaran','factura_proveedor','carta','otro'), por lo que el INSERT del
-- escáner de etiquetas fallaba en silencio (scan_id devolvía null y el dato se perdía).
-- Idempotente: re-ejecutar no tiene efecto.

DO $$
DECLARE
  cname text;
BEGIN
  -- Eliminar cualquier CHECK existente que afecte a la columna tipo
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_namespace  nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'documentos_escaneados'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE documentos_escaneados DROP CONSTRAINT %I', cname);
  END LOOP;

  -- Recrear el CHECK incluyendo 'etiqueta_producto'
  ALTER TABLE documentos_escaneados
    ADD CONSTRAINT documentos_escaneados_tipo_chk
    CHECK (tipo IN ('cv','albaran','factura_proveedor','carta','etiqueta_producto','otro'));
END $$;

COMMENT ON CONSTRAINT documentos_escaneados_tipo_chk ON documentos_escaneados
  IS 'Tipos de documento detectables por el escáner IA, incluido etiqueta_producto (puente a Recepción/stock).';
