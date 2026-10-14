-- 2026-10-14 — Alta de OCCIDENT · hogar en `seguros.companias_integracion` (APAGADA).
--
-- Motivo: Alberto (14/10/2026) autoriza dar de alta Occident (código DGS C0468) para el tarificador RPA, igual que
--   allianz/hogar y mapfre/auto. Nace `activo = false`: aún no hay adaptador ni entrada del explorador registrados.
--   Credencial: fly secrets CRED_OCCIDENT_PORTAL_USER / CRED_OCCIDENT_PORTAL_PASS (los pone Alberto; aquí solo el nombre).
--   La enciende Alberto cuando el adaptador esté listo:
--     update seguros.companias_integracion set activo = true where compania = 'occident' and ramo = 'hogar';
--
-- Idempotente (ON CONFLICT sobre la clave única correduria_id+compania+ramo). Solo INSERT de una fila; no toca otras.
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'occident' AND ramo = 'hogar';
--
-- APLICADA 14/10/2026 (proyecto Supabase «central»).

BEGIN;

DO $seed$
DECLARE
  v_correduria uuid;
  v_n integer;
BEGIN
  SELECT count(*)::int INTO v_n FROM seguros.corredurias WHERE nombre = 'Grupo ASegura';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'companias_integracion: se esperaba UNA correduría «Grupo ASegura» y hay %', v_n;
  END IF;
  SELECT id INTO v_correduria FROM seguros.corredurias WHERE nombre = 'Grupo ASegura';
  INSERT INTO seguros.companias_integracion
    (correduria_id, compania, ramo, modo, nota_autorizacion, credencial_clave, max_concurrencia, activo)
  VALUES
    (v_correduria, 'occident', 'hogar', 'rpa_autorizada',
     'Alta autorizada por Alberto 14/10/2026 (Occident, C0468). Solo exploración/tarificación como mediador, sin emitir. Apagada hasta tener adaptador y credencial CRED_OCCIDENT_PORTAL_*',
     'OCCIDENT_PORTAL', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

COMMIT;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, max_concurrencia, activo from seguros.companias_integracion where compania = 'occident';
