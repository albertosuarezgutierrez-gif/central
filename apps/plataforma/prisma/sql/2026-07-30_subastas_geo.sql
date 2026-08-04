-- Coordenadas de los inmuebles en subasta — 30/07/2026
--
-- POR QUÉ: el mapa nacional de /subastas (pestaña 🗺️ Mapa) y el enlace a
-- Google Maps de cada ficha necesitan un punto. La fuente es el servicio LIBRE
-- del Catastro `Consulta_CPMRC` (coordenadas WGS84 por referencia catastral),
-- que rellena el cron `subastas-enriquecer` para las filas con ref_catastral.
-- Sin referencia catastral no hay punto exacto: la ficha cae al enlace por
-- dirección/municipio y el mapa la cuenta como «sin ubicar» (nunca se inventa).
--
-- DOS PRECISIONES (columna `geo_precision`), siempre declaradas al usuario:
--   'catastro'  → punto exacto de la parcela (Consulta_CPMRC por ref. catastral)
--   'municipio' → centro del municipio (Nominatim/OSM) cuando NO hay referencia
--     catastral — solo 5 de 34 vigentes la traían el 30/07/2026 y un mapa con el
--     15% de los pines no sirve para "verlos todos de un vistazo". El mapa pinta
--     los aproximados en hueco y lo dice en el popup; nunca se hace pasar un
--     centroide por una dirección.
--
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon.

ALTER TABLE public.subastas
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lon double precision,
  ADD COLUMN IF NOT EXISTS geo_precision text;

-- El mapa lee solo las geocodificadas vigentes.
CREATE INDEX IF NOT EXISTS ix_subastas_geo ON public.subastas (lat) WHERE lat IS NOT NULL;
