-- Código de un solo uso por Telegram para revelar el DNI COMPLETO de un cliente
-- de la correduría en /correduria/cliente/[id]. El resto de la ficha muestra el
-- DNI enmascarado a propósito (ver puerto de asegura); este es el único camino
-- que lo destapa, y solo tras un código de 6 dígitos enviado al Telegram de
-- Alberto — nunca visible en la pantalla sin ese paso.
--
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql), como el
-- resto de tablas de este patrón (telegram_avisos_pref, cron_dispatch_cursor).

CREATE TABLE IF NOT EXISTS correduria_dni_otp (
  id          bigserial PRIMARY KEY,
  cuenta_id   uuid NOT NULL,
  cliente_id  text NOT NULL,
  codigo_hash text NOT NULL,
  expira_at   timestamptz NOT NULL,
  usado_at    timestamptz,
  creado_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS correduria_dni_otp_lookup_idx
  ON correduria_dni_otp (cuenta_id, cliente_id, expira_at DESC);

GRANT USAGE, SELECT ON SEQUENCE correduria_dni_otp_id_seq TO prisma_plataforma;

-- Tabla interna: nada que exponer a los roles de la API de Supabase.
REVOKE ALL ON correduria_dni_otp FROM anon, authenticated;
REVOKE ALL ON SEQUENCE correduria_dni_otp_id_seq FROM anon, authenticated;
