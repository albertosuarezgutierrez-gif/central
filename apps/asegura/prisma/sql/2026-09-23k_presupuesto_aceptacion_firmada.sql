-- 2026-09-23 — El cliente ELIGE y FIRMA el presupuesto en el portal (spec 2026-09-21 §2.4, PR 4).
--
-- `documento_texto`: el texto EXACTO que firmó (lo hasheado por FirmaPropia). `opcion_elegida_id`: la
-- opción aceptada. `firma_otp_*`: el código de un solo uso al correo de la ficha (mismo esquema que
-- `anulacion`). Un CHECK impide `aceptado_at` sin firma, texto y opción.
--
-- `anulacion.presupuesto_id`: la anulación de la póliza VIEJA firmada en el mismo acto cuando se cambia
-- de compañía (decisión de Alberto, 23/09). La cola de aprobaciones NO la propone hasta que el
-- presupuesto conste emitido: mandarla antes deja al cliente sin seguro si la emisión falla.
--
-- ADITIVA. Reversible: DROP de las columnas, del CHECK y del índice.

ALTER TABLE seguros.presupuesto
  ADD COLUMN IF NOT EXISTS opcion_elegida_id  uuid REFERENCES seguros.presupuesto_opcion (id),
  ADD COLUMN IF NOT EXISTS documento_texto    text,
  ADD COLUMN IF NOT EXISTS firma_id           uuid REFERENCES seguros.firma (id),
  ADD COLUMN IF NOT EXISTS firma_otp_hash     text,
  ADD COLUMN IF NOT EXISTS firma_otp_expira   timestamptz,
  ADD COLUMN IF NOT EXISTS firma_otp_intentos smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS firma_otp_envios   smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS firma_otp_envios_dia date;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_aceptado_con_firma
  CHECK (aceptado_at IS NULL OR (firma_id IS NOT NULL AND documento_texto IS NOT NULL AND opcion_elegida_id IS NOT NULL));
ALTER TABLE seguros.anulacion
  ADD COLUMN IF NOT EXISTS presupuesto_id uuid REFERENCES seguros.presupuesto (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anulacion_por_presupuesto ON seguros.anulacion (presupuesto_id) WHERE presupuesto_id IS NOT NULL;
