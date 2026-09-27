-- Directorio de contactos por compañía: de UNO a VARIOS (13/09/2026).
-- Spec: docs/superpowers/specs/2026-09-13-companias-contactos-multiples-design.md
--
-- Hasta hoy `companias_dgs` guardaba un solo contacto (contacto_nombre/cargo/
-- email/telefono). Una compañía tiene varios según el motivo (Occident:
-- Rodríguez López, Francisco es el contacto COMERCIAL, distinto del ya
-- cargado). Esta tabla sustituye a esas 4 columnas; NO toca clave_mediador
-- ni telefono_siniestros/telefono_asistencia/whatsapp_siniestros/
-- horario_siniestros, que son atributos de la COMPAÑÍA, no de una persona.
--
-- Referencia compartida, igual que companias_dgs: sin correduria_id, no pasa
-- por lib/tenant (ver spec, sección «Aislamiento»).
--
-- Aplicada en la BD compartida como migración `seguros_compania_contactos`
-- (13/09/2026); recuento verificado antes/después: 8 = 8.
create type seguros.area_contacto as enum (
  'comercial',
  'siniestros',
  'administracion',
  'tecnico',
  'general'
);

create table seguros.compania_contactos (
  id                   uuid primary key default gen_random_uuid(),
  compania_codigo_dgs  varchar(16) not null references seguros.companias_dgs(codigo_dgs),
  nombre               text not null,
  cargo                text,
  area                 seguros.area_contacto,
  email                text,
  telefono             text,
  notas                text,
  orden                integer not null default 0,
  activo               boolean not null default true,
  ultimo_contacto_en   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table seguros.compania_contactos is 'Varios contactos por compañía (comercial/siniestros/...). area=NULL = no clasificado, no es "general". Sustituye a companias_dgs.contacto_*.';

create index compania_contactos_compania_activo_idx
  on seguros.compania_contactos (compania_codigo_dgs, activo);

-- Migra el contacto único existente como primer contacto (orden=0, area=NULL:
-- no estaba capturada antes, no se inventa).
insert into seguros.compania_contactos (compania_codigo_dgs, nombre, cargo, email, telefono, orden)
select codigo_dgs, contacto_nombre, contacto_cargo, contacto_email, contacto_telefono, 0
from seguros.companias_dgs
where contacto_nombre is not null;

alter table seguros.companias_dgs
  drop column contacto_nombre,
  drop column contacto_cargo,
  drop column contacto_email,
  drop column contacto_telefono;

grant select, insert, update, delete on seguros.compania_contactos to prisma_seguros;
grant select on seguros.compania_contactos to crm_seguros;
grant usage on type seguros.area_contacto to prisma_seguros;
