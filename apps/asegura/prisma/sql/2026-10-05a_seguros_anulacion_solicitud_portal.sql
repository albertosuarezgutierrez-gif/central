-- 2026-10-05 — «Solicitar baja desde el portal»: el CLIENTE abre el expediente de anulación.
--
-- Hasta hoy la anulación nacía siempre del corredor (`solicitada_por`, `motivo` y `motivo_texto` ya existían).
-- Ahora también puede nacer del portal, y eso exige tres cosas que la tabla no sabía decir:
--   · `origen`         de dónde nació ('corredor' = como hasta hoy; 'portal' = la pidió el cliente).
--   · retención        una baja pedida desde el portal NO se puede firmar hasta que el corredor la libere
--                      (`liberada_at`/`liberada_por`) o pasen 48 h (se libera sola): es el margen para llamar al
--                      cliente antes de que la carta salga hacia la compañía. Las de efecto ≤3 días nacen liberadas
--                      (`liberada_por = 'plazo'`): esperar 48 h las dejaría sin efecto a tiempo.
--   · `fecha_venta`    «vendí el bien»: la fecha de la venta que declara el cliente (la fecha de efecto sale de ella).
--   · `adjunto_documento_id` el justificante de la venta. SOLO la columna: el adjunto (multipart) es fase 2.
--
-- 🚨 La retención la guarda la BD, no solo el código: `anulacion_portal_retenida` impide que una anulación de
-- origen portal quede firmada antes de 48 h sin que alguien la haya liberado. (Las ya existentes son todas
-- 'corredor' por el DEFAULT, así que la restricción no las toca.)
--
-- ADITIVA e IDEMPOTENTE. Rollback:
--   ALTER TABLE seguros.anulacion DROP CONSTRAINT IF EXISTS anulacion_portal_retenida;
--   ALTER TABLE seguros.anulacion DROP COLUMN IF EXISTS adjunto_documento_id, DROP COLUMN IF EXISTS fecha_venta,
--     DROP COLUMN IF EXISTS liberada_por, DROP COLUMN IF EXISTS liberada_at, DROP COLUMN IF EXISTS origen;

ALTER TABLE seguros.anulacion
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'corredor',
  ADD COLUMN IF NOT EXISTS liberada_at timestamptz,
  ADD COLUMN IF NOT EXISTS liberada_por text,
  ADD COLUMN IF NOT EXISTS fecha_venta date,
  ADD COLUMN IF NOT EXISTS adjunto_documento_id uuid REFERENCES seguros.documentos(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anulacion_origen_valido' AND conrelid = 'seguros.anulacion'::regclass) THEN
    ALTER TABLE seguros.anulacion
      ADD CONSTRAINT anulacion_origen_valido CHECK (origen IN ('corredor', 'portal'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anulacion_portal_retenida' AND conrelid = 'seguros.anulacion'::regclass) THEN
    ALTER TABLE seguros.anulacion
      ADD CONSTRAINT anulacion_portal_retenida CHECK (
        origen <> 'portal'
        OR firmada_at IS NULL
        OR liberada_at IS NOT NULL
        OR firmada_at >= created_at + interval '48 hours'
      );
  END IF;
END $$;

-- El rol de la app ya tiene SELECT/INSERT/UPDATE de la tabla entera (2026-09-23f): las columnas nuevas heredan.
