-- Bots del tarificador pedidos por TEXTO en Telegram (15/10/2026). Ver lib/correduria-bots-tg.ts y
-- lib/correduria-bots-telegram.ts. Una fila = una propuesta que se le enseñó a Alberto con su botón `tbot_ok:<id>`:
--   · tipo `tarificar`: { oportunidadId, ramo, companias } → al pulsar se rehace el riesgo EN SERVIDOR y se encola;
--   · tipo `atasco`:    { atascoId, n, rotulo }           → al pulsar, el MISMO camino que el botón `atq_e` del atasco.
-- Sin datos personales en `cuerpo` (ids, ramo, claves de compañía y el rótulo ya redactado del candidato).
-- Botón de UN SOLO USO (`UPDATE … WHERE estado = 'propuesta' AND caduca_at > now()`) que caduca a los 15 minutos.
-- Varias filas con el mismo `grupo` = botones para elegir una; al pulsar una, las hermanas se descartan.
-- La app borra las filas de más de 30 días.
CREATE TABLE IF NOT EXISTS correduria_bots_propuesta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo         uuid NOT NULL,
  turno_id      bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  tipo          text NOT NULL CHECK (tipo IN ('tarificar', 'atasco')),
  cuerpo        jsonb NOT NULL,
  estado        text NOT NULL DEFAULT 'propuesta'
                CHECK (estado IN ('propuesta', 'aplicando', 'hecha', 'rechazada', 'incierta', 'descartada')),
  creada_at     timestamptz NOT NULL DEFAULT now(),
  caduca_at     timestamptz NOT NULL,
  decidida_at   timestamptz,
  decidida_por  text,
  resultado     jsonb
);
CREATE INDEX IF NOT EXISTS idx_correduria_bots_propuesta_grupo ON correduria_bots_propuesta (grupo);
CREATE INDEX IF NOT EXISTS idx_correduria_bots_propuesta_creada ON correduria_bots_propuesta (creada_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON correduria_bots_propuesta TO prisma_plataforma;
REVOKE ALL ON correduria_bots_propuesta FROM anon, authenticated;
