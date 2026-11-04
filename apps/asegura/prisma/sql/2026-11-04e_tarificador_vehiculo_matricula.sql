-- 2026-11-04e — CONSULTA DE VEHÍCULO POR MATRÍCULA con el bot RPA (gratis) en vez de Avant2 `GET /vehicles?registrationPlate=`
-- (cuesta créditos de Codeoscopic). Código: apps/asegura/lib/tarificador-vehiculo*.ts, rutas /api/operador/tarificador/vehiculo* (operador)
-- y /api/tarificador/vehiculo/resultado (worker); worker: services/tarificador-rpa/src/vehiculo.ts (explorador 0.3.48).
--
-- Qué es: un trabajo `modo = 'vehiculo'` (SIN cliente ni nada de la cartera; riesgo = SOLO `{"matricula": "<normalizada>"}`) hace login en
-- Allianz ePAC, abre Nueva Alta › Autos › Turismos, marca «¿Conoces la matrícula? Sí», teclea la matrícula, pulsa «Encuentra mi vehículo»
-- y LEE marca/modelo/versión/combustible/1ª matriculación. Se PARA ahí: nunca elige tarjeta, nunca pulsa «SIGUIENTE» (TARIFICAR ≠ EMITIR;
-- el worker veta cualquier avance de cotización además del guard). Sin resultado del portal → `sin_resultado` (nunca se inventa).
--
-- Caché 24 h por matrícula: `tarificador_vehiculo_matricula`, clave = HMAC-SHA256(matrícula normalizada) con TARIFICADOR_WORKER_SECRET
-- (la matrícula NO se guarda en claro aquí; rotar el secreto invalida la caché, que solo vive 24 h). El trabajo se PURGA a `{}` al cerrar.
--
-- ⚠️ NO APLICADA. El código es fail-closed sin ella (rutas 503 `vehiculo_sin_esquema`; el CHECK de `modo` no admite 'vehiculo').
-- Requiere 2026-11-03c_tarificador_pilotaje.sql (aplicada: este CHECK la conserva). Tras aplicarla: imagen del worker que declare
-- `vehiculo` en `X-Tarificador-Modos` (si no, asegura no le sirve el trabajo) y TARIFICADOR_VEHICULO_ACTIVO=1 en central-asegura.
--
-- Rollback (con ningún trabajo `vehiculo` en la tabla): bloque ROLLBACK comentado al final.

BEGIN;

SET search_path = seguros, public;

-- 1. El modo (se conservan los vigentes: tarificar, emision, exploracion, humo, pilotaje).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_modo_valido;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_modo_valido
  CHECK (modo IN ('tarificar', 'emision', 'exploracion', 'humo', 'pilotaje', 'vehiculo'));

ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_cliente_salvo_exploracion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_cliente_salvo_exploracion
  CHECK (modo IN ('exploracion', 'humo', 'pilotaje', 'vehiculo') OR cliente_id IS NOT NULL);

ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_ok_con_tarificacion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_ok_con_tarificacion
  CHECK (estado <> 'ok' OR tarificacion_id IS NOT NULL OR modo IN ('exploracion', 'humo', 'pilotaje', 'vehiculo'));

-- Una consulta de vehículo no cuelga de nada de la cartera.
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_vehiculo_sin_anclas;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_vehiculo_sin_anclas
  CHECK (modo <> 'vehiculo' OR (cliente_id IS NULL AND poliza_id IS NULL AND oportunidad_id IS NULL AND trabajo_origen_id IS NULL
                                AND presupuesto_id IS NULL AND opcion_id IS NULL AND emision_prima_cents IS NULL));
-- Su riesgo es SOLO la matrícula normalizada (o `{}` tras la purga). Nada más viaja al worker.
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_vehiculo_riesgo_matricula;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_vehiculo_riesgo_matricula
  CHECK (modo <> 'vehiculo' OR riesgo = '{}'::jsonb
         OR (riesgo = jsonb_build_object('matricula', riesgo->>'matricula') AND (riesgo->>'matricula') ~ '^[A-Z0-9]{4,10}$'));

-- Una consulta viva por correduría y matrícula (dos peticiones seguidas comparten el trabajo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_vehiculo_vivo ON seguros.tarificacion_trabajos (correduria_id, (riesgo->>'matricula'))
  WHERE modo = 'vehiculo' AND estado IN ('pendiente', 'en_curso', 'error_reintentable');

-- 2. La caché (24 h la aplica el código con `consultado_at`). `sin_resultado` también se cachea: Allianz no lo encontró.
CREATE TABLE IF NOT EXISTS seguros.tarificador_vehiculo_matricula (
  correduria_id       uuid NOT NULL REFERENCES seguros.corredurias (id),
  matricula_hash      text NOT NULL CHECK (matricula_hash ~ '^[0-9a-f]{64}$'),
  estado              text NOT NULL CHECK (estado IN ('ok', 'sin_resultado')),
  marca               text CHECK (marca IS NULL OR length(marca) BETWEEN 1 AND 80),
  modelo              text CHECK (modelo IS NULL OR length(modelo) BETWEEN 1 AND 120),
  version             text CHECK (version IS NULL OR length(version) BETWEEN 1 AND 200),
  fecha_matriculacion date,
  combustible         text CHECK (combustible IS NULL OR length(combustible) BETWEEN 1 AND 40),
  fuente              text NOT NULL CHECK (fuente IN ('allianz')),
  trabajo_id          uuid REFERENCES seguros.tarificacion_trabajos (id),
  consultado_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correduria_id, matricula_hash),
  -- `ok` exige al menos marca y modelo; `sin_resultado` no lleva ningún dato del vehículo.
  CONSTRAINT vehiculo_matricula_coherente CHECK (
    (estado = 'ok' AND marca IS NOT NULL AND modelo IS NOT NULL)
    OR (estado = 'sin_resultado' AND marca IS NULL AND modelo IS NULL AND version IS NULL AND fecha_matriculacion IS NULL AND combustible IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_vehiculo_matricula_trabajo ON seguros.tarificador_vehiculo_matricula (trabajo_id);

COMMENT ON TABLE seguros.tarificador_vehiculo_matricula IS
  'Caché 24 h de la consulta de vehículo por matrícula con el bot RPA (Allianz). Clave = HMAC-SHA256 de la matrícula normalizada '
  '(nunca en claro). Solo datos de catálogo del vehículo; sin datos de personas.';

-- 3. Permisos (mismo patrón que tarificador_pilotaje_*): RLS sin policies, nada público, la app sin DELETE (la caché se pisa con upsert).
ALTER TABLE seguros.tarificador_vehiculo_matricula ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_vehiculo_matricula FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_vehiculo_matricula TO prisma_seguros;
REVOKE DELETE ON seguros.tarificador_vehiculo_matricula FROM prisma_seguros;

-- 4. Comprobaciones dentro de la transacción (si algo no cuadra, se aborta todo).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'seguros.tarificacion_trabajos'::regclass
                 AND conname = 'tarificacion_trabajos_modo_valido' AND pg_get_constraintdef(oid) LIKE '%vehiculo%' AND pg_get_constraintdef(oid) LIKE '%pilotaje%') THEN
    RAISE EXCEPTION 'CHECK de modo sin vehiculo/pilotaje';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'seguros.tarificador_vehiculo_matricula'::regclass) THEN
    RAISE EXCEPTION 'RLS sin activar en tarificador_vehiculo_matricula';
  END IF;
  IF has_table_privilege('anon', 'seguros.tarificador_vehiculo_matricula', 'select') THEN
    RAISE EXCEPTION 'anon puede leer la caché de vehículos';
  END IF;
END $$;

COMMIT;

-- Comprobación tras aplicar:
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'seguros.tarificacion_trabajos'::regclass
--     and conname in ('tarificacion_trabajos_modo_valido','trabajo_cliente_salvo_exploracion','trabajo_ok_con_tarificacion',
--                     'trabajo_vehiculo_sin_anclas','trabajo_vehiculo_riesgo_matricula');
--   select relrowsecurity from pg_class where oid = 'seguros.tarificador_vehiculo_matricula'::regclass;            -- t
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_vehiculo_matricula', 'delete');              -- f

-- ROLLBACK (solo con ningún trabajo `vehiculo`: select count(*) from seguros.tarificacion_trabajos where modo = 'vehiculo'; → 0):
-- BEGIN;
-- DROP TABLE IF EXISTS seguros.tarificador_vehiculo_matricula;
-- DROP INDEX IF EXISTS seguros.idx_trabajo_vehiculo_vivo;
-- ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_vehiculo_riesgo_matricula;
-- ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_vehiculo_sin_anclas;
-- ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT tarificacion_trabajos_modo_valido;
-- ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_modo_valido CHECK (modo IN ('tarificar', 'emision', 'exploracion', 'humo', 'pilotaje'));
-- ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT trabajo_cliente_salvo_exploracion;
-- ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_cliente_salvo_exploracion CHECK (modo IN ('exploracion', 'humo', 'pilotaje') OR cliente_id IS NOT NULL);
-- ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT trabajo_ok_con_tarificacion;
-- ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_ok_con_tarificacion CHECK (estado <> 'ok' OR tarificacion_id IS NOT NULL OR modo IN ('exploracion', 'humo', 'pilotaje'));
-- COMMIT;
