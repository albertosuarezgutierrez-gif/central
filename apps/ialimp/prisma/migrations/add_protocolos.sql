-- Protocolos de limpieza por propiedad (IALIMP) — aditivo. Aplicado en Supabase (wswbehlcuxqxyinousql).
CREATE TABLE IF NOT EXISTS protocolos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  propiedad_id uuid NOT NULL,
  nombre text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS protocolos_propiedad_activo_uidx ON protocolos (propiedad_id) WHERE activo;
CREATE INDEX IF NOT EXISTS protocolos_empresa_idx ON protocolos (empresa_id);

CREATE TABLE IF NOT EXISTS protocolo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo_id uuid NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  estancia text NOT NULL,
  item_key text,
  descripcion text NOT NULL,
  requiere_foto boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS protocolo_items_protocolo_idx ON protocolo_items (protocolo_id);

CREATE TABLE IF NOT EXISTS protocolo_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo_id uuid NOT NULL REFERENCES protocolos(id) ON DELETE CASCADE,
  item_key text,          -- coincide con item_id de /l (r8/r9/r10) para disparar comparacion
  estancia text,
  categoria text NOT NULL DEFAULT 'objetivo',  -- objetivo | verificacion | instruccion | referencia
  url text NOT NULL,
  caption text,
  orden integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS protocolo_fotos_protocolo_idx ON protocolo_fotos (protocolo_id);
CREATE INDEX IF NOT EXISTS protocolo_fotos_lookup_idx ON protocolo_fotos (protocolo_id, item_key, categoria);

ALTER TABLE protocolos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocolo_fotos ENABLE ROW LEVEL SECURITY;
