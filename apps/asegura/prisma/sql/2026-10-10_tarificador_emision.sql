-- 2026-10-10 — EMISIÓN asistida por el robot del tarificador, con autorización de Alberto por Telegram.
-- Diseño: docs/TARIFICADOR-EMISION-DISENO.md · lógica pura: packages/module-tarificacion/src/emision.ts.
--
-- Decisiones de Alberto (10/10/2026): sin tope diario; solo él solicita y autoriza; la solicitud espera 24 h; tolerancia
-- de precio 0 €; precondición = presupuesto aceptado y firmado con IPID registrado (`ipid_huella`, se rechazan los
-- aceptados antes de este cambio); anulación de la póliza sustituida MANUAL; solo Allianz Comunidades.
--
-- Qué hace (ADITIVA):
--   1. `tarificacion_trabajos`: `modo` (tarificar | emision), `presupuesto_id`, `opcion_id`, `trabajo_origen_id` (la
--      tarificación cuyo riesgo se emite), la prima LEÍDA en la pantalla previa y el hash de datos, cuándo se pidió el
--      botón (24 h) y si ya se mandó el Telegram. Estados nuevos: pendiente_autorizacion_emision, autorizado_emision,
--      emitido. Un solo trabajo de emisión VIVO por presupuesto (índice único parcial; `requiere_humano` cuenta como
--      vivo: un estado incierto bloquea pedir otro hasta que una persona lo cancele).
--   2. `presupuesto.ipid_huella`: la huella del IPID de la opción aceptada, copiada AL FIRMAR (presupuesto-aceptacion.ts).
--   3. `tarificacion_emision_autorizacion`: la autorización de Alberto + el token de un solo uso (SOLO su SHA-256; el
--      token en claro se entrega una vez al worker y no se guarda) + el desenlace. Sin DELETE para el rol de la app.
--
-- Orden de despliegue: aplicar ESTE SQL antes de encender `TARIFICADOR_EMISION_ACTIVA=1`. Sin el SQL, el código de
-- asegura responde 503 `emision_sin_esquema` y la firma del portal sigue como hoy (no escribe `ipid_huella`).
-- Reversible: DROP TABLE de la autorización, DROP de columnas/índice y restaurar el CHECK de estado original.

BEGIN;

ALTER TABLE seguros.tarificacion_trabajos
  ADD COLUMN IF NOT EXISTS modo                  text NOT NULL DEFAULT 'tarificar',
  ADD COLUMN IF NOT EXISTS presupuesto_id        uuid REFERENCES seguros.presupuesto (id),
  ADD COLUMN IF NOT EXISTS opcion_id             uuid REFERENCES seguros.presupuesto_opcion (id),
  ADD COLUMN IF NOT EXISTS trabajo_origen_id     uuid REFERENCES seguros.tarificacion_trabajos (id),
  ADD COLUMN IF NOT EXISTS emision_prima_cents   integer CHECK (emision_prima_cents IS NULL OR emision_prima_cents > 0),
  ADD COLUMN IF NOT EXISTS emision_hash_datos    text CHECK (emision_hash_datos IS NULL OR emision_hash_datos ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS emision_pedida_at     timestamptz,
  ADD COLUMN IF NOT EXISTS emision_avisada_at    timestamptz,
  ADD COLUMN IF NOT EXISTS emision_numero_poliza text;

ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_modo_valido;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_modo_valido CHECK (modo IN ('tarificar', 'emision'));
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_emision_con_presupuesto;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_emision_con_presupuesto
  CHECK (modo <> 'emision' OR (presupuesto_id IS NOT NULL AND opcion_id IS NOT NULL AND trabajo_origen_id IS NOT NULL));
-- Esperar el botón exige saber QUÉ se autoriza (prima leída y hash) y desde cuándo (24 h).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_pendiente_autorizacion_con_datos;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_pendiente_autorizacion_con_datos
  CHECK (estado NOT IN ('pendiente_autorizacion_emision', 'autorizado_emision')
         OR (modo = 'emision' AND emision_prima_cents IS NOT NULL AND emision_hash_datos IS NOT NULL AND emision_pedida_at IS NOT NULL));
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_emitido_es_emision;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_emitido_es_emision CHECK (estado <> 'emitido' OR modo = 'emision');

-- Ampliar el CHECK de estado (nombre automático de la migración 2026-10-05_tarificador_rpa).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_estado_check;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_estado_check CHECK (estado IN (
  'pendiente', 'en_curso', 'ok', 'error_reintentable', 'error_definitivo', 'requiere_humano', 'cancelado',
  'pendiente_autorizacion_emision', 'autorizado_emision', 'emitido'));

-- Si el CHECK original tuviera otro nombre, seguiría vivo y rechazaría los estados nuevos: se aborta la migración.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'seguros.tarificacion_trabajos'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%estado%''pendiente''%' AND pg_get_constraintdef(oid) NOT LIKE '%emitido%') > 0 THEN
    RAISE EXCEPTION 'queda un CHECK de estado antiguo en tarificacion_trabajos: bórralo a mano antes de seguir';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_emision_vivo ON seguros.tarificacion_trabajos (presupuesto_id)
  WHERE modo = 'emision' AND estado NOT IN ('cancelado', 'error_definitivo');
CREATE INDEX IF NOT EXISTS tarificacion_trabajos_emision_espera
  ON seguros.tarificacion_trabajos (correduria_id, estado, emision_pedida_at)
  WHERE modo = 'emision';

ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS ipid_huella text;
COMMENT ON COLUMN seguros.presupuesto.ipid_huella IS
  'SHA-256 del IPID de la opción aceptada, copiado al firmar. NULL = no consta (los aceptados antes del 10/10/2026 '
  'también): el robot NO emite sin él.';

CREATE TABLE IF NOT EXISTS seguros.tarificacion_emision_autorizacion (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id             uuid NOT NULL REFERENCES seguros.tarificacion_trabajos (id),
  correduria_id          uuid NOT NULL REFERENCES seguros.corredurias (id),
  -- SHA-256 del token. NULL hasta que se entrega al worker (UNA sola entrega: `token_hash IS NULL` en el UPDATE).
  token_hash             text UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  hash_datos             text NOT NULL CHECK (hash_datos ~ '^[0-9a-f]{64}$'),
  prima_cents            integer NOT NULL CHECK (prima_cents > 0),
  -- id del botón del portal que este permiso abre (p. ej. `aceptar`). Va también dentro de hash_datos.
  boton                  text NOT NULL,
  autorizado_por         text NOT NULL,              -- user id de Telegram
  autorizado_at          timestamptz NOT NULL DEFAULT now(),
  expira_at              timestamptz NOT NULL,
  entregado_at           timestamptz,
  consumido_at           timestamptz,
  evidencia_previa_id    uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL,
  evidencia_posterior_id uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL,
  numero_poliza          text,
  resultado              text CHECK (resultado IN ('emitida', 'hash_distinto', 'caducada', 'fallo', 'incierto', 'rechazado_canje')),
  CONSTRAINT emision_token_15_min CHECK (expira_at <= autorizado_at + interval '15 minutes'),
  CONSTRAINT emision_consumo_con_token CHECK (consumido_at IS NULL OR token_hash IS NOT NULL)
);
-- Una autorización por trabajo: doble pulsación / reenvío del webhook = la segunda no inserta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_emision_autorizacion_por_trabajo ON seguros.tarificacion_emision_autorizacion (trabajo_id);

COMMENT ON TABLE seguros.tarificacion_emision_autorizacion IS
  'Autorización de Alberto (Telegram) para que el robot pulse UN botón de emisión UNA vez. Token solo como SHA-256, '
  'atado a trabajo + hash de datos (prima, opción, riesgo, botón). Rastro de auditoría: sin DELETE.';

-- Inmutabilidad (revisión de seguridad 10/10/2026): una autorización CONSUMIDA no vuelve a estar disponible
-- (consumido_at no se borra ni se cambia) y el token entregado no se sustituye (token_hash no cambia una vez puesto).
-- Así, ni un bug ni el rol de la app pueden «recargar» un permiso de emisión ya gastado. Idempotente.
CREATE OR REPLACE FUNCTION seguros.tarificacion_emision_autorizacion_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.consumido_at IS NOT NULL AND NEW.consumido_at IS DISTINCT FROM OLD.consumido_at THEN
    RAISE EXCEPTION 'tarificacion_emision_autorizacion %: consumido_at no se puede deshacer ni cambiar', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.token_hash IS NOT NULL AND NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
    RAISE EXCEPTION 'tarificacion_emision_autorizacion %: token_hash no se puede cambiar una vez entregado', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tarificacion_emision_autorizacion_inmutable ON seguros.tarificacion_emision_autorizacion;
CREATE TRIGGER tarificacion_emision_autorizacion_inmutable
  BEFORE UPDATE ON seguros.tarificacion_emision_autorizacion
  FOR EACH ROW EXECUTE FUNCTION seguros.tarificacion_emision_autorizacion_inmutable();

ALTER TABLE seguros.tarificacion_emision_autorizacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificacion_emision_autorizacion FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificacion_emision_autorizacion TO prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select modo, estado, count(*) from seguros.tarificacion_trabajos group by 1, 2;   -- todo 'tarificar'
--   select count(*) from seguros.presupuesto where ipid_huella is not null;             -- 0 (se llena al firmar)
-- Ensayo (BEGIN … ROLLBACK):
--   · insertar un trabajo modo 'emision' sin presupuesto_id → 23514;
--   · dos trabajos 'emision' vivos con el mismo presupuesto_id → 23505;
--   · una autorización con expira_at = autorizado_at + 16 min → 23514;
--   · update … set consumido_at = null (o token_hash = otro) sobre una consumida/entregada → 23514 (trigger).
-- Resolver una emisión INCIERTA (bloquea pedir otra del mismo presupuesto) tras mirar ePAC, a mano:
--   update seguros.tarificacion_emision_autorizacion set resultado = 'emitida' | 'fallo', numero_poliza = '…'
--   where trabajo_id = '…' and resultado is distinct from 'emitida';
-- ════════════════════════════════════════════════════════════════════════════
