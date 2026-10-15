-- Tarificador RPA · Mapfre HOGAR (wmediadores · Patrimoniales) (15/10/2026). La fila de integración nace APAGADA (`activo = false`):
-- sin ella `encolarTrabajo` rechaza el ramo (409, fail-closed). Nada se enciende solo: el adaptador
-- (services/tarificador-rpa/src/adapters/mapfre/hogar.ts) es un BORRADOR sin registrar y con MAPFRE_HOGAR_ACTIVO = false.
-- La enciende Alberto a mano cuando el adaptador esté completo:
--   update seguros.companias_integracion set activo = true where compania = 'mapfre' and ramo = 'hogar';
-- Idempotente. No toca ninguna otra fila. Nada de esto emite. Credencial: fly secrets CRED_MAPFRE_WMEDIADORES_USER / _PASS.
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'mapfre' AND ramo = 'hogar';
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
    (v_correduria, 'mapfre', 'hogar', 'rpa_autorizada',
     'Autorizada por Alberto 15/10/2026 (wmediadores · Patrimoniales): el bot entra, tarifica y LEE el precio y las garantías de la pantalla; no descarga el PDF, nunca imprime, emite, contrata, firma, paga ni domicilia sin OK por Telegram y aceptación del cliente. Apagada hasta completar el adaptador y la primera prueba real',
     'MAPFRE_WMEDIADORES', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, max_concurrencia, activo from seguros.companias_integracion where compania = 'mapfre';
