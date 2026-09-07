-- Pendientes RANCIOS del agente de huéspedes (06/09/2026).
-- El modo noche (2026-09-05_modo_noche.sql) cubre el silencio de madrugada, pero un borrador que
-- escala EN HORARIO no caducaba nunca: si Alberto no le da a ✅ Enviar, la fila se queda en
-- `mensajes_pendientes_tg` para siempre, sin recordatorio y sin que el huésped reciba nada — y desde
-- el código ese silencio es idéntico a una conversación atendida. Caso que lo dispara: la reserva
-- 154375571 (House Sevillana), que preguntó a las 15:41 y seguía sin respuesta 29 h después.
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS recordatorio_at TIMESTAMPTZ;
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS acuse_espera_at TIMESTAMPTZ;
-- Un cierre de conversación («gracias, un saludo») no necesita ni recordatorio ni acuse: nadie
-- espera respuesta. Se guarda al proponer, porque `requiere_respuesta` vive en la decisión y aquí ya
-- no está.
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS no_requiere_respuesta BOOLEAN NOT NULL DEFAULT false;

-- El barrido corre cada 3 min y solo mira los que aún tienen algún peldaño por dar.
CREATE INDEX IF NOT EXISTS idx_pendientes_tg_rancios
  ON public.mensajes_pendientes_tg (created_at)
  WHERE NOT no_requiere_respuesta AND (recordatorio_at IS NULL OR acuse_espera_at IS NULL);
