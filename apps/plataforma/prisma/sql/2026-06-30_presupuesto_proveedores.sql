CREATE TABLE IF NOT EXISTS presupuesto_proveedores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id  UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  proveedor  TEXT NOT NULL,
  budget_anual NUMERIC(10,2) NOT NULL,
  anno       INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cuenta_id, proveedor, anno)
);
CREATE INDEX IF NOT EXISTS idx_pp_cuenta ON presupuesto_proveedores(cuenta_id);
