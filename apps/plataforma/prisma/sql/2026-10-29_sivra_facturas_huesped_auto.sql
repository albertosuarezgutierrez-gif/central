-- 2026-10-29_sivra_facturas_huesped_auto.sql — la factura del huésped se emite y envía SOLA el día de salida.
--
-- Aprobado por Alberto el 29/10/2026 (excepción anotada en CLAUDE.md: solo la factura con datos validados, el día de
-- salida). Caso que lo motiva: reserva 160296956, la huésped dio en el chat razón social, NIF, dirección y dos correos
-- (destino + copia); la solicitud quedó con todo a NULL y nadie emitió.
--
-- Columnas nuevas:
--   · sivra_factura_solicitudes.receptor_cc     — correos en COPIA que pidió el huésped. NO es dato fiscal (no va en el
--                                                  receptor inmutable del PDF): lo lee `enviarFactura` al mandar.
--                                                  `{}` = sin copia.
--   · sivra_factura_solicitudes.datos_chat_at   — cuándo se rellenó algo desde el chat (`lib/sivra/facturas/chat.ts`).
--                                                  El chat NUNCA pisa un dato ya puesto (COALESCE) ni toca una solicitud
--                                                  que no esté `pendiente`.
--   · sivra_factura_solicitudes.auto_aviso_at / auto_aviso_motivo — el cron de salida avisó a Alberto de que faltaba
--                                                  algo (UN aviso por solicitud, no uno al día).
--   · sivra_facturas_huesped.envio_cc           — rastro de a quién fue en copia (no está en la lista del trigger de
--                                                  inmutabilidad: se puede escribir con la factura ya emitida).
--
-- El código tolera que esta migración aún no esté aplicada en las LECTURAS (`to_jsonb(s)->'receptor_cc'`), pero el
-- relleno desde el chat y el aviso del cron necesitan las columnas: aplicar ANTES de desplegar el cron.
-- Idempotente. NO aplicado a la BD real desde la sesión que lo escribió.

BEGIN;

ALTER TABLE public.sivra_factura_solicitudes
  ADD COLUMN IF NOT EXISTS receptor_cc text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS datos_chat_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_aviso_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_aviso_motivo text;

ALTER TABLE public.sivra_factura_solicitudes DROP CONSTRAINT IF EXISTS sivra_factura_solicitudes_cc_max;
ALTER TABLE public.sivra_factura_solicitudes ADD CONSTRAINT sivra_factura_solicitudes_cc_max CHECK (cardinality(receptor_cc) <= 5);

ALTER TABLE public.sivra_facturas_huesped
  ADD COLUMN IF NOT EXISTS envio_cc text[];

COMMIT;

-- Comprobación tras aplicar:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_name IN ('sivra_factura_solicitudes', 'sivra_facturas_huesped')
--    AND column_name IN ('receptor_cc', 'datos_chat_at', 'auto_aviso_at', 'auto_aviso_motivo', 'envio_cc');
