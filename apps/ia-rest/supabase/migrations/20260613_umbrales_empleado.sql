-- Tolerancia de descuadre POR EMPLEADO (umbral individual; fallback al global).
-- Aditiva e idempotente. umbrales_empleado = { camarero_id: umbral_euros }
alter table public.config_contabilidad add column if not exists umbrales_empleado jsonb;
