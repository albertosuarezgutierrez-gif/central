-- Intranet de limpieza para Vanesa (pisos de Alberto) — 29/08/2026
-- Mismo patrón que empresas_acceso_token / trading_acceso_token: token en BD (fila única)
-- para poder rotarlo/revocarlo sin redeploy. Sembrar el token con un UPDATE tras aplicar.

CREATE TABLE IF NOT EXISTS limpieza_acceso_token (
  id        int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token     text NOT NULL,
  activo    boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now()
);

-- Tareas sueltas que Alberto pone a la limpieza (aparte de las limpiezas por reserva).
-- property_id NULL = tarea general, no ligada a un piso.
CREATE TABLE IF NOT EXISTS limpieza_tareas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha       date NOT NULL,
  property_id text,
  texto       text NOT NULL,
  hecha       boolean NOT NULL DEFAULT false,
  hecha_at    timestamptz,
  creado_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS limpieza_tareas_fecha_idx ON limpieza_tareas (fecha);
