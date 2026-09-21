-- Añade los dos estados que el webhook de Resend nunca distinguía de un envío
-- normal: un email rebotado (dirección muerta) o marcado como spam por el
-- destinatario. Hasta hoy `recaptacion_envios.estado` solo sabía llegar hasta
-- 'enviado'/'abierto'/'pinchado' — un lead con el correo muerto se reintentaba
-- cada 14 días para siempre, indistinguible de uno que simplemente no abre.
alter type estado_envio_recaptacion add value if not exists 'rebotado';
alter type estado_envio_recaptacion add value if not exists 'queja';
