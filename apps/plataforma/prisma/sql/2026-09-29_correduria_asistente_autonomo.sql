-- Asistente de la correduría en modo autónomo (29/09/2026).
--
-- 1) Huella de cada escritura hecha SIN botón: la misma escritura (misma herramienta, mismos datos) no se
--    repite en otro mensaje durante 30 minutos salvo que Alberto lo pida explícitamente. Dentro de un turno
--    ya lo impide la memoria del bucle; entre mensajes («¿ya está?», una aclaración) no había nada, y una
--    petición de precio repetida son otros 0,50€, y una nota o un siniestro repetidos, ruido en la ficha.
--    Solo guarda un hash: ni un dato del cliente.
create table if not exists correduria_asistente_huella (
  huella text primary key,
  herramienta text not null,
  turno_id bigint references correduria_asistente_turno(id) on delete set null,
  creado_at timestamptz not null default now()
);
create index if not exists correduria_asistente_huella_creado on correduria_asistente_huella (creado_at);
grant select, insert, update, delete on correduria_asistente_huella to prisma_plataforma;

-- 2) La petición de precio por Telegram ya no es solo coche/moto: hogar (por referencia catastral).
alter table correduria_asistente_tarificacion drop constraint if exists correduria_asistente_tarificacion_ramo_check;
alter table correduria_asistente_tarificacion
  add constraint correduria_asistente_tarificacion_ramo_check check (ramo in ('auto', 'moto', 'hogar'));
