-- 2026-10-15d — PRUEBA NOCTURNA DE HUMO del tarificador RPA (esquema). Código: apps/asegura/lib/tarificador-humo*.ts,
-- crons /api/cron/tarificador-humo (03:15 Madrid) y /api/cron/tarificador-humo-informe (04:15); worker: services/tarificador-rpa/src/humo.ts.
--
-- Qué es: cada noche, por cada COMPAÑÍA con integración ACTIVA y `rpa_autorizada` (la primera pareja, orden estable; si alguna pareja suya está en pausa, no se lanza), un trabajo `modo = 'humo'`.
-- El worker solo hace login y llega a la pantalla de inicio del tarificador (nada de datos de clientes, ni «Tarificar», ni
-- alta/emisión/pago). Si alguna compañía falla, UN aviso por Telegram a Alberto; si todo va bien, nada. No cuenta en las
-- estadísticas de tarificación, ni va a la bandeja de fallos, ni entra en la deduplicación de los trabajos reales.
--
-- ⚠️ NO APLICADA. Orden: el código es fail-closed sin ella (`encolarHumo` responde `omitido: sin_esquema_humo` si el CHECK
-- `tarificacion_trabajos_modo_valido` no nombra `humo`). Requiere 2026-10-05_tarificador_rpa.sql y 2026-10-10_tarificador_emision.sql
-- (columna `modo`); NO exige la del explorador (esta migración hace por su cuenta lo que necesita). Tras aplicarla:
--   1. desplegar la imagen del worker con `src/humo.ts` (declara el modo `humo` en `X-Tarificador-Modos`; si no, asegura no le
--      sirve el trabajo y la prueba sale «no llegó a terminar»);
--   2. poner `TARIFICADOR_HUMO_ACTIVO=1` en Vercel (asegura). Sin él no se encola ni se reclama ningún humo.
--
-- Qué hace (una transacción; idempotente):
--   1. `modo` admite 'humo'.
--   2. `cliente_id` pasa a ser opcional SOLO para exploración sintética y humo (CHECK). Un humo va SIN anclas: ni cliente, ni
--      póliza, ni oportunidad, ni trabajo origen, ni presupuesto, ni prima de emisión.
--   3. Un humo acaba `ok` sin tarificación (como una exploración).
--   4. Un humo VIVO por correduría y compañía (no se apilan si una noche no llega a lanzarse).
--
-- Sin datos personales: riesgo `{}`. Se deshace con: DROP INDEX seguros.idx_trabajo_humo_vivo; DROP CONSTRAINT trabajo_humo_sin_anclas;
-- y restaurar los CHECK `tarificacion_trabajos_modo_valido` (sin 'humo'), `trabajo_cliente_salvo_exploracion` (solo exploración) y
-- `trabajo_ok_con_tarificacion` (solo exploración), con ningún trabajo `humo` en la tabla (DELETE ... WHERE modo = 'humo').

BEGIN;

SET search_path = seguros, public;

-- 1. El modo. Se conservan los que ya admitía la tabla (tarificar, emision y, si ya se aplicó el explorador, exploracion).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_modo_valido;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_modo_valido
  CHECK (modo IN ('tarificar', 'emision', 'exploracion', 'humo'));

-- 2. Sin cliente solo para exploración sintética y humo.
ALTER TABLE seguros.tarificacion_trabajos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_cliente_salvo_exploracion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_cliente_salvo_exploracion
  CHECK (modo IN ('exploracion', 'humo') OR cliente_id IS NOT NULL);

-- Un humo no cuelga de nada de la cartera ni de ningún presupuesto/emisión.
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_humo_sin_anclas;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_humo_sin_anclas
  CHECK (modo <> 'humo' OR (cliente_id IS NULL AND poliza_id IS NULL AND oportunidad_id IS NULL AND trabajo_origen_id IS NULL
                            AND presupuesto_id IS NULL AND opcion_id IS NULL AND emision_prima_cents IS NULL));

-- 3. Un humo (como una exploración) termina `ok` sin tarificación.
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_ok_con_tarificacion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_ok_con_tarificacion
  CHECK (estado <> 'ok' OR tarificacion_id IS NOT NULL OR modo IN ('exploracion', 'humo'));

-- 4. Un humo vivo por COMPAÑÍA (un solo login por credencial y noche).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_humo_vivo ON seguros.tarificacion_trabajos (correduria_id, compania)
  WHERE modo = 'humo' AND estado IN ('pendiente', 'en_curso', 'error_reintentable');

COMMIT;

-- Comprobación tras aplicar:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'seguros.tarificacion_trabajos'::regclass and conname in
--      ('tarificacion_trabajos_modo_valido', 'trabajo_cliente_salvo_exploracion', 'trabajo_humo_sin_anclas', 'trabajo_ok_con_tarificacion');
