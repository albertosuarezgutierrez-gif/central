-- 2026-11-03 — Filas de integración `pelayo/auto` y `pelayo/hogar` para la EXPLORACIÓN IA del tarificador RPA (Pelayo, portal de
-- mediadores https://mediadores.pelayo.com). Mismo patrón que 2026-10-28e_tarificador_fidelidade_hogar.sql.
--
-- ⚠️ NO APLICADA. Sin estas filas, `POST /api/operador/tarificador/exploracion` con `pelayo:presupuestos:auto` / `pelayo:presupuestos:hogar`
--    responde 409 `modo_no_automatizable: sin_integracion` (el endpoint busca por (compania, ramo)).
--
-- Qué hace (idempotente): inserta `pelayo/auto` y `pelayo/hogar`, `rpa_autorizada`, credencial `PELAYO_MEDIADORES` (fly secrets
-- CRED_PELAYO_MEDIADORES_USER / _PASS de asegura-tarificador), concurrencia 1, APAGADAS (`activo = false`). La compuerta de exploración
-- EXIGE `activo = true`: la enciende Alberto para la primera exploración:
--   update seguros.companias_integracion set activo = true where compania = 'pelayo' and ramo in ('auto', 'hogar');
-- Encenderla NO permite tarificar ni emitir: los adaptadores de Pelayo no están implementados (y van tras `PELAYO_ACTIVO`, apagado);
-- solo deja lanzar la exploración (sintética, de SOLO LECTURA: Contratación › Presupuestos › Nuevo Presupuesto › ramo › volcado).
-- Apagar: el mismo update con `activo = false`.
--
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'pelayo' AND ramo IN ('auto', 'hogar');

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
    (v_correduria, 'pelayo', 'auto', 'rpa_autorizada',
     'Solo EXPLORACIÓN IA de solo lectura (portal de mediadores: Contratación › Presupuestos › Nuevo Presupuesto › Auto; Alberto 03/11/2026). Sin adaptador de tarificación. Apagada hasta la primera exploración',
     'PELAYO_MEDIADORES', 1, false),
    (v_correduria, 'pelayo', 'hogar', 'rpa_autorizada',
     'Solo EXPLORACIÓN IA de solo lectura (portal de mediadores: Contratación › Presupuestos › Nuevo Presupuesto › Hogar; Alberto 03/11/2026). Sin adaptador de tarificación. Apagada hasta la primera exploración',
     'PELAYO_MEDIADORES', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

COMMIT;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, activo from seguros.companias_integracion where compania = 'pelayo';
