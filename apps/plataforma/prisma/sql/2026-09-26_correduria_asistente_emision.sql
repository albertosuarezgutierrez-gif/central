-- Emitir desde el asistente de la correduría por Telegram (fase 3a, 26/09/2026).
-- Ver lib/correduria-emision-tg.ts y docs/superpowers/specs/2026-09-26-importar-avant2-y-emitir-telegram-design.md.
--
-- Una fila = un resumen que se le enseñó a Alberto con su botón «Emitir». El botón es de UN SOLO
-- USO (`UPDATE … WHERE estado = 'propuesta'`) y caduca a los 15 minutos. `huella` es el sha256 del
-- resumen: al pulsar se rehace la lectura y, si no coincide, no se emite.
-- `resumen` guarda solo lo que se enseñó: documento y cuenta ya enmascarados.
CREATE TABLE IF NOT EXISTS correduria_asistente_emision (
  id           bigserial PRIMARY KEY,
  turno_id     bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  poliza_id    uuid NOT NULL,
  project_id   text NOT NULL,
  offer_id     text NOT NULL,
  resumen      jsonb NOT NULL,
  huella       text NOT NULL,
  estado       text NOT NULL DEFAULT 'propuesta'
               CHECK (estado IN ('propuesta', 'emitiendo', 'emitida', 'rechazada', 'caducada', 'incierta', 'descartada')),
  creada_at    timestamptz NOT NULL DEFAULT now(),
  caduca_at    timestamptz NOT NULL,
  decidida_at  timestamptz,
  resultado    jsonb
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_emision_poliza ON correduria_asistente_emision (poliza_id, creada_at DESC);

GRANT SELECT, INSERT, UPDATE ON correduria_asistente_emision TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_asistente_emision_id_seq TO prisma_plataforma;
