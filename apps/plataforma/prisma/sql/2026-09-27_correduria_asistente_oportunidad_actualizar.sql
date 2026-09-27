-- 27/09/2026 — «Actualizar la existente» desde Telegram.
-- Si al pulsar «Abrir» el cliente ya tenía una oportunidad abierta del mismo ramo (409), la fila queda
-- `duplicada` y conserva `alta` unos minutos para ofrecer corregir la existente con lo leído. Este sello
-- hace el botón de UN SOLO USO (`UPDATE … WHERE actualizada_at IS NULL`).
ALTER TABLE correduria_asistente_oportunidad ADD COLUMN IF NOT EXISTS actualizada_at timestamptz;
