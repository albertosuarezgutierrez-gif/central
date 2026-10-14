-- Tarificador RPA · Mapfre AUTO (wmediadores · NSEI) (14/10/2026). La fila de integración nace APAGADA (`activo = false`):
-- sin ella `encolarTrabajo` rechaza el ramo (409, fail-closed). Nada se enciende solo: el adaptador
-- (services/tarificador-rpa/src/adapters/mapfre/auto.ts) está SIN registrar y con MAPFRE_AUTO_ACTIVO = false.
-- La enciende Alberto a mano cuando el adaptador esté completo:
--   update seguros.companias_integracion set activo = true where compania = 'mapfre' and ramo = 'auto';
-- Idempotente. No toca ninguna otra fila. Nada de esto emite. Credencial: fly secrets CRED_MAPFRE_WMEDIADORES_USER / _PASS.
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'mapfre' AND ramo = 'auto';
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
    (v_correduria, 'mapfre', 'auto', 'rpa_autorizada',
     'Autorizada por Alberto 14/10/2026 (wmediadores · NSEI): el bot entra, tarifica, guarda el presupuesto/proyecto y descarga el PDF; nunca emite, contrata, firma, paga ni domicilia sin OK por Telegram y aceptación del cliente. Apagada hasta completar el adaptador y la primera prueba real',
     'MAPFRE_WMEDIADORES', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, max_concurrencia, activo from seguros.companias_integracion where compania = 'mapfre';
