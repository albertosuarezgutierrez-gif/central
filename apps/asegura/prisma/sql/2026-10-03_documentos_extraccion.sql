-- 2026-10-03 — `seguros.documentos.extraccion`: lo leído por la IA de una póliza subida, sin PII.
--
-- ADITIVA: una columna NULL, sin tocar filas. NULL = «no se ha leído con IA» (todo lo anterior a
-- esta fecha, o un documento que no era una póliza), que NO es «se leyó y no traía nada».
--
-- Por qué: «Subir póliza» y la subida a una ficha leen el documento con IA (de pago) y solo
-- guardaban lo que iba a la oportunidad; el resto (contacto y domicilio del tomador, mediador,
-- cesión de derechos…) se perdía y había que volver a leerlo. Lo escribe `guardarExtraccion()`
-- (apps/asegura/lib/oportunidad-documento.ts) en best-effort: hasta que esta migración esté
-- aplicada, esa escritura falla en el log y nada más (el documento y la oportunidad no dependen de ella).
--
-- 🔐 SIN datos personales en claro: `extraccionSinPii()` (@central/module-seguros) quita DNI,
-- teléfono, email, fechas de nacimiento/carné y domicilio antes de escribir (en `clientes` van
-- cifrados) y deja `leidos` con un booleano por cada uno. Forma: {"datos": {...}, "leidos": {...}}.

-- Reversible: ALTER TABLE seguros.documentos DROP COLUMN extraccion;

ALTER TABLE seguros.documentos
  ADD COLUMN IF NOT EXISTS extraccion jsonb;

COMMENT ON COLUMN seguros.documentos.extraccion IS
  'Lectura por IA de la póliza subida (03/10/2026), SIN PII del tomador (solo si se leyó). NULL = no se leyó con IA.';
