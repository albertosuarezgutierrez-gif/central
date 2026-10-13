-- ⏳ SIN APLICAR. Portal de Grupo ASegura — ubicación opcional del parte de siniestro (13/10/2026).
--
-- Se aplica ANTES de desplegar el código que la usa: `crearParte` escribe `ubicacion_lat/lng` en cada
-- alta, así que sin estas columnas TODO parte nuevo falla (ruidoso, no silencioso). ADITIVA: dos
-- columnas nulas; nada existente cambia. Fotos y escáner NO necesitan SQL (fotos = `seguros.documentos`
-- con `portal_parte_id`; escáner = puente a `apps/asegura`).
--
-- 🚨 NULL = «no pulsó Usar mi ubicación», nunca (0,0). Coordenadas REDONDEADAS a 4 decimales (~11 m)
-- por la aplicación; el CHECK solo cierra el rango y que vengan las dos o ninguna.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_parte_siniestro
  ADD COLUMN IF NOT EXISTS ubicacion_lat numeric(7, 4),
  ADD COLUMN IF NOT EXISTS ubicacion_lng numeric(8, 4);

ALTER TABLE seguros.portal_parte_siniestro
  DROP CONSTRAINT IF EXISTS portal_parte_ubicacion_valida,
  ADD CONSTRAINT portal_parte_ubicacion_valida CHECK (
    (ubicacion_lat IS NULL) = (ubicacion_lng IS NULL)
    AND (ubicacion_lat IS NULL OR (ubicacion_lat BETWEEN -90 AND 90 AND ubicacion_lng BETWEEN -180 AND 180))
  );

-- GRANT mínimo: el rol del portal INSERTA y LEE el parte; sin UPDATE (lo declarado es prueba).
GRANT SELECT (ubicacion_lat, ubicacion_lng), INSERT (ubicacion_lat, ubicacion_lng)
  ON seguros.portal_parte_siniestro TO prisma_asegura_portal;
-- crm_seguros no usa estas columnas. OJO: si ya tiene GRANT a nivel de TABLA, este REVOKE por columna
-- no lo quita (Postgres); comprobar con `\dp seguros.portal_parte_siniestro` y, si procede, tratarlo aparte.
REVOKE ALL (ubicacion_lat, ubicacion_lng) ON seguros.portal_parte_siniestro FROM crm_seguros;

COMMIT;
