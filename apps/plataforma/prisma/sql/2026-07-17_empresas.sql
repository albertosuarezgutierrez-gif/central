-- Fase 1 "Empresas en dificultad" (aplicada por Supabase MCP como postgres el 2026-07-17).
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon
-- (BD compartida con el cliente anon de ialimp).

CREATE TABLE IF NOT EXISTS public.borme_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key    text UNIQUE NOT NULL,        -- borme_id + tipo + empresa_norm, para idempotencia
  fecha         date NOT NULL,
  empresa       text NOT NULL,
  empresa_norm  text NOT NULL,               -- normalizada para agrupar variantes
  cif           text,                         -- casi nunca en BORME; se rellena en enriquecimiento (Fase 2)
  provincia     text,
  cnae          text,                         -- casi nunca en BORME; Fase 2
  tipo          text NOT NULL,                -- concurso | disolucion | ampliacion_capital | cese | otro
  acto_raw      text,
  borme_id      text NOT NULL,
  url           text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS borme_eventos_fecha_idx ON public.borme_eventos (fecha DESC);
CREATE INDEX IF NOT EXISTS borme_eventos_tipo_idx  ON public.borme_eventos (tipo);
CREATE INDEX IF NOT EXISTS borme_eventos_prov_idx  ON public.borme_eventos (provincia);
CREATE INDEX IF NOT EXISTS borme_eventos_emprnorm_idx ON public.borme_eventos (empresa_norm);

CREATE TABLE IF NOT EXISTS public.sector_tendencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo       text NOT NULL,               -- 'YYYY-MM'
  dimension     text NOT NULL,               -- 'provincia' (Fase 1) | 'cnae' (Fase 2)
  clave         text NOT NULL,
  constituciones int NOT NULL DEFAULT 0,
  concursos     int NOT NULL DEFAULT 0,
  disoluciones  int NOT NULL DEFAULT 0,
  calculado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo, dimension, clave)
);

REVOKE ALL ON public.borme_eventos    FROM anon, authenticated;
REVOKE ALL ON public.sector_tendencias FROM anon, authenticated;
