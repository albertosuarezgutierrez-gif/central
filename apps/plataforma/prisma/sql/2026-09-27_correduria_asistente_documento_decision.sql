-- Botones «¿gasto o cliente?» de un documento dudoso (27/09/2026): UN SOLO USO. La primera pulsación
-- graba la decisión; una segunda (o un reintento del webhook de Telegram) no vuelve a procesar el gasto.
ALTER TABLE correduria_asistente_documento
  ADD COLUMN IF NOT EXISTS decision text CHECK (decision IN ('gasto', 'cliente'));
