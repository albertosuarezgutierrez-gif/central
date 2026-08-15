-- Perfiles de tenant para el radar de ayudas/subvenciones (skill fiscal-novedades, Paso 6).
-- El radar busca convocatorias por sector/provincia de cada perfil activo y escribe las
-- detectadas en fiscal_ayudas con tenant = ayudas_perfiles.tenant.
-- APLICADA en Supabase el 15/08/2026 (migración `ayudas_perfiles`, sembrada con
-- joaquin_jaen y sique_brilla).
CREATE TABLE IF NOT EXISTS ayudas_perfiles (
  tenant text PRIMARY KEY,
  nombre text NOT NULL,
  sector text NOT NULL,
  provincia text NOT NULL,
  app text, -- vertical donde el cliente ve su banner ('almacen', 'ialimp'…)
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ayudas_perfiles FROM anon, authenticated;
