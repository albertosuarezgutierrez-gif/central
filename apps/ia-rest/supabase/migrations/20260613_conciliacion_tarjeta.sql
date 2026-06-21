-- Conciliación de tarjeta: lo liquidado por datáfono/banco vs lo que el sistema cobró con tarjeta.
-- Aditiva e idempotente.
alter table public.arqueos_caja add column if not exists tarjeta_liquidada numeric;
alter table public.arqueos_caja add column if not exists diferencia_tarjeta numeric;
