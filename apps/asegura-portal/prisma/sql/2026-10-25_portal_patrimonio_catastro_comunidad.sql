-- PATRIMONIO (25/10/2026) — NO APLICADO. Lo aplica Alberto ANTES de desplegar el código que lee estas columnas
-- (si no, 42703 en toda lectura de `portal_patrimonio_inmueble`).
--
-- 1. Caché del Catastro en el inmueble, para la estimación del capital de continente mínimo (infraseguro sin pedir datos):
--      catastro_superficie_m2   m² construidos que contestó el Catastro. NULL = no se sabe (≠ 0). Distinta de `superficie_m2`
--                               (la que escribe la persona): nunca se pisan.
--      catastro_tipo_vivienda   'piso' (propiedad horizontal) | 'unifamiliar'. NULL = no se sabe.
--      catastro_consultado_en   cuándo se preguntó por última vez (NULL = nunca): evita llamar al Catastro en cada pintado.
--      catastro_estado          'ok' (contestó con datos) | 'sin_datos' (contestó y no hay) | 'no_responde' (red/corte; se
--                               reintenta pronto). NULL = nunca consultado.
-- 2. Comunidad de propietarios: `presidente_comunidad` — la persona marca que es presidente/administrador de la comunidad de
--    este inmueble. Tri-estado: NULL = no lo ha dicho (≠ false). Habilita «Seguro de la comunidad» en Seguros.
--
-- El portal lee y actualiza estas columnas por GRANT de columnas (jamás DELETE); el schema.prisma es espejo del GRANT SELECT
-- (cepo `test/regression-portal-patrimonio-sql.test.ts`). `crm_seguros` no toca la tabla.

BEGIN;

ALTER TABLE seguros.portal_patrimonio_inmueble
  ADD COLUMN IF NOT EXISTS catastro_superficie_m2 numeric(10, 2),
  ADD COLUMN IF NOT EXISTS catastro_tipo_vivienda text,
  ADD COLUMN IF NOT EXISTS catastro_consultado_en timestamptz,
  ADD COLUMN IF NOT EXISTS catastro_estado text,
  ADD COLUMN IF NOT EXISTS presidente_comunidad boolean;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_catastro_superficie_positiva') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_catastro_superficie_positiva
        CHECK (catastro_superficie_m2 IS NULL OR catastro_superficie_m2 > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_catastro_tipo_catalogo') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_catastro_tipo_catalogo
        CHECK (catastro_tipo_vivienda IS NULL OR catastro_tipo_vivienda IN ('piso', 'unifamiliar'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_catastro_estado_catalogo') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_catastro_estado_catalogo
        CHECK (catastro_estado IS NULL OR catastro_estado IN ('ok', 'sin_datos', 'no_responde'));
  END IF;
  -- Coherencia: estado y fecha nacen juntos; sin datos del Catastro no hay superficie ni tipo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_catastro_coherente') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_catastro_coherente
        CHECK (
          (catastro_estado IS NULL) = (catastro_consultado_en IS NULL)
          AND (catastro_estado = 'ok' OR (catastro_superficie_m2 IS NULL AND catastro_tipo_vivienda IS NULL))
        );
  END IF;
END $$;

-- GRANT por columnas (espejo EXACTO en schema.prisma). Sin INSERT: nacen NULL; la persona solo actualiza
-- `presidente_comunidad` y el servidor, la caché.
GRANT SELECT (catastro_superficie_m2, catastro_tipo_vivienda, catastro_consultado_en, catastro_estado, presidente_comunidad)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT UPDATE (catastro_superficie_m2, catastro_tipo_vivienda, catastro_consultado_en, catastro_estado, presidente_comunidad)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_inmueble FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, privilege_type FROM information_schema.column_privileges
--  WHERE grantee = 'prisma_asegura_portal' AND table_schema = 'seguros' AND table_name = 'portal_patrimonio_inmueble'
--    AND column_name IN ('catastro_superficie_m2', 'catastro_tipo_vivienda', 'catastro_consultado_en', 'catastro_estado', 'presidente_comunidad')
--  ORDER BY 1, 2;   → SELECT y UPDATE en las cinco
-- SELECT count(*) FROM information_schema.role_table_grants
--  WHERE grantee = 'crm_seguros' AND table_name = 'portal_patrimonio_inmueble';  → 0
-- SELECT count(*) FROM seguros.portal_patrimonio_inmueble WHERE catastro_estado IS NOT NULL OR presidente_comunidad IS NOT NULL;  → 0 antes de estrenar
