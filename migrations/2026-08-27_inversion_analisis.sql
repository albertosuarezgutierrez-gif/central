-- 2026-08-27_inversion_analisis.sql
--
-- Memoria del agente de underwriting inmobiliario (VUT). Cada fila es UN análisis
-- con sus supuestos versionados, para poder volver dentro de 12 meses y contrastar
-- la ocupación que se estimó con la que salió de verdad. Es la diferencia entre un
-- agente y una calculadora: sin esta tabla, cada análisis nace sin memoria y nadie
-- sabe nunca si el motor acierta.
--
-- Mismo patrón que `inmuebles_busqueda`: vive fuera del schema de Prisma y se lee
-- y escribe con `$queryRaw`, así que no hace falta tocar el cliente generado.
--
-- Idempotente: `IF NOT EXISTS` en la tabla y en los índices.
--
-- Para revertir:  DROP TABLE IF EXISTS inversion_analisis;

BEGIN;

CREATE TABLE IF NOT EXISTS inversion_analisis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Identidad del inmueble analizado (URL del anuncio o referencia catastral).
  referencia     text NOT NULL,
  municipio      text NOT NULL,

  -- Versión del motor que produjo el resultado. Sin esto, dos análisis de la misma
  -- ficha con motores distintos parecerían contradecirse sin explicación.
  motor_version  text NOT NULL,

  -- La entrada COMPLETA: ficha, puerta legal, curvas de mercado, costes,
  -- financiación y supuestos. Es lo que permite re-derivar el resultado.
  supuestos      jsonb NOT NULL,

  -- La salida completa del motor (escenarios + veredicto).
  resultado      jsonb NOT NULL,

  -- Desnormalizado solo para poder filtrar y ordenar sin abrir el jsonb.
  -- NULL = el motor no pudo calcularlo (puerta legal o datos que faltan), que NO
  -- es lo mismo que un yield de 0.
  decision       text NOT NULL,
  yield_neto     double precision,

  -- Notas de quien lanzó el análisis.
  nota           text
);

CREATE INDEX IF NOT EXISTS inversion_analisis_municipio_idx
  ON inversion_analisis (municipio, created_at DESC);

CREATE INDEX IF NOT EXISTS inversion_analisis_referencia_idx
  ON inversion_analisis (referencia, created_at DESC);

-- Supabase concede por defecto a `anon`/`authenticated` sobre toda tabla nueva de
-- `public`, y sin RLS eso la deja legible con la clave anónima. La app entra con
-- `prisma_plataforma` (BYPASSRLS), así que cerrarla no le cuesta nada. Mismo
-- criterio que `mapa_arquitectura`.
REVOKE ALL ON TABLE inversion_analisis FROM anon, authenticated;
ALTER TABLE inversion_analisis ENABLE ROW LEVEL SECURITY;

COMMIT;
