-- Tarificador RPA · Allianz AUTO (Turismos) (15/10/2026). Alberto enciende Turismos para EXPLORAR con riesgos reales: solo tarificar, nunca emitir.
-- El adaptador (services/tarificador-rpa/src/adapters/allianz/auto.ts, AUTO_ACTIVO = true) no tiene mapa: si no reconoce el marco cae en
-- ErrorMapaIncompleto + inventario antes de rellenar nada. Idempotente. No toca ninguna otra fila.
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'allianz' AND ramo = 'auto';
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
    (v_correduria, 'allianz', 'auto', 'rpa_autorizada',
     '15/10/2026 Alberto: explorar Turismos con riesgos reales; solo tarificar, nunca emitir',
     'ALLIANZ_EPAC', 1, true)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, max_concurrencia, activo from seguros.companias_integracion where compania = 'allianz';
