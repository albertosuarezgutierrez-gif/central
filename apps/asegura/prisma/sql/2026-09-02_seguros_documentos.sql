-- Documentos de la correduría: UNA tabla para los tres sitios donde hacen falta
-- (cliente, póliza, siniestro), con el estado «pedido pero no recibido».
-- Aplicada en Supabase (central) el 02/09/2026 como migración `seguros_documentos`.
--
-- Por qué no se reutiliza `poliza_documentos` del CRM: exige `poliza_id` NOT NULL
-- (un DNI de un lead sin póliza no cabe), no tiene siniestro ni estado, y guarda
-- un `blob_pathname` de Vercel Blob que no usamos. Se deja intacta (0 filas).
--
-- El fichero va en `contenido bytea` dentro de la misma BD, a propósito: son
-- PDFs/fotos ≤ 10 MB de ~100 clientes, y así el acceso lo gobierna el mismo rol
-- que la cartera, sin un cubo nuevo ni claves de Storage en Vercel. Si algún día
-- pesa, se saca a Storage y esta columna pasa a NULL con una ruta al lado.
--
-- `estado`: pedido (falta el fichero: contenido NULL) · recibido · revisado.
-- «0 documentos» y «pedido y no ha llegado» dejan de confundirse.

create table if not exists seguros.documentos (
  id             uuid primary key default gen_random_uuid(),
  correduria_id  uuid not null references seguros.corredurias(id) on delete cascade,
  cliente_id     uuid references seguros.clientes(id) on delete cascade,
  poliza_id      uuid references seguros.polizas(id) on delete cascade,
  siniestro_id   uuid references seguros.siniestros(id) on delete cascade,
  tipo           text not null default 'otro',
  estado         text not null default 'recibido',
  nombre_fichero text,
  mime_type      text,
  size_bytes     integer,
  sha256         text,
  contenido      bytea,
  notas          text,
  subido_por     text not null default 'corredor',
  visible_por_cliente boolean not null default false,
  created_at     timestamptz not null default now(),
  revisado_at    timestamptz,
  revisado_por   text,
  constraint documentos_colgado_de_algo check (
    cliente_id is not null or poliza_id is not null or siniestro_id is not null
  ),
  constraint documentos_estado check (estado in ('pedido', 'recibido', 'revisado')),
  constraint documentos_subido_por check (subido_por in ('corredor', 'cliente', 'agente')),
  -- Un «pedido» no tiene fichero; un «recibido»/«revisado» lo tiene siempre.
  constraint documentos_contenido_coherente check (
    (estado = 'pedido' and contenido is null)
    or (estado <> 'pedido' and contenido is not null and size_bytes > 0)
  ),
  constraint documentos_tamano check (size_bytes is null or size_bytes <= 10 * 1024 * 1024)
);

create index if not exists documentos_cliente_idx   on seguros.documentos (correduria_id, cliente_id)   where cliente_id is not null;
create index if not exists documentos_poliza_idx    on seguros.documentos (correduria_id, poliza_id)    where poliza_id is not null;
create index if not exists documentos_siniestro_idx on seguros.documentos (correduria_id, siniestro_id) where siniestro_id is not null;
create index if not exists documentos_sha256_idx    on seguros.documentos (correduria_id, sha256)       where sha256 is not null;

comment on table seguros.documentos is
  'Documentos de la correduría (cliente | póliza | siniestro). estado=pedido = falta el fichero; el fichero va en contenido (bytea, ≤10 MB).';

grant select, insert, update, delete on seguros.documentos to prisma_seguros;
grant select, insert, update, delete on seguros.documentos to crm_seguros;
