-- ⏳ SIN APLICAR (27/10/2026). Se aplica solo con OK de Alberto y en el MISMO paso que el despliegue de asegura-portal que la usa
--    (regla del portal). 🚨 GRANT antes que schema: `schema.prisma` declara el modelo con EXACTAMENTE las columnas que aquí se
--    conceden en SELECT (cepo `test/regression-portal-patrimonio-sql.test.ts`). Sin esta DDL, la pantalla «Invita a otro
--    propietario» y el cálculo del cupo de IA caen con 42P01 / 42501 (el cupo lo toma como «sin recompensa», nunca como error).
-- Patrimonio — RECOMENDACIÓN ENTRE PROPIETARIOS (27/10/2026, punto 9 de `docs/ESTUDIO-PATRIMONIO-MERCADO.md` §7).
-- ADITIVA e IDEMPOTENTE: una tabla nueva, sin tocar ninguna existente.
--
-- ── Reglas que sostiene esta DDL (el código no puede garantizarlas solo) ─────
--  1. La identidad del invitado es el CORREO y aquí solo vive su HASH (`hashCanal`, misma pimienta que `portal_canal`): jamás el
--     correo en claro, ni un teléfono. El portal NO envía nada: la persona comparte ella el texto.
--  2. Una recomendación VIVA (ni anulada ni canjeada) por par (quien recomienda, correo): reintentar no duplica filas.
--  3. Un invitado da UNA sola recompensa: `canjeada_por_identidad_id` es único.
--  4. Quién recomendó a quién y cuándo queda registrado (`recomendador_identidad_id`, `canjeada_por_identidad_id`, `creado_en`,
--     `canjeada_en`) para el panel de conversión de Alberto. Nada de eso se devuelve al cliente (la lista no dice a quién invitó).
--  5. Inmutable salvo los sellos de anulación y de canje; un canje no se deshace ni se re-fecha ni se anula después.
--  6. Rol `prisma_asegura_portal`: GRANT por COLUMNAS y sin borrado. `crm_seguros`: REVOKE ALL (el correo hasheado de un tercero
--     que aún no es cliente no es un lead).
--  La recompensa (cupo de IA «amplio» 90 días) NO se guarda: se CALCULA desde `canjeada_en` (`recompensaRecomendacionVigente`).
SET search_path = seguros, public;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_recomendacion (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recomendador_identidad_id   uuid NOT NULL REFERENCES seguros.portal_identidad (id) ON DELETE CASCADE,
  correo_hash                 text NOT NULL CHECK (char_length(correo_hash) BETWEEN 16 AND 200),
  creado_en                   timestamptz NOT NULL DEFAULT now(),
  caduca_en                   timestamptz NOT NULL,
  anulado_en                  timestamptz,
  canjeada_por_identidad_id   uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  canjeada_en                 timestamptz,
  CONSTRAINT portal_patrimonio_recomendacion_canje_con_fecha CHECK (canjeada_por_identidad_id IS NULL OR canjeada_en IS NOT NULL),
  CONSTRAINT portal_patrimonio_recomendacion_no_anulada_y_canjeada CHECK (anulado_en IS NULL OR canjeada_en IS NULL)
);

-- Regla 2: una viva por par.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_recomendacion_viva
  ON seguros.portal_patrimonio_recomendacion (recomendador_identidad_id, correo_hash)
  WHERE anulado_en IS NULL AND canjeada_en IS NULL;
-- Regla 3: un invitado, una recompensa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_recomendacion_invitado
  ON seguros.portal_patrimonio_recomendacion (canjeada_por_identidad_id)
  WHERE canjeada_por_identidad_id IS NOT NULL;
-- Búsqueda del canje: por el hash del correo, solo las pendientes.
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_recomendacion_pendiente
  ON seguros.portal_patrimonio_recomendacion (correo_hash)
  WHERE anulado_en IS NULL AND canjeada_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_recomendacion_recomendador
  ON seguros.portal_patrimonio_recomendacion (recomendador_identidad_id, creado_en DESC);

-- Regla 5: solo se sellan la anulación y el canje; ninguno se deshace.
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_recomendacion_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.recomendador_identidad_id IS DISTINCT FROM OLD.recomendador_identidad_id
     OR NEW.correo_hash IS DISTINCT FROM OLD.correo_hash
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
     OR NEW.caduca_en IS DISTINCT FROM OLD.caduca_en THEN
    RAISE EXCEPTION 'portal_patrimonio_recomendacion: solo admite los sellos de anulacion y canje' USING ERRCODE = '23514';
  END IF;
  IF OLD.anulado_en IS NOT NULL AND NEW.anulado_en IS DISTINCT FROM OLD.anulado_en THEN
    RAISE EXCEPTION 'portal_patrimonio_recomendacion: una anulacion no se deshace ni se vuelve a fechar' USING ERRCODE = '23514';
  END IF;
  -- `canjeada_por_identidad_id` → NULL sí pasa: es el ON DELETE SET NULL de la FK (la acción referencial dispara este trigger) al
  -- borrar la identidad del invitado; sin esto la supresión de esa identidad falla. `canjeada_en` se queda: el canje sigue hecho.
  IF OLD.canjeada_en IS NOT NULL
     AND (NEW.canjeada_en IS DISTINCT FROM OLD.canjeada_en
          OR (NEW.canjeada_por_identidad_id IS DISTINCT FROM OLD.canjeada_por_identidad_id AND NEW.canjeada_por_identidad_id IS NOT NULL))
     AND OLD.canjeada_por_identidad_id IS NOT NULL THEN
    RAISE EXCEPTION 'portal_patrimonio_recomendacion: un canje no se deshace ni se vuelve a fechar' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER portal_patrimonio_recomendacion_inmutable
  BEFORE UPDATE ON seguros.portal_patrimonio_recomendacion
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_recomendacion_inmutable();

-- ─── Permisos (regla 6) ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE seguros.portal_patrimonio_recomendacion DISABLE ROW LEVEL SECURITY;

GRANT SELECT (id, recomendador_identidad_id, correo_hash, creado_en, caduca_en, anulado_en, canjeada_por_identidad_id, canjeada_en)
  ON seguros.portal_patrimonio_recomendacion TO prisma_asegura_portal;
GRANT INSERT (recomendador_identidad_id, correo_hash, caduca_en)
  ON seguros.portal_patrimonio_recomendacion TO prisma_asegura_portal;
GRANT UPDATE (anulado_en, canjeada_por_identidad_id, canjeada_en)
  ON seguros.portal_patrimonio_recomendacion TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_recomendacion FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT grantee, privilege_type, count(*) FROM information_schema.column_privileges
--  WHERE table_schema = 'seguros' AND table_name = 'portal_patrimonio_recomendacion' GROUP BY 1, 2 ORDER BY 1, 2;
--   -- prisma_asegura_portal: SELECT 8 · INSERT 3 · UPDATE 3. crm_seguros: 0 filas.
