-- Registro de TODO lo que sale hacia un huésped (28/09/2026).
-- `mensajes_log` solo guardaba el borrador del agente, así que el cruce anti-eco
-- (`corregirAtribucion`/`esEcoPropio`) no veía: los acuses de espera y nocturnos, el último recurso,
-- los mensajes programados, el enlace de pago, el recordatorio de impago, ni el texto REAL que
-- Alberto envía tras ✏️ Modificar. Esos mensajes reaparecen en el hilo de Smoobu sin marca de
-- emisor y el agente los tomaba por preguntas del huésped. Caso: reserva 154692216 (House
-- Sevillana), cinco ecos en cuatro días — dos de ellos contestados solos al huésped, y el último
-- sustituyó en la cola la pregunta real que seguía sin respuesta.
-- Lo escribe `enviarAlHuespedDetallado` (punto único de salida) y lo lee `construirContexto`.
CREATE TABLE IF NOT EXISTS public.mensajes_enviados (
  id          BIGSERIAL PRIMARY KEY,
  booking_id  TEXT NOT NULL,
  texto       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensajes_enviados_booking ON public.mensajes_enviados (booking_id, created_at DESC);

ALTER TABLE public.mensajes_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mensajes_enviados FROM anon, authenticated;
GRANT SELECT, INSERT ON public.mensajes_enviados TO prisma_plataforma;
GRANT USAGE ON SEQUENCE public.mensajes_enviados_id_seq TO prisma_plataforma;

-- Siembra con lo ya enviado por el programador (con y sin asunto no se sabe: el cuerpo basta para
-- los reintentos, que salen sin asunto).
INSERT INTO public.mensajes_enviados (booking_id, texto, created_at)
SELECT booking_id, cuerpo, COALESCE(enviado_at, created_at)
FROM public.mensajes_programados
WHERE estado = 'enviado' AND cuerpo <> ''
  AND NOT EXISTS (SELECT 1 FROM public.mensajes_enviados e WHERE e.booking_id = mensajes_programados.booking_id AND e.texto = mensajes_programados.cuerpo);
