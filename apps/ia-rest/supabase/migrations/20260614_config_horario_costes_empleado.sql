-- Coste de personal: coste/hora por empleado, como mapa en config_horario (aditivo).
-- camareros es una VISTA (no admite columnas), por eso el coste vive aquí.
-- { camarero_id: coste_hora_eur }
alter table public.config_horario add column if not exists costes_empleado jsonb not null default '{}'::jsonb;
