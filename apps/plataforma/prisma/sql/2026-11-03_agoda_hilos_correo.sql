-- Hilo de correo de Agoda por reserva (03/11/2026).
-- Agoda manda ahora UN correo por mensaje de huésped (`…@agoda-messaging.com`) y RESPONDER a ese correo
-- le llega al huésped. El agente de huéspedes contesta como siempre; lo único que cambia es el
-- transporte: si la reserva tiene aquí un hilo vivo, `enviarAlHuespedDetallado` responde al correo
-- (In-Reply-To/References) en vez de enviar por Smoobu (cuyo hilo en Agoda no llega al huésped).
-- Una fila por reserva de Smoobu: el último correo recibido (a él se responde). Aplicada en central el 03/11/2026.
CREATE TABLE IF NOT EXISTS public.agoda_hilos_correo (
  booking_id    TEXT PRIMARY KEY,            -- id de reserva de Smoobu
  message_id    TEXT NOT NULL,               -- Message-ID del último correo de Agoda (In-Reply-To)
  referencias   TEXT[] NOT NULL DEFAULT '{}',-- References del hilo, para encadenar
  responder_a   TEXT NOT NULL,               -- Reply-To (o From) del aviso
  asunto        TEXT NOT NULL,               -- asunto original (la respuesta lleva «Re: …»)
  huesped       TEXT,
  reserva_agoda TEXT,
  recibido_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agoda_hilos_correo ENABLE ROW LEVEL SECURITY;
