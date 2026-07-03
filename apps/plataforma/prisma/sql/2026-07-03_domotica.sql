-- 2026-07-03_domotica.sql — domótica Tuya (ventilador Socorro). Ver spec 2026-07-03.
-- BD COMPARTIDA multi-tenant: tablas nuevas, sin tocar RLS/grants existentes.
-- Patrón del repo: las tablas de sivra van sin RLS (acceso solo server-side vía Prisma);
-- se REVOCA anon/authenticated explícitamente para que el cliente anon de ialimp no las vea.

CREATE TABLE IF NOT EXISTS domotica_dispositivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tuya_device_id text NOT NULL UNIQUE,
  piso text,                         -- prop_* (alineado con horarios.ts/constantes.ts)
  smoobu_apartment_id integer,       -- id numérico del apartamento en Smoobu (para reservas)
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- ConfigAuto parcial (ver lib/domotica/programador.ts)
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domotica_log (
  id bigserial PRIMARY KEY,
  dispositivo_id uuid REFERENCES domotica_dispositivos(id) ON DELETE CASCADE,
  accion text NOT NULL,              -- on|off|skip_temp|skip_meteo_error|error|manual_on|manual_off|manual_velocidad|manual_luz_on|manual_luz_off
  reserva_ref text,                  -- id de reserva Smoobu (clave de idempotencia con accion)
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotencia del programador: una acción automática por reserva y dispositivo.
CREATE UNIQUE INDEX IF NOT EXISTS domotica_log_idem
  ON domotica_log (dispositivo_id, accion, reserva_ref)
  WHERE reserva_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS domotica_log_disp_fecha
  ON domotica_log (dispositivo_id, created_at DESC);

REVOKE ALL ON domotica_dispositivos FROM anon, authenticated;
REVOKE ALL ON domotica_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE domotica_log_id_seq FROM anon, authenticated;
