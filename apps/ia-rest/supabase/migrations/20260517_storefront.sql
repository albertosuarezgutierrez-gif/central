-- ============================================================
-- STOREFRONT — Pedidos online públicos (delivery / recogida)
-- ============================================================

-- Config del storefront por restaurante
CREATE TABLE IF NOT EXISTS storefront_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      UUID NOT NULL UNIQUE REFERENCES restaurantes(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL UNIQUE,
  activo              BOOLEAN NOT NULL DEFAULT false,
  nombre_publico      TEXT,
  descripcion         TEXT,
  logo_url            TEXT,
  color_primario      TEXT DEFAULT '#D9442B',
  acepta_delivery     BOOLEAN NOT NULL DEFAULT true,
  acepta_recogida     BOOLEAN NOT NULL DEFAULT true,
  tiempo_estimado_min INTEGER NOT NULL DEFAULT 40,
  pedido_minimo_eur   NUMERIC(8,2) DEFAULT 0,
  radio_delivery_km   NUMERIC(5,2) DEFAULT 5,
  horario             JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Pedidos online entrantes desde el storefront
CREATE TABLE IF NOT EXISTS pedidos_online (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id          UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  numero                  SERIAL,
  tipo                    TEXT NOT NULL CHECK (tipo IN ('delivery','recogida')),
  estado                  TEXT NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente','confirmado','en_cocina','listo','entregado','cancelado')),

  -- Cliente
  cliente_nombre          TEXT NOT NULL,
  cliente_telefono        TEXT NOT NULL,
  cliente_direccion       TEXT,
  cliente_notas           TEXT,

  -- Items (snapshot del carrito)
  items                   JSONB NOT NULL DEFAULT '[]',

  -- Importes
  subtotal                NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                   NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Pago
  stripe_payment_intent   TEXT,
  stripe_status           TEXT DEFAULT 'unpaid',
  pagado_at               TIMESTAMPTZ,

  -- Vínculo con comanda interna (creada al confirmar pago)
  comanda_id              UUID REFERENCES comandas(id),

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_storefront_slug ON storefront_config(slug);
CREATE INDEX IF NOT EXISTS idx_pedidos_online_restaurante ON pedidos_online(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_online_estado ON pedidos_online(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_online_pi ON pedidos_online(stripe_payment_intent);

-- RLS
ALTER TABLE storefront_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_online ENABLE ROW LEVEL SECURITY;

-- storefront_config: lectura pública (para cargar la carta)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'storefront_config_public_read' AND tablename = 'storefront_config') THEN
    CREATE POLICY storefront_config_public_read ON storefront_config
      FOR SELECT USING (activo = true);
  END IF;
END $$;

-- storefront_config: escritura solo service role (via API route con service key)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'storefront_config_service_write' AND tablename = 'storefront_config') THEN
    CREATE POLICY storefront_config_service_write ON storefront_config
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- pedidos_online: el cliente puede leer su propio pedido por ID (sin auth, solo sabe el ID)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pedidos_online_public_read' AND tablename = 'pedidos_online') THEN
    CREATE POLICY pedidos_online_public_read ON pedidos_online
      FOR SELECT USING (true);
  END IF;
END $$;

-- pedidos_online: escritura solo service role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pedidos_online_service_write' AND tablename = 'pedidos_online') THEN
    CREATE POLICY pedidos_online_service_write ON pedidos_online
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Realtime para tracking en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos_online;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'storefront_config_updated_at') THEN
    CREATE TRIGGER storefront_config_updated_at BEFORE UPDATE ON storefront_config
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pedidos_online_updated_at') THEN
    CREATE TRIGGER pedidos_online_updated_at BEFORE UPDATE ON pedidos_online
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
