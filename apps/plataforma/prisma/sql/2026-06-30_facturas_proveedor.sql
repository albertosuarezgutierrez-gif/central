-- Tabla de facturas de proveedores para el agente de pagos automáticos (30/06/2026).
-- Flujo: Gmail → OCR → Telegram con botones → Enable Banking PIS (o SEPA XML fallback).
-- Scoped por cuenta_id (plataforma) para multi-tenant.

CREATE TABLE IF NOT EXISTS facturas_proveedor (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id             UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  proveedor             TEXT NOT NULL,
  concepto              TEXT,
  importe               NUMERIC(10,2) NOT NULL,
  fecha_factura         DATE,
  fecha_vencimiento     DATE,
  numero_factura        TEXT,
  iban_proveedor        TEXT,
  -- Estados: nueva | pendiente_revision | aprobada | pago_iniciado | pagada | rechazada | aplazada
  estado                TEXT NOT NULL DEFAULT 'nueva',
  telegram_msg_id       BIGINT,
  pago_id               TEXT,           -- Enable Banking payment_id
  pago_url              TEXT,           -- URL de autorización SCA
  pago_confirmado_at    TIMESTAMPTZ,
  aplazar_hasta         DATE,
  origen                TEXT NOT NULL DEFAULT 'gmail', -- gmail | foto | manual
  gmail_uid             INT,
  iva_porcentaje        NUMERIC(5,2) DEFAULT 21,
  cuota_iva             NUMERIC(10,2),  -- base * pct / 100, calculado al insertar
  reserva_id            TEXT,           -- ID de reserva Smoobu vinculada (idea futura)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fp_cuenta ON facturas_proveedor(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_fp_estado ON facturas_proveedor(estado);
CREATE INDEX IF NOT EXISTS idx_fp_cuenta_estado ON facturas_proveedor(cuenta_id, estado);

-- Dedupe: mismo proveedor + número de factura no se importa dos veces.
-- Parcial: solo cuando numero_factura no es nulo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fp_dedupe
  ON facturas_proveedor(cuenta_id, proveedor, numero_factura)
  WHERE numero_factura IS NOT NULL;

COMMENT ON TABLE facturas_proveedor IS
  'Facturas recibidas de proveedores. Flujo de pago: Gmail OCR → Telegram → Enable Banking PIS o SEPA XML. Creada 2026-06-30.';
COMMENT ON COLUMN facturas_proveedor.estado IS
  'nueva | pendiente_revision | aprobada | pago_iniciado | pagada | rechazada | aplazada';
COMMENT ON COLUMN facturas_proveedor.cuota_iva IS
  'Cuota de IVA soportado. Se suma al trimestre en /finanzas.';
COMMENT ON COLUMN facturas_proveedor.pago_id IS
  'Enable Banking payment_id una vez iniciado el PIS.';
COMMENT ON COLUMN facturas_proveedor.pago_url IS
  'URL de autorización SCA que el dueño debe visitar para confirmar el pago.';
