-- (27/09/2026) Dos cosas del asistente de Telegram:
-- 1. `telegram_update_visto`: Telegram reintenta un update si el 200 tarda; sin esto una pregunta lenta
--    se contestaba (y proponía botones) dos veces. Se purga a los 3 días desde el propio webhook.
-- 2. La oportunidad recuerda qué documentos se leyeron (`documentos`) para el botón «📎 Guardar en la
--    ficha», de un solo uso (`documentos_guardados_at`).
CREATE TABLE IF NOT EXISTS telegram_update_visto (
  update_id bigint PRIMARY KEY,
  visto_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_update_visto_at ON telegram_update_visto (visto_at);
REVOKE ALL ON telegram_update_visto FROM anon, authenticated;

ALTER TABLE correduria_asistente_oportunidad ADD COLUMN IF NOT EXISTS documentos bigint[];
ALTER TABLE correduria_asistente_oportunidad ADD COLUMN IF NOT EXISTS documentos_guardados_at timestamptz;
