-- Tramitación del siniestro que manda la compañía por EIAC (24/09/2026).
-- Las columnas las crea el CRM (repo asegura, migración 0099_cima_siniestro_tramitacion,
-- APLICADA el 24/09/2026 junto con este GRANT). Aquí se deja constancia del GRANT del
-- portal, por columnas y a propósito SIN `reserva_cima` ni `posicion_cima`: no son del
-- cliente. Idempotente.
alter table seguros.siniestros
  add column if not exists situaciones_cima jsonb,
  add column if not exists acciones_cima jsonb,
  add column if not exists pagos_cima jsonb,
  add column if not exists reserva_cima numeric(12,2),
  add column if not exists indemnizacion_cima numeric(12,2),
  add column if not exists total_pagos_cima numeric(12,2),
  add column if not exists posicion_cima varchar(2);

grant select (situaciones_cima, acciones_cima, pagos_cima, indemnizacion_cima, total_pagos_cima)
  on seguros.siniestros to prisma_asegura_portal;
