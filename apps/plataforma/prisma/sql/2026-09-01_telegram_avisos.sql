-- Panel «Avisos Telegram» (/telegram): catálogo de avisos proactivos con interruptor por aviso
-- y registro de lo que se manda/omite, para poder decir CUÁNTOS llegan de verdad.
--
-- El catálogo NO vive aquí: es código (`lib/telegram/catalogo.ts`), porque cada aviso existe solo
-- si hay una llamada `tgAviso()` que lo emite. Esta tabla guarda únicamente la PREFERENCIA, que es
-- lo que Alberto cambia desde la pantalla. Ausencia de fila = activo (default seguro: un aviso
-- nuevo llega hasta que se decida callarlo, nunca al revés).
--
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql), como cron_dispatch_cursor.

CREATE TABLE IF NOT EXISTS telegram_avisos_pref (
  aviso_id       text PRIMARY KEY,
  activo         boolean NOT NULL DEFAULT true,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

-- Bitácora de emisión. `estado`: 'enviado' | 'omitido' (silenciado por preferencia).
-- Sirve para dos cosas en el panel: la frecuencia REAL de cada aviso (no la teórica del cron) y
-- el «cuántos te has ahorrado». Se purga sola a 90 días (ver índice por fecha).
CREATE TABLE IF NOT EXISTS telegram_avisos_log (
  id         bigserial PRIMARY KEY,
  aviso_id   text NOT NULL,
  estado     text NOT NULL,
  enviado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_avisos_log_fecha_idx ON telegram_avisos_log (enviado_at DESC);
CREATE INDEX IF NOT EXISTS telegram_avisos_log_aviso_idx ON telegram_avisos_log (aviso_id, enviado_at DESC);

-- El rol de la app inserta en la bitácora (bigserial ⇒ necesita la secuencia, no basta el GRANT
-- de tabla que hereda por default privileges).
GRANT USAGE, SELECT ON SEQUENCE telegram_avisos_log_id_seq TO prisma_plataforma;

-- Tablas internas: nada que exponer a los roles de la API de Supabase.
REVOKE ALL ON telegram_avisos_pref FROM anon, authenticated;
REVOKE ALL ON telegram_avisos_log  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE telegram_avisos_log_id_seq FROM anon, authenticated;
