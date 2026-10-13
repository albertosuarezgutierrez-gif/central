-- 2026-10-13 — EXPLORADOR IA del tarificador RPA, FASE B (worker + concurrencia). Requiere 2026-10-13_tarificador_explorador.sql.
--
-- ⚠️ NO APLICADA. Sin ella, `/api/tarificador/explorador/paso` y `/cierre` fallan con 503 (la columna nueva no existe) y no
--    se puede encolar Hogar (sin fila de integración → 409). Nada se enciende solo: `TARIFICADOR_EXPLORADOR_ACTIVO` sigue
--    apagado y la fila de integración nace `activo = false`.
--
-- Qué hace (idempotente):
--   1. `tarificador_exploraciones.ia_en_vuelo_hasta`: RESERVA de la llamada de IA. La ruta `paso` ya no tiene la conexión de
--      BD abierta durante la IA (pool de 3; revisión de #4572): toma el try-lock, reserva y suelta; llama a la IA FUERA; y
--      vuelve a tomar el lock para guardar. Mientras la reserva está viva (≤75 s), otro paso o el cierre reciben 409 sin
--      gastar IA. Caducada = libre (una ruta que muera a mitad no bloquea para siempre).
--   2. Fila `allianz/hogar` en `companias_integracion` (APAGADA): la misma compuerta que mira `reclamarSiguiente` para
--      lanzar una exploración de Hogar. Encenderla NO permite tarificar Hogar (no hay adaptador ni `encolar` de ese ramo):
--      solo deja lanzar la exploración. La enciende Alberto:
--        update seguros.companias_integracion set activo = true where compania = 'allianz' and ramo = 'hogar';
--
-- Se deshace con: ALTER TABLE seguros.tarificador_exploraciones DROP COLUMN ia_en_vuelo_hasta;
--                 DELETE FROM seguros.companias_integracion WHERE compania = 'allianz' AND ramo = 'hogar';

BEGIN;

ALTER TABLE seguros.tarificador_exploraciones ADD COLUMN IF NOT EXISTS ia_en_vuelo_hasta timestamptz;

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
    (v_correduria, 'allianz', 'hogar', 'rpa_autorizada',
     'Solo EXPLORACIÓN IA (Alberto 13/10/2026: Hogar, «Aceptar» de Datos básicos autorizado, puede quedar proyecto). Sin adaptador de tarificación. Apagada hasta la primera exploración',
     'ALLIANZ_EPAC', 1, false)
  ON CONFLICT (correduria_id, compania, ramo) DO NOTHING;
END
$seed$;

COMMIT;

-- Comprobación tras aplicar:
--   select column_name from information_schema.columns where table_schema = 'seguros' and table_name = 'tarificador_exploraciones' and column_name = 'ia_en_vuelo_hasta';
--   select compania, ramo, modo, activo from seguros.companias_integracion where compania = 'allianz';
