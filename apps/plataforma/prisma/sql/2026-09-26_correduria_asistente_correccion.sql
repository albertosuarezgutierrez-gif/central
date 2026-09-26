-- Corregir la ficha de un cliente desde el asistente de la correduría por Telegram (fase 3b, 26/09/2026).
-- Ver lib/correduria-correccion-tg.ts y docs/superpowers/specs/2026-09-26-importar-avant2-y-emitir-telegram-design.md.
--
-- Una fila = una corrección que se le enseñó a Alberto con su botón «Corregir». Mismo candado que la
-- emisión: botón de UN SOLO USO (`UPDATE … WHERE estado = 'propuesta'`) que caduca a los 15 minutos.
-- `cambios` guarda solo los campos y valores nuevos que dictó Alberto; `documento_id` es el DNI
-- archivado que acredita un cambio de nombre o apellidos (asegura lo vuelve a comprobar al escribir).
-- `huella` es el sha256 de lo que había ANTES en esos campos: al pulsar se relee la ficha y, si cambió,
-- no se escribe. Al cerrar la fila, `cambios` se queda en los NOMBRES de los campos y `huella` a NULL:
-- los valores ya viven cifrados en la ficha, y quién y cuándo queda en `seguros.auditoria`.
CREATE TABLE IF NOT EXISTS correduria_asistente_correccion (
  id            bigserial PRIMARY KEY,
  turno_id      bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  cliente_id    uuid NOT NULL,
  cambios       jsonb NOT NULL,
  documento_id  uuid,
  huella        text,
  estado        text NOT NULL DEFAULT 'propuesta'
                CHECK (estado IN ('propuesta', 'aplicando', 'aplicada', 'rechazada', 'caducada', 'descartada', 'error')),
  creada_at     timestamptz NOT NULL DEFAULT now(),
  caduca_at     timestamptz NOT NULL,
  decidida_at   timestamptz,
  resultado     jsonb
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_correccion_cliente ON correduria_asistente_correccion (cliente_id, creada_at DESC);

GRANT SELECT, INSERT, UPDATE ON correduria_asistente_correccion TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_asistente_correccion_id_seq TO prisma_plataforma;

-- Añadida el mismo día, tras aplicar la tabla sin ella.
ALTER TABLE correduria_asistente_correccion ADD COLUMN IF NOT EXISTS huella text;
