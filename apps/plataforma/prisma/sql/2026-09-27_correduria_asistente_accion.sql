-- Acciones del día a día desde el asistente de la correduría por Telegram (27/09/2026).
-- Ver lib/correduria-acciones-tg.ts. Una fila = una acción (tarea, llamada, nota, siniestro o invitación al
-- portal) que se le enseñó a Alberto con su botón «Hacer». Mismo candado que emitir/corregir: botón de UN SOLO
-- USO (`UPDATE … WHERE estado = 'propuesta'`) que caduca a los 15 minutos. `cuerpo` es lo que irá al puerto
-- de asegura (sin el actor, que se pone al pulsar); al cerrar la fila se vacía: el dato ya vive en la ficha,
-- y quién y cuándo en su historial.
CREATE TABLE IF NOT EXISTS correduria_asistente_accion (
  id            bigserial PRIMARY KEY,
  turno_id      bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  tipo          text NOT NULL CHECK (tipo IN ('tarea', 'llamada', 'nota', 'siniestro', 'portal')),
  cliente_id    uuid,
  cuerpo        jsonb,
  estado        text NOT NULL DEFAULT 'propuesta'
                CHECK (estado IN ('propuesta', 'aplicando', 'hecha', 'rechazada', 'incierta', 'caducada', 'descartada')),
  creada_at     timestamptz NOT NULL DEFAULT now(),
  caduca_at     timestamptz NOT NULL,
  decidida_at   timestamptz,
  resultado     jsonb
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_accion_creada ON correduria_asistente_accion (creada_at DESC);

GRANT SELECT, INSERT, UPDATE ON correduria_asistente_accion TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_asistente_accion_id_seq TO prisma_plataforma;
REVOKE ALL ON correduria_asistente_accion FROM anon, authenticated;
