-- 2026-09-24k — «Pídele los datos al cliente por enlace» (moto/auto).
-- Alberto abre la oportunidad y manda un enlace; el cliente rellena lo que falta
-- (carné, matrícula, la moto…) y al completarlo le llega el aviso para tarificar.
-- - El token solo se guarda como sha256 (`token_hash`): la BD no sirve para entrar.
-- - `respuestas` va CIFRADO (encryptField): lo declarado no se escribe en la ficha.
-- - Una sola solicitud viva por oportunidad; completada ⇔ respuestas + completada_at.
CREATE TABLE IF NOT EXISTS seguros.solicitud_datos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  oportunidad_id uuid NOT NULL REFERENCES seguros.oportunidades(id),
  cliente_id     uuid NOT NULL REFERENCES seguros.clientes(id),
  ramo           text NOT NULL CHECK (ramo IN ('moto','auto')),
  token_hash     text NOT NULL UNIQUE,
  campos         jsonb NOT NULL,
  respuestas     text,
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','completada','anulada')),
  caduca_at      timestamptz NOT NULL,
  completada_at  timestamptz,
  creada_por     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitud_completa_con_respuestas
    CHECK ((estado = 'completada') = (respuestas IS NOT NULL AND completada_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS solicitud_datos_oportunidad_idx ON seguros.solicitud_datos (oportunidad_id);
CREATE UNIQUE INDEX IF NOT EXISTS solicitud_datos_una_viva ON seguros.solicitud_datos (oportunidad_id) WHERE estado = 'pendiente';
GRANT SELECT, INSERT, UPDATE ON seguros.solicitud_datos TO prisma_seguros;
