-- Categorización automática de gasto personal — columnas de control (2026-07-06).
--
-- A) subcategoria_revisar: señal PROPIA de "duda de subcategoría". NO se reutiliza
--    requiere_revision (que gobierna la confianza del DESTINO/negocio y alimenta la
--    bandeja de deducibilidad de GastosTab y el agente Telegram de tarjeta). Mezclarlas
--    contaminaría esas superficies.
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS subcategoria_revisar BOOLEAN DEFAULT false;

-- D) scope multi-tenant de las alertas de presupuesto por categoría. Hoy la tabla es
--    de facto monousuario (sin cuenta_id); se añade para no filtrar por categoría global.
ALTER TABLE categoria_alertas     ADD COLUMN IF NOT EXISTS cuenta_id UUID;
ALTER TABLE categoria_alertas_log ADD COLUMN IF NOT EXISTS cuenta_id UUID;

-- Backfill: las alertas existentes pertenecen a la cuenta que tiene movimientos bancarios
-- (Alberto). Se deriva por datos (sin hardcodear el UUID): la cuenta con más movimientos.
UPDATE categoria_alertas SET cuenta_id = (
  SELECT cb.cuenta_id
  FROM cuentas_bancarias cb
  JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id
  GROUP BY cb.cuenta_id ORDER BY count(*) DESC LIMIT 1
) WHERE cuenta_id IS NULL;

UPDATE categoria_alertas_log SET cuenta_id = (
  SELECT cb.cuenta_id
  FROM cuentas_bancarias cb
  JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id
  GROUP BY cb.cuenta_id ORDER BY count(*) DESC LIMIT 1
) WHERE cuenta_id IS NULL;
