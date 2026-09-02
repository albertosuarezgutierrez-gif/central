-- El aviso de Telegram distingue «no lo encuentro en la guía» de «no he podido verificarlo».
-- Solo el primero promete aprender lo que Alberto conteste, y esa promesa tiene que sobrevivir al
-- viaje aviso → botón ✅ (que llega en otra petición): por eso viaja en el pendiente.
ALTER TABLE public.mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS hueco_guia BOOLEAN NOT NULL DEFAULT false;
