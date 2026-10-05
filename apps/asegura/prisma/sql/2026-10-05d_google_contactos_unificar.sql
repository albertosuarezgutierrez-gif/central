-- Google Contacts: «Unificar», motivo de los duplicados y MOTE de la ficha (05/10/2026, decisión de Alberto).
--
-- · `revision.resolucion` admite 'unificar' (rellena el mote con el nombre de su agenda),
--   'unificar_nombre_crm' (sin mote) y 'usar_como_mote' (renombrado en Google → mote).
--   Unificar crea el vínculo ficha ↔ contacto (origen 'adoptado', hash 'pendiente:unificar').
-- · `revision.motivo` (solo `duplicado_ambiguo`): de él depende que se ofrezca «Unificar».
--   NULL en filas anteriores = no se sabe → sin botón. INSERT lo cubre el GRANT de tabla.
-- · `cliente_mote`: cómo llama Alberto a la ficha en SU agenda. 🚨 Tabla AISLADA (ni en correos, ni
--   portal, ni PDF, ni compañías): solo prisma_seguros; guardián test/regression-mote-aislado.test.ts.
-- 🚨 GATE DDL. Aplicar ANTES de desplegar el código: sin estas columnas/tabla, el cron y la cola fallan.
-- Idempotente.

ALTER TABLE seguros.google_contactos_revision DROP CONSTRAINT IF EXISTS google_contactos_revision_resolucion_check;
ALTER TABLE seguros.google_contactos_revision ADD CONSTRAINT google_contactos_revision_resolucion_check
  CHECK (resolucion IN ('aceptar_lead', 'descartar', 'mantener_crm', 'unificar', 'unificar_nombre_crm', 'usar_como_mote'));

ALTER TABLE seguros.google_contactos_revision ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE seguros.google_contactos_revision DROP CONSTRAINT IF EXISTS google_contactos_revision_motivo_check;
ALTER TABLE seguros.google_contactos_revision ADD CONSTRAINT google_contactos_revision_motivo_check
  CHECK (motivo IS NULL OR (tipo = 'duplicado_ambiguo' AND motivo IN ('nombre_distinto', 'telefono_compartido', 'mismo_email', 'mismo_nombre', 'varios_candidatos')));

CREATE TABLE IF NOT EXISTS seguros.cliente_mote (
  cliente_id       uuid PRIMARY KEY REFERENCES seguros.clientes (id) ON DELETE CASCADE,
  mote             text NOT NULL CHECK (char_length(btrim(mote)) BETWEEN 1 AND 60),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  text
);
ALTER TABLE seguros.cliente_mote ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.cliente_mote FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.cliente_mote TO prisma_seguros;
COMMENT ON TABLE seguros.cliente_mote IS
  'Mote de la ficha en la agenda de Alberto (Google Contacts). AISLADO: nunca en correos, portal, PDF ni envíos.';
