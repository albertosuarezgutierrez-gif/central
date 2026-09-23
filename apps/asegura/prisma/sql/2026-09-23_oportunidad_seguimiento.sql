-- 2026-09-23 — Seguimiento de oportunidades (Fase 1 de ASegura OS, PR B).
--
-- ADITIVA: solo columnas nuevas (todas NULL), una tabla nueva y un índice.
-- No toca ninguna fila existente: las 3.676 oportunidades heredadas siguen en
-- `competencia` con sus columnas nuevas a NULL.
--
-- Qué añade:
--   1. `oportunidades`: motivo de pérdida estructurado (+ detalle, compañía y
--      prima que ganaron), `aparcada_hasta` y `cerrada_at`.
--   2. CHECK: una oportunidad `perdida` SIN motivo no puede existir. Se pone en
--      la BD y no solo en el código porque un UPDATE escrito a mano también
--      tiene que respetarlo (hoy hay 0 perdidas, así que valida sin tocar nada).
--   3. `oportunidad_historial`: append-only (trigger que rechaza UPDATE/DELETE),
--      una fila por cada cambio con antes/después y quién.
--
-- Reversible: `DROP TABLE seguros.oportunidad_historial` + `ALTER TABLE ...
-- DROP COLUMN` de las seis columnas y los dos CHECK.

ALTER TABLE seguros.oportunidades
  ADD COLUMN IF NOT EXISTS motivo_perdida          text,
  ADD COLUMN IF NOT EXISTS motivo_perdida_detalle  text,
  ADD COLUMN IF NOT EXISTS competidor              text,
  ADD COLUMN IF NOT EXISTS prima_competidor        numeric(12,2),
  ADD COLUMN IF NOT EXISTS aparcada_hasta          date,
  ADD COLUMN IF NOT EXISTS cerrada_at              timestamptz;

-- La lista es la de `MOTIVOS_PERDIDA` de @central/module-seguros; si una cambia,
-- la otra también (lo vigila oportunidad-seguimiento.test.ts en el paquete).
ALTER TABLE seguros.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_motivo_perdida_ck;
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_motivo_perdida_ck CHECK (
  motivo_perdida IS NULL OR motivo_perdida IN
    ('precio','competidor','coberturas','cliente_desiste','sin_respuesta','no_contactable','ya_asegurado','otro')
);

ALTER TABLE seguros.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_perdida_con_motivo_ck;
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_perdida_con_motivo_ck CHECK (
  estado <> 'perdida' OR motivo_perdida IS NOT NULL
);

CREATE TABLE IF NOT EXISTS seguros.oportunidad_historial (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias(id),
  oportunidad_id  uuid NOT NULL REFERENCES seguros.oportunidades(id),
  accion          text NOT NULL,
  estado_antes    seguros.estado_comercial,
  estado_despues  seguros.estado_comercial,
  -- Antes/después de los campos que cambiaron, y la tarea si la hubo. Nunca
  -- datos de contacto: el teléfono o el correo del lead no viajan aquí.
  detalle         jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oportunidad_historial_oportunidad
  ON seguros.oportunidad_historial (oportunidad_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gestiones_oportunidad
  ON seguros.gestiones (oportunidad_id) WHERE oportunidad_id IS NOT NULL;

CREATE OR REPLACE FUNCTION seguros.oportunidad_historial_reject_modification()
RETURNS trigger LANGUAGE plpgsql AS $reject$
BEGIN
  RAISE EXCEPTION 'seguros.oportunidad_historial es append-only (intento de % en %)',
    tg_op, tg_table_name;
END;
$reject$;

DROP TRIGGER IF EXISTS oportunidad_historial_reject_modification ON seguros.oportunidad_historial;
CREATE TRIGGER oportunidad_historial_reject_modification
  BEFORE UPDATE OR DELETE ON seguros.oportunidad_historial
  FOR EACH ROW EXECUTE FUNCTION seguros.oportunidad_historial_reject_modification();

-- El GRANT del bootstrap es sobre las tablas que existían entonces: una tabla
-- nueva necesita el suyo. Solo leer e insertar (append-only).
GRANT SELECT, INSERT ON seguros.oportunidad_historial TO prisma_seguros;
