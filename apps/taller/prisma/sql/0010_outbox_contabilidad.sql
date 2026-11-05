-- Vertical TALLER — 0010: OUTBOX hacia contabilidad (hechos contables pendientes de enviar) + vínculo con la empresa de contabilidad
-- + coste (opcional) de las líneas de OT para el margen. Requiere 0001-0009. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano
-- como `postgres` (preview → prod tras OK de Alberto). Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md (F2).
--
--  1) `hechos_pendientes`: el hecho se inserta EN LA MISMA transacción que la factura/cobro (nunca HTTP dentro de la transacción);
--     el cron `/api/cron/enviar-hechos` lo envía después, con reintentos. Clave de idempotencia = (taller, tipo, ref), la misma que
--     usa el puerto de contabilidad (empresa, app, tipo, ref): reintentar nunca duplica.
--     Estados: pendiente (por enviar) · enviado (2xx, también el duplicado idempotente) · rechazado (4xx definitivo: no se reintenta,
--     visible en el panel) · error (5xx/red: se reintenta con espera exponencial) · no_soportado (el puerto aún no representa ese
--     hecho: abonos/rectificativas por sustitución/anulaciones; queda anotado, NO se envía ni se inventa).
--  2) `talleres.contabilidad_empresa_id`: empresa de este taller en contabilidad. Solo la fija el OPERADOR (función SECURITY DEFINER,
--     como `fijar_rrhh_empresa` de 0006): si la editara el dueño podría volcar su facturación en OTRA empresa.
--  3) `ot_lineas.coste_cent`: coste TOTAL de la línea (cantidad incluida), NULL = «no se sabe» (nunca 0 por defecto). Sin él no hay
--     margen por OT («sin datos»).
BEGIN;

CREATE TABLE IF NOT EXISTS taller.hechos_pendientes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  factura_id       uuid,
  tipo             text NOT NULL CHECK (tipo IN ('venta','cobro','no_soportado')),
  ref              text NOT NULL CHECK (length(ref) BETWEEN 1 AND 120),
  hecho            jsonb NOT NULL,                      -- HechoContable (sin cuentas) o, en no_soportado, { motivo, ... }
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','rechazado','error','no_soportado')),
  intentos         integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ultimo_error     text,
  proximo_intento  timestamptz,
  enviado_en       timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, tipo, ref),
  CHECK ((tipo = 'no_soportado') = (estado = 'no_soportado'))
);
CREATE INDEX IF NOT EXISTS idx_hechos_pendientes_cola ON taller.hechos_pendientes (taller_id, creado_en) WHERE estado IN ('pendiente','error');

DO $$
BEGIN
  ALTER TABLE taller.hechos_pendientes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE taller.hechos_pendientes FORCE ROW LEVEL SECURITY;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'taller' AND tablename = 'hechos_pendientes') THEN
    CREATE POLICY hechos_pendientes_por_taller ON taller.hechos_pendientes
      USING (taller_id = taller.taller_actual()) WITH CHECK (taller_id = taller.taller_actual());
  END IF;
END $$;

-- Solo-añadir salvo el estado del envío: nada de DELETE; el hecho y su ref no se reescriben.
REVOKE ALL ON taller.hechos_pendientes FROM prisma_taller;
GRANT SELECT, INSERT ON taller.hechos_pendientes TO prisma_taller;
GRANT UPDATE (estado, intentos, ultimo_error, proximo_intento, enviado_en, actualizado_en) ON taller.hechos_pendientes TO prisma_taller;

-- ─── Vínculo con contabilidad: solo el operador ──────────────────────────────
ALTER TABLE taller.talleres ADD COLUMN IF NOT EXISTS contabilidad_empresa_id uuid;
REVOKE UPDATE (contabilidad_empresa_id) ON taller.talleres FROM prisma_taller;

CREATE OR REPLACE FUNCTION taller.fijar_contabilidad_empresa(p_taller uuid, p_empresa uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = taller, pg_temp
AS $$
BEGIN
  UPDATE taller.talleres SET contabilidad_empresa_id = p_empresa, actualizado_en = now() WHERE id = p_taller;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION taller.fijar_contabilidad_empresa(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller.fijar_contabilidad_empresa(uuid, uuid) TO prisma_taller;

-- ─── Coste de las líneas de OT (opcional) ────────────────────────────────────
ALTER TABLE taller.ot_lineas ADD COLUMN IF NOT EXISTS coste_cent bigint;
ALTER TABLE taller.ot_lineas DROP CONSTRAINT IF EXISTS ot_lineas_coste_chk;
ALTER TABLE taller.ot_lineas ADD CONSTRAINT ot_lineas_coste_chk CHECK (coste_cent IS NULL OR coste_cent >= 0);

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT has_column_privilege('prisma_taller', 'taller.talleres', 'contabilidad_empresa_id', 'UPDATE');       → false
-- SELECT has_table_privilege('prisma_taller', 'taller.hechos_pendientes', 'DELETE');                         → false
-- SELECT has_function_privilege('prisma_taller', 'taller.fijar_contabilidad_empresa(uuid,uuid)', 'EXECUTE'); → true
