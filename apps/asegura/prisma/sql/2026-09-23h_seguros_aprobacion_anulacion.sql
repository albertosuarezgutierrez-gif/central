-- 2026-09-23 — Comunicar la anulación firmada a la compañía por la cola de aprobaciones (ASegura OS, 2-d-3).
-- Aplicada como migración `seguros_aprobacion_anulacion_compania`.
--
-- Acción nueva `enviar_correo_compania` (política 'aprobar'): la carta que el cliente firmó en el
-- portal sale adjunta al buzón de administración de SU compañía solo con el OK de Alberto, y al salir
-- la anulación pasa a `comunicada`. `anulacion_id` ata la propuesta a su expediente (obligatorio para
-- esta acción, CHECK visto morder con 23514).
--
-- ADITIVA. Reversible: DROP CONSTRAINT aprobacion_compania_con_anulacion; DROP COLUMN anulacion_id;
-- y devolver aprobacion_accion_check a solo 'enviar_correo_cliente'.

ALTER TABLE seguros.aprobacion DROP CONSTRAINT aprobacion_accion_check;
ALTER TABLE seguros.aprobacion ADD CONSTRAINT aprobacion_accion_check CHECK (accion IN ('enviar_correo_cliente', 'enviar_correo_compania'));
ALTER TABLE seguros.aprobacion ADD COLUMN IF NOT EXISTS anulacion_id uuid REFERENCES seguros.anulacion(id);
ALTER TABLE seguros.aprobacion ADD CONSTRAINT aprobacion_compania_con_anulacion
  CHECK (accion <> 'enviar_correo_compania' OR anulacion_id IS NOT NULL);
