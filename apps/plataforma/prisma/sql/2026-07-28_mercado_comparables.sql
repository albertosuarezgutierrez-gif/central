-- Comparables de mercado para valorar las subastas — 28/07/2026
--
-- POR QUÉ: el radar sabe QUÉ se subasta, pero no si está BARATO. Para eso hace
-- falta un valor de mercado, y resulta que no lo hay:
--   · el BOE publica «Tasación 0,00 €» en la práctica totalidad de los anuncios
--     (comprobado en las 4 subastas reales ingeridas),
--   · el valor de referencia del Catastro es dato PROTEGIDO: exige certificado
--     digital, no sale de los servicios web libres.
-- Sin referencia, `evaluarOportunidad` devuelve `puntuacion: null` — correcto
-- (nunca inventa), pero deja el radar mudo.
--
-- LA SALIDA: Alberto ya recibe alertas de Idealista de las zonas que vigila, y
-- esas alertas traen precio Y superficie por anuncio. De ahí sale un €/m² por
-- zona, gratis y con datos que ya llegan a su buzón. Es el TERCER escalón de la
-- cascada de valor (tasación → valor de referencia → comparables), y siempre se
-- marca como ESTIMACIÓN, con penalización de 0,85 en el scoring.
--
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon.

CREATE TABLE IF NOT EXISTS public.mercado_comparables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal text NOT NULL DEFAULT 'idealista',
  -- Id del anuncio en el portal: la misma alerta se repite en correos sucesivos
  -- mientras el anuncio siga vivo, así que el par (portal, ref) deduplica.
  ref_anuncio text NOT NULL,
  titulo text NOT NULL,
  -- vivienda | garaje | local | terreno | otro. Deducido del título, que el
  -- portal siempre antepone. Importa: la única búsqueda guardada de Alberto en
  -- Sevilla es de GARAJES, y su €/m² no dice nada del precio de una vivienda.
  tipo text NOT NULL DEFAULT 'otro',
  -- Zona tal cual la nombra el anuncio («Islantilla Golf, Islantilla»). No se
  -- normaliza a municipio a propósito: el barrio es lo que mueve el precio.
  zona text,
  precio numeric NOT NULL,
  superficie numeric,
  habitaciones int,
  precio_m2 numeric,                    -- NULL si el anuncio no da superficie
  url text,
  -- Fecha del correo, no del anuncio: el portal no publica la de alta. Sirve
  -- para acotar la referencia a lo reciente y podar lo viejo.
  visto_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal, ref_anuncio)
);

CREATE INDEX IF NOT EXISTS ix_mercado_comparables_visto ON public.mercado_comparables (visto_en DESC);
-- Búsqueda por zona sin acentos ni mayúsculas: se compara contra `zona`+`titulo`
-- normalizados en la app, así que basta un índice de texto por prefijo.
CREATE INDEX IF NOT EXISTS ix_mercado_comparables_zona ON public.mercado_comparables (lower(zona));
REVOKE ALL ON public.mercado_comparables FROM anon, authenticated;

-- ── El €/m² estimado, guardado en la propia subasta ─────────────────────────
-- Se persiste (en vez de recalcularlo al vuelo) para que el snapshot jsonb del
-- radar y el aviso de Telegram digan lo MISMO que se vio al detectarla, aunque
-- el mercado se mueva después.
ALTER TABLE public.subastas
  ADD COLUMN IF NOT EXISTS precio_m2_mercado numeric,
  ADD COLUMN IF NOT EXISTS muestra_mercado int,
  ADD COLUMN IF NOT EXISTS zona_mercado text;      -- qué zona se usó para el cálculo
