-- Abrir oportunidades desde el asistente de la correduría por Telegram (27/09/2026).
-- Ver lib/correduria-oportunidad-tg.ts.
--
-- 1) `correduria_asistente_documento`: los documentos que Alberto sube al chat, para que el asistente
--    los lea cuando luego escribe «es el seguro de un lead, añádelo a oportunidades». Solo se guarda
--    el `file_id` de Telegram (el fichero sigue en Telegram y se vuelve a bajar al usarlo), NUNCA el
--    contenido: es la póliza de un tercero. `destino` = quién lo atendió al llegar ('contable' o
--    'correduria'); los demás documentos de un álbum (`media_group_id`) siguen al primero, que es el
--    único que trae el pie de foto.
CREATE TABLE IF NOT EXISTS correduria_asistente_documento (
  id              bigserial PRIMARY KEY,
  file_id         text NOT NULL,
  nombre          text,
  mime            text,
  media_group_id  text,
  destino         text NOT NULL CHECK (destino IN ('contable', 'correduria')),
  creado_at       timestamptz NOT NULL DEFAULT now(),
  usado_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_documento_creado ON correduria_asistente_documento (creado_at DESC);

-- 2) `correduria_asistente_oportunidad`: una fila = una oportunidad que se le enseñó a Alberto con su
--    botón «Abrir». Mismo candado que la corrección: botón de UN SOLO USO (`UPDATE … WHERE estado =
--    'propuesta'`) que caduca a los 15 minutos. `alta` guarda lo que se va a mandar al puerto; al
--    cerrar la fila se vacía (queda en la oportunidad, y quién y cuándo en su historial de asegura).
CREATE TABLE IF NOT EXISTS correduria_asistente_oportunidad (
  id            bigserial PRIMARY KEY,
  turno_id      bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  cliente_id    uuid NOT NULL,
  alta          jsonb,
  estado        text NOT NULL DEFAULT 'propuesta'
                CHECK (estado IN ('propuesta', 'aplicando', 'abierta', 'duplicada', 'rechazada', 'incierta', 'caducada', 'descartada')),
  creada_at     timestamptz NOT NULL DEFAULT now(),
  caduca_at     timestamptz NOT NULL,
  decidida_at   timestamptz,
  resultado     jsonb
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_oportunidad_cliente ON correduria_asistente_oportunidad (cliente_id, creada_at DESC);

GRANT SELECT, INSERT, UPDATE ON correduria_asistente_documento, correduria_asistente_oportunidad TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_asistente_documento_id_seq, correduria_asistente_oportunidad_id_seq TO prisma_plataforma;
-- La póliza de un tercero no se expone por la API de Supabase: fuera anon/authenticated.
REVOKE ALL ON correduria_asistente_documento, correduria_asistente_oportunidad FROM anon, authenticated;

-- Añadido el mismo día: `incierta` (la cartera no contestó bien; el alta pudo guardarse).
ALTER TABLE correduria_asistente_oportunidad DROP CONSTRAINT IF EXISTS correduria_asistente_oportunidad_estado_check;
ALTER TABLE correduria_asistente_oportunidad ADD CONSTRAINT correduria_asistente_oportunidad_estado_check
  CHECK (estado IN ('propuesta', 'aplicando', 'abierta', 'duplicada', 'rechazada', 'incierta', 'caducada', 'descartada'));
