-- Patrimonio: el TITULAR invita por correo a otra persona a GESTIONAR o a tener TODO su patrimonio (27/10/2026).
-- Caso real: María (titular) autoriza a su marido José, que le lleva los pisos.
-- ⏳ SIN APLICAR: lo aplica Alberto.
--
-- 🚨 Aplícalo desde el EDITOR SQL de Supabase, NO por el MCP: un CHECK no se amplía sin quitar el viejo y el MCP se cuelga
-- con esa sentencia. Es la ÚNICA de borrado de este fichero y solo quita el CHECK viejo de `alcance` de `portal_invitacion`
-- (el nuevo se crea ANTES, en la misma transacción: la tabla nunca se queda sin catálogo).
--
-- 🚨 SQL ANTES que el despliegue: sin él, invitar a patrimonio revienta en el INSERT con 23514 (el código lo convierte en 500;
-- no escribe nada a medias porque el correo sale DESPUÉS de la fila).
--
-- ADITIVA e IDEMPOTENTE. Toda fila que hoy cumple el CHECK viejo cumple el nuevo. Sin columnas nuevas: `schema.prisma` no cambia
-- y no hace falta ningún GRANT (el rol ya inserta y lee `portal_invitacion`).
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · `portal_invitacion.alcance` admite además 'patrimonio_gestion' y 'patrimonio_total' (los mismos dos que
--    `portal_autorizacion` ya admite desde `2026-10-22_portal_patrimonio.sql` §15, APLICADO).
--  · Una invitación de patrimonio es del titular ENTERO: `poliza_id` NULL (espejo de `portal_autorizacion_patrimonio_entera`).
--  · `portal_invitacion_acepta_con_sello` NO cambia: aceptar una de patrimonio exige `autorizacion_id`, como cualquier alcance
--    distinto de 'ninguno'.
SET search_path = seguros, public;

BEGIN;

DO $$
BEGIN
  -- Catálogo ampliado (se crea ANTES de quitar el viejo).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_invitacion_alcance_v2') THEN
    ALTER TABLE seguros.portal_invitacion ADD CONSTRAINT portal_invitacion_alcance_v2
      CHECK (alcance IN ('ver', 'ver_economico', 'ninguno', 'patrimonio_gestion', 'patrimonio_total'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_invitacion_patrimonio_entera') THEN
    ALTER TABLE seguros.portal_invitacion ADD CONSTRAINT portal_invitacion_patrimonio_entera
      CHECK (alcance NOT IN ('patrimonio_gestion', 'patrimonio_total') OR poliza_id IS NULL);
  END IF;
END $$;

ALTER TABLE seguros.portal_invitacion DROP CONSTRAINT IF EXISTS portal_invitacion_alcance;

COMMIT;

-- Comprobación (debe salir el v2 y la de patrimonio; NO el viejo):
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'seguros.portal_invitacion'::regclass AND conname LIKE 'portal_invitacion_%alcance%' OR conname = 'portal_invitacion_patrimonio_entera';
--
-- Marcha atrás (solo si no hay ninguna fila de patrimonio):
--   ALTER TABLE seguros.portal_invitacion ADD CONSTRAINT portal_invitacion_alcance CHECK (alcance IN ('ver', 'ver_economico', 'ninguno'));
--   ALTER TABLE seguros.portal_invitacion DROP CONSTRAINT portal_invitacion_alcance_v2;
--   ALTER TABLE seguros.portal_invitacion DROP CONSTRAINT portal_invitacion_patrimonio_entera;
