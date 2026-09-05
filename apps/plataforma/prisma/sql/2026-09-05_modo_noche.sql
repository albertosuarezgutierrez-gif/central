-- Modo noche del agente de huéspedes (05/09/2026).
-- Fuera del horario de atención (21:00–09:00 hora de España), lo que escala recibe un acuse de
-- recibo automático; si es urgencia de acceso/avería se avisa a Alberto y, si no responde en 15 min,
-- se deriva al huésped al servicio de atención de su portal de reserva.
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS acuse_nocturno_at TIMESTAMPTZ;
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS urgente_nocturno BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS ultimo_recurso_at TIMESTAMPTZ;

-- El barrido corre cada 3 min y solo busca urgencias pendientes de derivar: índice parcial.
CREATE INDEX IF NOT EXISTS idx_pendientes_tg_urgencia_nocturna
  ON public.mensajes_pendientes_tg (acuse_nocturno_at)
  WHERE urgente_nocturno AND ultimo_recurso_at IS NULL;
