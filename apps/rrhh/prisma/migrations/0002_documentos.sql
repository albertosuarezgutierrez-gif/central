-- Expediente documental por empleado (schema rrhh del proyecto compartido).
-- El binario vive en el bucket privado `rrhh-documentos`; aquí solo la metadata.

create table rrhh.documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references rrhh.empresas(id),
  empleado_id uuid not null references rrhh.empleados(id) on delete cascade,
  carpeta text not null,                       -- categoría (datos_personales, contratos, nominas, partes_medicos, otros)
  nombre text not null,
  tipo text,
  tamano bigint,
  storage_path text not null,                  -- path en el bucket privado
  subido_por text not null,                    -- 'gestor' | 'titular' (trazabilidad RGPD)
  caducidad date,
  estado_firma text not null default 'no_requiere',  -- no_requiere | pendiente | firmado (Fase 2)
  creada_at timestamptz not null default now()
);
create index documentos_empleado_idx on rrhh.documentos(empleado_id);
create index documentos_empresa_idx on rrhh.documentos(empresa_id);

alter table rrhh.documentos enable row level security;
