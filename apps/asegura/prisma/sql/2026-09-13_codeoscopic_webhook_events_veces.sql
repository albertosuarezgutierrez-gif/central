-- Webhook de Codeoscopic: el emisor real manda el mismo cuerpo cada ~30 min y el
-- dedupe por `payload_hash` (índice único del CRM) lo colapsaría en UNA fila con
-- `received_at` congelado — «dejó de mandar» y «sigue mandando lo mismo» se verían
-- igual. `veces` cuenta las repeticiones y `ultimo_at` la última; `received_at`
-- sigue siendo la primera. Columnas nuevas con default: el CRM de Manuel, que
-- también inserta aquí, no se entera.
alter table seguros.codeoscopic_webhook_events
  add column if not exists veces integer not null default 1,
  add column if not exists ultimo_at timestamp;
