-- Tarificador RPA · Mapfre MOTO (wmediadores · NSEI, mismo flujo «Turismos y Motos» que el coche) (14/10/2026).
-- La fila nace APAGADA (`activo = false`): sin ella activa `encolarTrabajo` rechaza el ramo (409, fail-closed). El adaptador
-- `mapfreMoto` solo existe en la máquina con el fly secret TARIFICADOR_MAPFRE_ACTIVO=1 (apagado por defecto).
-- Para la PRUEBA REAL (autorizada por Alberto el 14/10/2026), a mano y solo durante la prueba:
--   update seguros.companias_integracion set activo = true where compania = 'mapfre' and ramo = 'moto';
-- y al acabar, salvo que funcione de punta a punta hasta precio:
--   update seguros.companias_integracion set activo = false where compania = 'mapfre';
-- Idempotente. No toca ninguna otra fila. Nada de esto emite. Credencial: fly secrets CRED_MAPFRE_WMEDIADORES_USER / _PASS.
-- Se deshace con: DELETE FROM seguros.companias_integracion WHERE compania = 'mapfre' AND ramo = 'moto';
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
    (v_correduria, 'mapfre', 'moto', 'rpa_autorizada',
     'Autorizada por Alberto 14/10/2026 (wmediadores · NSEI, coche y moto): el bot entra, tarifica, guarda el presupuesto/proyecto y descarga el PDF; nunca emite, contrata, firma, paga ni domicilia sin OK por Telegram y aceptación del cliente. Apagada salvo durante la prueba real',
     'MAPFRE_WMEDIADORES', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

-- Comprobación tras aplicar:
--   select compania, ramo, modo, credencial_clave, max_concurrencia, activo from seguros.companias_integracion where compania = 'mapfre';
