-- Divisa de la factura (EUR/USD…). Opcional: `conciliarConBanco` la lee con to_jsonb(f)->>'divisa' y,
-- si falta, usa una lista de proveedores en USD. NO aplicado: lo aplica Alberto cuando quiera.
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS divisa TEXT;
