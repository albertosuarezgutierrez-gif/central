-- Auditoría post-rename: faltaba comandas.cerrada_at (resto de la feature de feedback ya estaba:
-- cliente_email/cliente_nombre/feedback_enviado_at en comandas; feedback_activo/dominio_custom en
-- restaurantes). Sin ella, factura/cerrar y bridge/cashlogy/result fallaban SILENCIOSAMENTE al
-- marcar la comanda 'cerrada'. Aditiva y nullable. Aplicada al remoto 2026-06-08.
alter table public.comandas add column if not exists cerrada_at timestamptz;
