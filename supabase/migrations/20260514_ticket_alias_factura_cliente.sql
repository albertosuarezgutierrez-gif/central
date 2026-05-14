-- ============================================================
-- ia.rest · Ticket Alias + Factura Cliente
-- 20260514 — Modificación de conceptos + facturas con datos fiscales
-- ============================================================

-- ── 1. ticket_aliases ────────────────────────────────────────
-- Permite renombrar conceptos en el ticket impreso (no afecta VeriFactu)
CREATE TABLE IF NOT EXISTS ticket_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id      UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  restaurante_id  UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  creado_por      UUID NOT NULL REFERENCES camareros(id),
  motivo          TEXT,
  items           JSONB NOT NULL DEFAULT '[]',
  -- items: [{comanda_item_id, nombre_original, nombre_alias}]
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  ip              TEXT,
  UNIQUE (comanda_id)  -- 1 alias por comanda
);

-- RLS ticket_aliases
ALTER TABLE ticket_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_aliases_select" ON ticket_aliases
  FOR SELECT USING (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
    )
  );

CREATE POLICY "ticket_aliases_insert" ON ticket_aliases
  FOR INSERT WITH CHECK (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
      AND rol IN ('owner', 'jefe_sala')
    )
  );

CREATE POLICY "ticket_aliases_update" ON ticket_aliases
  FOR UPDATE USING (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
      AND rol IN ('owner', 'jefe_sala')
    )
  );

CREATE POLICY "ticket_aliases_service" ON ticket_aliases
  FOR ALL USING (current_setting('role', true) = 'service_role');

-- ── 2. clientes_fiscales ─────────────────────────────────────
-- Cache de datos fiscales de clientes (empresas que piden factura)
CREATE TABLE IF NOT EXISTS clientes_fiscales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nif             TEXT NOT NULL,
  razon_social    TEXT NOT NULL,
  direccion       TEXT,
  email           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (restaurante_id, nif)
);

-- RLS clientes_fiscales
ALTER TABLE clientes_fiscales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_fiscales_select" ON clientes_fiscales
  FOR SELECT USING (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
    )
  );

CREATE POLICY "clientes_fiscales_insert" ON clientes_fiscales
  FOR INSERT WITH CHECK (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
      AND rol IN ('owner', 'jefe_sala')
    )
  );

CREATE POLICY "clientes_fiscales_update" ON clientes_fiscales
  FOR UPDATE USING (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
      AND rol IN ('owner', 'jefe_sala')
    )
  );

CREATE POLICY "clientes_fiscales_service" ON clientes_fiscales
  FOR ALL USING (current_setting('role', true) = 'service_role');

-- ── 3. facturas_cliente ──────────────────────────────────────
-- Facturas completas emitidas a empresas (IVA deducible, serie F)
CREATE TABLE IF NOT EXISTS facturas_cliente (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  comanda_id          UUID REFERENCES comandas(id),
  cliente_fiscal_id   UUID REFERENCES clientes_fiscales(id),
  factura_verifactu_id UUID REFERENCES facturas_verifactu(id),
  -- Numeración correlativa obligatoria (serie F + año)
  serie               TEXT NOT NULL DEFAULT 'F',
  numero              INTEGER NOT NULL,
  numero_completo     TEXT GENERATED ALWAYS AS (serie || numero::TEXT) STORED,
  -- Datos cliente (snapshot en el momento de emisión)
  cliente_nif         TEXT NOT NULL,
  cliente_razon_social TEXT NOT NULL,
  cliente_direccion   TEXT,
  cliente_email       TEXT,
  -- Datos fiscales del restaurante (snapshot)
  emisor_nif          TEXT NOT NULL,
  emisor_razon_social TEXT NOT NULL,
  -- Importes
  base_imponible      NUMERIC(10,2) NOT NULL,
  iva_pct             NUMERIC(4,2) NOT NULL DEFAULT 10.00,
  cuota_iva           NUMERIC(10,2) NOT NULL,
  total               NUMERIC(10,2) NOT NULL,
  -- Items snapshot
  items               JSONB NOT NULL DEFAULT '[]',
  -- items: [{nombre, cantidad, precio_unitario, subtotal}]
  -- Metadatos
  emitida_por         UUID REFERENCES camareros(id),
  motivo              TEXT,  -- "Gasto representación", "Comercial empresa", etc.
  created_at          TIMESTAMPTZ DEFAULT now(),
  ip                  TEXT,
  UNIQUE (restaurante_id, serie, numero)
);

-- RLS facturas_cliente
ALTER TABLE facturas_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturas_cliente_select" ON facturas_cliente
  FOR SELECT USING (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
    )
  );

CREATE POLICY "facturas_cliente_insert" ON facturas_cliente
  FOR INSERT WITH CHECK (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros
      WHERE id = (current_setting('app.camarero_id', true))::UUID
      AND rol IN ('owner', 'jefe_sala')
    )
  );

CREATE POLICY "facturas_cliente_service" ON facturas_cliente
  FOR ALL USING (current_setting('role', true) = 'service_role');

-- ── 4. RPC: siguiente número de factura cliente (atómico) ────
CREATE OR REPLACE FUNCTION siguiente_numero_factura_cliente(
  p_restaurante_id UUID,
  p_serie          TEXT DEFAULT 'F'
)
RETURNS INTEGER
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX(numero), 0) + 1
  FROM facturas_cliente
  WHERE restaurante_id = p_restaurante_id
    AND serie = p_serie
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())
$$;

-- ── 5. Índices ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ticket_aliases_comanda ON ticket_aliases(comanda_id);
CREATE INDEX IF NOT EXISTS idx_clientes_fiscales_nif ON clientes_fiscales(restaurante_id, nif);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente_comanda ON facturas_cliente(comanda_id);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente_fecha ON facturas_cliente(restaurante_id, created_at DESC);

-- ── 6. Trigger updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_aliases_updated_at
  BEFORE UPDATE ON ticket_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER clientes_fiscales_updated_at
  BEFORE UPDATE ON clientes_fiscales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

