-- Perfil de identificación de la empresa para el DEUC / declaración responsable
-- (F3 del módulo de concursos). Una fila por empresa.
create table if not exists concursos_perfil_empresa (
  empresa_id        uuid primary key references empresas(id) on delete cascade,
  razon_social      text not null default '',
  nif               text not null default '',
  domicilio         text,
  representante      text,
  representante_dni  text,
  email             text,
  telefono          text,
  es_pyme           boolean not null default true,
  actualizado_en    timestamptz not null default now()
);
