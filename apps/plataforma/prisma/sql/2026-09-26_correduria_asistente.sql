-- Asistente de la correduría por Telegram (fase 1, 26/09/2026). Ver lib/correduria-asistente.ts.
--
-- Cada pregunta de Alberto es un TURNO: qué preguntó, qué contestó, y QUÉ LEYÓ (herramientas +
-- clientes/pólizas tocados). Ese rastro es el registro de acceso a datos personales que pide el
-- RGPD (art. 5.2, responsabilidad proactiva) y a la vez la materia prima para mejorar el asistente.
-- El TEXTO se borra a los 90 días (lo hace el propio asistente); el rastro de acceso se queda.
CREATE TABLE IF NOT EXISTS correduria_asistente_turno (
  id           bigserial PRIMARY KEY,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  pregunta     text,
  respuesta    text,
  -- [{ "nombre": "ficha_cliente", "args": {...}, "ok": true }] — el rastro de acceso.
  herramientas jsonb NOT NULL DEFAULT '[]'::jsonb,
  modelo       text,
  ms           integer,
  ok           boolean NOT NULL DEFAULT true,
  error        text,
  -- 1 = 👍, -1 = 👎, NULL = sin valorar (no es lo mismo que 👍).
  valoracion   smallint CHECK (valoracion IN (-1, 1)),
  nota         text,
  -- Lo marca el entrenador de agentes cuando ya ha convertido el 👎 en una mejora o un test.
  resuelto     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_turno_fecha ON correduria_asistente_turno (creado_at DESC);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_turno_mal ON correduria_asistente_turno (creado_at DESC)
  WHERE valoracion = -1 AND NOT resuelto;

-- Lo que el asistente APRENDE: preferencias de trabajo de Alberto, nunca datos de un cliente.
-- Nace `propuesta` y solo pasa a `activa` con el botón de Alberto; `olvidada` es borrado suave.
CREATE TABLE IF NOT EXISTS correduria_asistente_regla (
  id            bigserial PRIMARY KEY,
  texto         text NOT NULL,
  estado        text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'activa', 'olvidada')),
  origen_turno  bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  creada_at     timestamptz NOT NULL DEFAULT now(),
  confirmada_at timestamptz,
  olvidada_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_regla_activa ON correduria_asistente_regla (id) WHERE estado = 'activa';

-- Tope de gasto propio: 0,50 €/día y 5 €/mes. Al llegar, el asistente se calla y lo DICE; no cae a
-- la cadena gratis porque esa cadena no garantiza que el proveedor no guarde los datos.
INSERT INTO ia_presupuestos (ambito, ref, limite_diario_eur, limite_mensual_eur)
  VALUES ('app', 'correduria-asistente', 0.5, 5)
  ON CONFLICT (ambito, ref) DO NOTHING;

-- La app escribe con el rol `prisma_plataforma`: sin estos grants el primer turno muere en 42501
-- y el `bigserial` no deja insertar (lección de telegram_avisos_log, 01/09/2026).
GRANT SELECT, INSERT, UPDATE, DELETE ON correduria_asistente_turno, correduria_asistente_regla TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_asistente_turno_id_seq, correduria_asistente_regla_id_seq TO prisma_plataforma;
