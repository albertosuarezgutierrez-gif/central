-- Ampliaciones del radar de subastas (29/07/2026, «añade todo»):
--  1) Recordatorio URGENTE de últimas 24 h para las seguidas (además del de 3 días).
--  2) Descartes CON MOTIVO desde Telegram: base del aprendizaje (3 descartes
--     por «zona» del mismo municipio → el radar deja de avisar de ese municipio).
--  3) Índices de mercado cacheados (IPV del INE: variación anual de la vivienda).

ALTER TABLE subastas_seguidas ADD COLUMN IF NOT EXISTS recordatorio_24h_at timestamptz;

CREATE TABLE IF NOT EXISTS subastas_descartes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  municipio text,
  tipo_bien text,
  motivo text NOT NULL, -- precio | zona | tipo | otro
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, dedupe_key)
);
REVOKE ALL ON subastas_descartes FROM anon, authenticated;
GRANT ALL ON subastas_descartes TO prisma_plataforma;

-- Serie histórica de las medianas de zona (snapshot ~mensual desde
-- consultarZona): el detector FINO de recesión — mediana cayendo y oferta
-- (total_zona) creciendo en una zona concreta, antes de que lo diga el INE.
CREATE TABLE IF NOT EXISTS mercado_zonas_hist (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL,
  p50_m2 numeric,
  muestra integer,
  total_zona integer,
  capturado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mercado_zonas_hist_slug ON mercado_zonas_hist (slug, capturado_en);
REVOKE ALL ON mercado_zonas_hist FROM anon, authenticated;
GRANT ALL ON mercado_zonas_hist TO prisma_plataforma;

CREATE TABLE IF NOT EXISTS mercado_indices (
  clave text PRIMARY KEY,           -- p.ej. 'ipv_andalucia_va'
  valor numeric,
  etiqueta text,                    -- periodo legible («T2 2026»)
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON mercado_indices FROM anon, authenticated;
GRANT ALL ON mercado_indices TO prisma_plataforma;
