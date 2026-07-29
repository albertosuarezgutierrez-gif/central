-- 🛒 Tickets de supermercado + comparador de precios (F5 de la banca unificada).
-- Objetivo: subir el ticket del súper (foto), OCR de sus líneas con IA de visión, y guardarlas
-- para (a) usarlas de justificante y (b) comparar precios entre súpers y en el tiempo.
-- BD compartida (misma Supabase que sivra/ialimp). Scope por cuenta_id (multi-tenant).
-- Aplicar por Supabase MCP como `postgres` (como el resto de migraciones del repo).

CREATE TABLE IF NOT EXISTS tickets_compra (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL,
  super         text NOT NULL,                 -- nombre tal cual sale en el ticket
  super_norm    text NOT NULL,                 -- clave normalizada del súper (mercadona/dia/lidl…)
  fecha         date,
  total         numeric(10,2),
  n_lineas      int  NOT NULL DEFAULT 0,
  movimiento_id uuid,                           -- conciliación con el cargo del banco (F5b/futuro)
  imagen_url    text,                           -- si se archiva la imagen (futuro)
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_compra_cuenta ON tickets_compra (cuenta_id, fecha DESC);

CREATE TABLE IF NOT EXISTS tickets_lineas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES tickets_compra(id) ON DELETE CASCADE,
  cuenta_id     uuid NOT NULL,                  -- denormalizado para las queries de comparación
  producto_raw  text NOT NULL,                  -- texto tal cual del ticket
  producto_norm text NOT NULL,                  -- clave normalizada para comparar entre súpers
  cantidad      numeric(10,3),
  precio_unit   numeric(10,2),
  precio_total  numeric(10,2),
  super_norm    text NOT NULL,                  -- denormalizado del ticket (comparador)
  fecha         date                            -- denormalizado del ticket (evolución de precio)
);
CREATE INDEX IF NOT EXISTS idx_tickets_lineas_prod  ON tickets_lineas (cuenta_id, producto_norm);
CREATE INDEX IF NOT EXISTS idx_tickets_lineas_ticket ON tickets_lineas (ticket_id);

-- Datos personales de consumo: fuera del alcance de los roles públicos de Supabase.
REVOKE ALL ON tickets_compra FROM anon, authenticated;
REVOKE ALL ON tickets_lineas  FROM anon, authenticated;
