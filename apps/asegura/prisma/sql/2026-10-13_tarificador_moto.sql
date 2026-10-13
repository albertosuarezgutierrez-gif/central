-- Tarificador RPA · Allianz MOTO (13/10/2026). La fila de integración nace APAGADA (`activo = false`): sin ella
-- `encolarTrabajo` rechaza el ramo (409, fail-closed). La enciende Alberto a mano para la primera prueba real:
--   update seguros.companias_integracion set activo = true where compania = 'allianz' and ramo = 'moto';
-- Idempotente. No toca la fila de Comunidades. Nada de esto emite: el worker solo tarifica (y el avance de pestaña
-- autorizado puede dejar un PROYECTO en Allianz, nunca una póliza).
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
    (v_correduria, 'allianz', 'moto', 'rpa_autorizada',
     'Autorizada por Alberto 05/10/2026 (ePAC); avance de pestaña de Moto autorizado el 13/10/2026. Apagada hasta la primera prueba real',
     'ALLIANZ_EPAC', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;
