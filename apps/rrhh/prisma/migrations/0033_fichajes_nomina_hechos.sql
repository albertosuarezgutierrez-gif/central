-- N2 + N3 de nóminas (06/11/2026). Aditiva e idempotente. NO aplicada a la BD real desde el código.
-- Aplicar ANTES de desplegar: la corrección de fichajes, el panel de nóminas y el cron de hechos leen estas columnas/tabla.

-- ── N2: aprobación de fichajes (solo los APROBADOS alimentan las propuestas de horas extra) ──────────────────────
-- NULL = «no se sabe / sin aprobar»: los fichajes anteriores NO cuentan hasta que el responsable los apruebe.
ALTER TABLE rrhh.fichajes
  ADD COLUMN IF NOT EXISTS aprobado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS aprobado_por text;
CREATE INDEX IF NOT EXISTS idx_fichajes_empresa_empleado_entrada ON rrhh.fichajes (empresa_id, empleado_id, entrada_at);

-- Incidencias que vienen de fichajes: clave estable (idempotencia: aprobar dos veces la misma propuesta no duplica)
-- y fichajes de origen (para enlazar el panel con ellos).
ALTER TABLE rrhh.incidencias_mes
  ADD COLUMN IF NOT EXISTS origen             text,
  ADD COLUMN IF NOT EXISTS origen_clave       text,
  ADD COLUMN IF NOT EXISTS origen_fichaje_ids uuid[];
CREATE UNIQUE INDEX IF NOT EXISTS incidencias_mes_origen_clave_uq
  ON rrhh.incidencias_mes (nomina_id, origen_clave) WHERE origen_clave IS NOT NULL;

-- ── N3: contabilidad de nóminas ──────────────────────────────────────────────────────────────────────────────────
-- Empresa de contabilidad a la que se envían los hechos (solo la fija el operador, junto con el módulo `contabilidad_nominas`,
-- que se apaga por defecto: sin fila activa no se encola nada).
ALTER TABLE rrhh.empresa_modulos ADD COLUMN IF NOT EXISTS contabilidad_empresa_id uuid;

-- OUTBOX hacia `POST {CONTABILIDAD_URL}/api/hechos`. El hecho se inserta en la MISMA transacción que la confirmación de la nómina;
-- el envío (HTTP) lo hace el cron. Idempotente por (empresa_id, tipo, ref): `nomina:<id>`.
CREATE TABLE IF NOT EXISTS rrhh.hechos_nominas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid        NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  nomina_id        uuid        NOT NULL REFERENCES rrhh.nominas(id) ON DELETE CASCADE,
  tipo             text        NOT NULL CHECK (tipo IN ('nomina', 'pago')),
  ref              text        NOT NULL,
  hecho            jsonb       NOT NULL,
  estado           text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'rechazado', 'error')),
  intentos         integer     NOT NULL DEFAULT 0,
  ultimo_error     text,
  proximo_intento  timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz,
  enviado_en       timestamptz,
  UNIQUE (empresa_id, tipo, ref)
);
CREATE INDEX IF NOT EXISTS idx_hechos_nominas_cola ON rrhh.hechos_nominas (estado, creado_en) WHERE estado IN ('pendiente', 'error');
ALTER TABLE rrhh.hechos_nominas ENABLE ROW LEVEL SECURITY;
-- Sin DELETE: la cola es un registro; lo enviado se conserva.
GRANT SELECT, INSERT, UPDATE ON rrhh.hechos_nominas TO rrhh_app;
