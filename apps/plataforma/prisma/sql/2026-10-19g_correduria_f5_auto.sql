-- 2026-10-19g_correduria_f5_auto.sql — «Soltar a automático» por tipo de mensaje al lead (spec 2026-10-19 lead →
-- propuesta F5 §3.5; gemela de `mensajes_auto_config` de huéspedes). Vive en plataforma, como
-- `correduria_pendiente_tg` (2026-10-19b): solo la tocan el triaje y el webhook de Telegram.
--
--   · `correduria_auto_config`: por TIPO. `auto` arranca APAGADO y SOLO lo enciende la pulsación de Alberto en
--     «🔓 Pasar a automático» (`clp_aut:<tipo>`), que solo existe con `oferta_abierta` y `racha >= 20` (envíos seguidos
--     aprobados con ✅ sin editar; una edición o un rechazo la ponen a 0). 🚨 El CHECK deja fuera `propuesta`: la
--     propuesta no puede ir sola ni con un UPDATE a mano.
--   · `correduria_auto_envios`: tope DIARIO de envíos automáticos por tipo (día Madrid). Se reserva ANTES de enviar.
--   · `correduria_auto_historial`: append-only, quién encendió/apagó qué y cuándo.
-- Sin estas tablas todo va en manual (el modo se lee como apagado y la racha no cuenta). Idempotente.

CREATE TABLE IF NOT EXISTS correduria_auto_config (
  tipo             text PRIMARY KEY CHECK (tipo IN ('peticion_datos', 'repregunta', 'recordatorio_cliente')),
  auto             boolean NOT NULL DEFAULT false,
  racha            integer NOT NULL DEFAULT 0 CHECK (racha >= 0),
  oferta_abierta   boolean NOT NULL DEFAULT false,
  oferta_at        timestamptz,
  activado_por     text,
  activado_at      timestamptz,
  desactivado_por  text,
  desactivado_at   timestamptz,
  actualizado_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS correduria_auto_envios (
  dia   date NOT NULL,
  tipo  text NOT NULL CHECK (tipo IN ('peticion_datos', 'repregunta', 'recordatorio_cliente')),
  n     integer NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (dia, tipo)
);

CREATE TABLE IF NOT EXISTS correduria_auto_historial (
  id         bigserial PRIMARY KEY,
  tipo       text NOT NULL,
  evento     text NOT NULL CHECK (evento IN ('ofrecido', 'activado', 'desactivado', 'rechazada_oferta')),
  actor      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON correduria_auto_config, correduria_auto_envios TO prisma_plataforma;
GRANT SELECT, INSERT ON correduria_auto_historial TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_auto_historial_id_seq TO prisma_plataforma;
REVOKE ALL ON correduria_auto_config, correduria_auto_envios, correduria_auto_historial FROM anon, authenticated;
