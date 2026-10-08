-- Tarificador RPA (08/10/2026): TRAZA por trabajo + VERSIÓN del bot.
--
-- ⚠️ NO APLICADA. Aplicar ANTES de desplegar el código que la nombra (`registrarResultado` escribe en
--    `tarificacion_trabajo_pasos` y en `tarificacion_trabajos.bot_version`). Aditivo y con NULL por defecto:
--    aplicarla antes no rompe nada que exista hoy. Requiere haber aplicado 2026-10-05_tarificador_rpa.sql.
--
-- Qué hace (una transacción; idempotente):
--   1. `tarificacion_trabajos.bot_version`: versión semver del adaptador que ejecutó el trabajo (NULL = anterior a
--      este cambio o no informada). Se escribe al TERMINAR el trabajo (ok o error).
--   2. `tarificacion_trabajo_pasos`: una fila por paso del bot (login, navegación, formulario, tarificar, lectura de
--      primas): nombre del paso, inicio, duración, ok y, si falló, un CÓDIGO de error (infra, portal, datos…).
--
-- 🔒 NADA de datos personales ni valores de formulario: solo nombre de paso, tiempos y código de error. El mensaje
--    de error (ya redactado) sigue viviendo en `tarificacion_trabajos.error`. `captura_ref` = 'documento:<uuid>'
--    de la captura del fallo (la misma que `evidencia_documento_id`), o NULL.
-- 🛡️ Inmutable como el rastro que es: SELECT + INSERT, sin UPDATE ni DELETE. Solo `prisma_seguros`.
--
-- Se deshace con: drop table seguros.tarificacion_trabajo_pasos; alter table seguros.tarificacion_trabajos drop column bot_version.
BEGIN;

SET search_path = seguros, public;

ALTER TABLE seguros.tarificacion_trabajos ADD COLUMN IF NOT EXISTS bot_version text;
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_bot_version_semver;
ALTER TABLE seguros.tarificacion_trabajos
  ADD CONSTRAINT tarificacion_trabajos_bot_version_semver CHECK (bot_version IS NULL OR bot_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$');

COMMENT ON COLUMN seguros.tarificacion_trabajos.bot_version IS
  'Versión semver del adaptador del worker que terminó el trabajo (p. ej. 0.1.0). NULL = no informada.';

CREATE TABLE IF NOT EXISTS seguros.tarificacion_trabajo_pasos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id     uuid NOT NULL REFERENCES seguros.tarificacion_trabajos (id),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  paso           text NOT NULL CHECK (paso ~ '^[a-z0-9_]{1,40}$'),
  inicio         timestamptz NOT NULL,
  duracion_ms    integer NOT NULL CHECK (duracion_ms BETWEEN 0 AND 3600000),
  ok             boolean NOT NULL,
  error_codigo   text CHECK (error_codigo IS NULL OR error_codigo ~ '^[a-z0-9_]{1,40}$'),
  captura_ref    text CHECK (captura_ref IS NULL OR captura_ref ~ '^documento:[0-9a-f-]{36}$'),
  CONSTRAINT paso_ok_sin_error CHECK (NOT ok OR (error_codigo IS NULL AND captura_ref IS NULL))
);

CREATE INDEX IF NOT EXISTS tarificacion_trabajo_pasos_por_trabajo
  ON seguros.tarificacion_trabajo_pasos (correduria_id, trabajo_id, inicio);

COMMENT ON TABLE seguros.tarificacion_trabajo_pasos IS
  'Traza de un trabajo del tarificador RPA: un paso por fila (nombre, inicio, duración, ok, código de error). '
  'Sin datos personales ni valores de formulario. Inmutable (sin UPDATE/DELETE).';

ALTER TABLE seguros.tarificacion_trabajo_pasos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificacion_trabajo_pasos FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT ON seguros.tarificacion_trabajo_pasos TO prisma_seguros;

COMMIT;

-- Comprobación tras aplicar:
--   select column_name from information_schema.columns where table_schema='seguros' and table_name='tarificacion_trabajos' and column_name='bot_version';  -- 1 fila
--   select grantee, privilege_type from information_schema.role_table_grants where table_name='tarificacion_trabajo_pasos';  -- solo prisma_seguros: SELECT, INSERT
