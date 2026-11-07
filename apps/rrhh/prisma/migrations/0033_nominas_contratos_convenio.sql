-- Nóminas P2 (07/11/2026): contratos con inicio/fin/duración, bajas, IBAN/NIF, tablas salariales de convenio a mano,
-- incidencias recurrentes, emisión a contabilidad y sello de la remesa SEPA. ADITIVA e idempotente. NO aplicada a la BD real desde el código.
-- 🚨 Aplicar ANTES de desplegar el código: Prisma lee las columnas nuevas de `contratos_laborales` e `incidencias_mes`
-- (sin ellas, generar/recalcular nóminas y la pantalla de contrato dan 500).
-- Todo NULL-able: NULL = «no se sabe» (filas anteriores a esta migración), nunca «no hay» ni «indefinido».

-- 1) Contrato: fechas reales y duración. `duracion` NULL = no se sabe (el motor marca el desempleo pendiente);
--    `fecha_fin` NULL = no se sabe, salvo `duracion = 'indefinido'` explícita. Un indefinido no lleva fecha de fin.
ALTER TABLE rrhh.contratos_laborales
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin    date,
  ADD COLUMN IF NOT EXISTS duracion     text;
ALTER TABLE rrhh.contratos_laborales DROP CONSTRAINT IF EXISTS contratos_laborales_duracion_ck;
ALTER TABLE rrhh.contratos_laborales ADD CONSTRAINT contratos_laborales_duracion_ck
  CHECK (duracion IS NULL OR duracion IN ('indefinido', 'temporal'));
ALTER TABLE rrhh.contratos_laborales DROP CONSTRAINT IF EXISTS contratos_laborales_fechas_ck;
ALTER TABLE rrhh.contratos_laborales ADD CONSTRAINT contratos_laborales_fechas_ck
  CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio);
ALTER TABLE rrhh.contratos_laborales DROP CONSTRAINT IF EXISTS contratos_laborales_indefinido_sin_fin_ck;
ALTER TABLE rrhh.contratos_laborales ADD CONSTRAINT contratos_laborales_indefinido_sin_fin_ck
  CHECK (duracion IS DISTINCT FROM 'indefinido' OR fecha_fin IS NULL);
-- Cron de vencimientos: contratos activos con fecha de fin, por empresa.
CREATE INDEX IF NOT EXISTS contratos_fecha_fin_idx
  ON rrhh.contratos_laborales (empresa_id, fecha_fin) WHERE activo AND fecha_fin IS NOT NULL;

-- 2) Empleado: baja e IBAN (para el finiquito y la remesa SEPA de nóminas). IBAN en claro, sin espacios, mayúsculas.
ALTER TABLE rrhh.empleados
  ADD COLUMN IF NOT EXISTS fecha_baja  date,
  ADD COLUMN IF NOT EXISTS motivo_baja text,
  ADD COLUMN IF NOT EXISTS iban        text;

-- 3) Empresa: datos del ordenante de la remesa y enlace con la empresa del módulo de contabilidad.
--    `contabilidad_empresa_id` es un id de OTRO schema (contabilidad): sin FK a propósito (puertos, no acoplamiento).
ALTER TABLE rrhh.empresas
  ADD COLUMN IF NOT EXISTS nif                     text,
  ADD COLUMN IF NOT EXISTS iban                    text,
  ADD COLUMN IF NOT EXISTS bic                     text,
  ADD COLUMN IF NOT EXISTS contabilidad_empresa_id uuid;

-- 4) Tablas salariales del convenio, metidas A MANO por el responsable (convenio, año, categoría → importes en CÉNTIMOS).
--    Sin fila para el año = «no se sabe»: el contrato no propone salario (nunca se usa la tabla de otro año).
CREATE TABLE IF NOT EXISTS rrhh.convenio_tablas_salariales (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid        NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  convenio            text        NOT NULL CHECK (length(btrim(convenio)) BETWEEN 1 AND 200),
  anio                smallint    NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  categoria           text        NOT NULL CHECK (length(btrim(categoria)) BETWEEN 1 AND 200),
  salario_base_cent   bigint      NOT NULL CHECK (salario_base_cent > 0),
  -- Plus de convenio mensual y número de pagas: NULL = no se sabe (no 0 ni 12).
  plus_convenio_cent  bigint      CHECK (plus_convenio_cent IS NULL OR plus_convenio_cent >= 0),
  pagas               smallint    CHECK (pagas IS NULL OR pagas IN (12, 14, 15, 16)),
  creada_por          text,
  creada_at           timestamptz NOT NULL DEFAULT now(),
  actualizada_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_convenio_tablas_categoria
  ON rrhh.convenio_tablas_salariales (empresa_id, convenio, anio, lower(btrim(categoria)));
ALTER TABLE rrhh.convenio_tablas_salariales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.convenio_tablas_salariales TO rrhh_app;

-- 5) Incidencias recurrentes. `periodicidad` NULL = incidencia puntual (todas las anteriores a 0033 lo eran).
--    Solo la ORIGINAL (copiada_de NULL) se repite; las copias que genera «Generar borradores» la referencian y no se repiten.
--    `recurrente_hasta` = último periodo (YYYY-MM) en que se copia; NULL = sin fin conocido.
ALTER TABLE rrhh.incidencias_mes
  ADD COLUMN IF NOT EXISTS periodicidad     text,
  ADD COLUMN IF NOT EXISTS recurrente_hasta text,
  ADD COLUMN IF NOT EXISTS copiada_de       uuid REFERENCES rrhh.incidencias_mes(id) ON DELETE SET NULL;
ALTER TABLE rrhh.incidencias_mes DROP CONSTRAINT IF EXISTS incidencias_mes_periodicidad_ck;
ALTER TABLE rrhh.incidencias_mes ADD CONSTRAINT incidencias_mes_periodicidad_ck
  CHECK (periodicidad IS NULL OR periodicidad IN ('mensual', 'trimestral', 'anual'));
ALTER TABLE rrhh.incidencias_mes DROP CONSTRAINT IF EXISTS incidencias_mes_recurrente_hasta_ck;
ALTER TABLE rrhh.incidencias_mes ADD CONSTRAINT incidencias_mes_recurrente_hasta_ck
  CHECK (recurrente_hasta IS NULL OR recurrente_hasta ~ '^\d{4}-(0[1-9]|1[0-2])$');
-- Idempotencia: una copia por (nómina, original).
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencias_copia
  ON rrhh.incidencias_mes (nomina_id, copiada_de) WHERE copiada_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS incidencias_recurrentes_idx
  ON rrhh.incidencias_mes (empresa_id) WHERE periodicidad IS NOT NULL AND copiada_de IS NULL;

-- 6) (Retirado antes de aplicar, 07/11/2026) El aviso de vencimiento de contrato YA NO va al empleado en `rrhh.avisos`: un aviso
--    automático al trabajador podía leerse como preaviso (art. 49.1.c ET). Se muestra al RESPONSABLE en el Inicio de /admin,
--    calculado al vuelo desde `contratos_laborales.fecha_fin` (sin tabla ni columna nueva). `rrhh.avisos` no se toca.

-- 7) Emisión del asiento de la nómina a contabilidad (al confirmar; el cron `/api/cron/reenviar-contabilidad` reintenta los
--    estados reintentables y los NULL de nóminas confirmadas). NULL = nunca intentado (no «no aplica» ni «ok»).
ALTER TABLE rrhh.nominas
  ADD COLUMN IF NOT EXISTS contabilidad_estado     text,
  ADD COLUMN IF NOT EXISTS contabilidad_detalle    text,
  ADD COLUMN IF NOT EXISTS contabilidad_intento_at timestamptz;
ALTER TABLE rrhh.nominas DROP CONSTRAINT IF EXISTS nominas_contabilidad_estado_ck;
ALTER TABLE rrhh.nominas ADD CONSTRAINT nominas_contabilidad_estado_ck CHECK (contabilidad_estado IS NULL OR contabilidad_estado IN
  ('enviado', 'pendiente_regla', 'pendiente_vincular', 'sin_configurar', 'error', 'rechazado', 'no_enviable'));

-- 8) Remesa SEPA de nóminas: sello de generación por nómina, contra el DOBLE PAGO. Al descargar la remesa se anota la hora y el
--    MsgId (determinista por empresa + periodo + contenido) en cada nómina incluida; si alguna ya lo tiene, la descarga responde
--    409 y pide confirmación explícita. NULL = nunca se ha generado remesa con ella desde la app (no «pagada» ni «sin pagar»).
ALTER TABLE rrhh.nominas
  ADD COLUMN IF NOT EXISTS remesa_generada_at timestamptz,
  ADD COLUMN IF NOT EXISTS remesa_msg_id      text;
