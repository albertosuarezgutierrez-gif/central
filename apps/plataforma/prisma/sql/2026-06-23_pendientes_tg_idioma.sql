-- Idioma del huésped en la propuesta pendiente de Telegram, para que cuando Alberto MODIFIQUE
-- en español el agente traduzca su texto al idioma del huésped antes de enviarlo.
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS idioma text;
