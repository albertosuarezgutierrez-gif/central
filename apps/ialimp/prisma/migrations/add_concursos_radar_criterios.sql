-- Radar PLACSP (F7): criterios de búsqueda por empresa, sobre el perfil existente.
alter table concursos_perfil_empresa
  add column if not exists radar_activo boolean not null default false,
  add column if not exists radar_cpv text[] not null default '{}',
  add column if not exists radar_palabras_clave text[] not null default '{}',
  add column if not exists radar_presupuesto_min numeric,
  add column if not exists radar_presupuesto_max numeric;
