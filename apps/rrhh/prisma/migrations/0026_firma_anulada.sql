-- «Quitar de pendientes» en /admin/firmas (21/10/2026). Pilar (RRHH) puede ANULAR la solicitud de firma
-- (borrado LÓGICO): el documento y su fichero se conservan siempre (nóminas, EPIs, PRL, art. 18).
-- Aditiva e idempotente. 🚨 Aplicar ANTES de desplegar el código: `anularFirmas` escribe estas columnas.
--
-- Una solicitud anulada vuelve a `estado_firma = 'no_requiere'` (así sale del panel, del cron de
-- recordatorios, de «Reclamar» y del botón «Firmar» del portal sin tocar esas consultas) y deja aquí
-- la huella de quién y cuándo. NULL = nunca anulada. Si se vuelve a solicitar la firma, la huella
-- queda como histórico.
ALTER TABLE rrhh.documentos
  ADD COLUMN IF NOT EXISTS firma_anulada_at  timestamptz,  -- cuándo se anuló la solicitud de firma
  ADD COLUMN IF NOT EXISTS firma_anulada_por text;         -- usuario_id del responsable (sesión admin)
