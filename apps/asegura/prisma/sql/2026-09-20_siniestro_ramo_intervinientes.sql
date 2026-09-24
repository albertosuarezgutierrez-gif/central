-- Campos por ramo y terceros/testigos de un siniestro (ver `siniestro-ramo.ts` y
-- `siniestro-intervinientes.ts` de `@central/module-seguros`).
--
-- `datos_ramo`: JSONB sobre `seguros.siniestros`, mismo patrón que `polizas.
-- datos_especificos` — el catálogo de campos varía por ramo y nadie filtra por
-- ellos, así que una columna estructurada por ramo (siniestros_autos,
-- siniestros_hogar...) sería 7 tablas para un dato que se lee entero de una vez.
--
-- `siniestro_intervinientes`: 1:N a propósito (varios testigos, o un tercero y
-- su testigo). PII cifrada en aplicación (mismo mecanismo que `clientes`), por
-- eso las columnas son `text` sin más: el cifrado no es de columna.
--
-- Los dos son EXCLUSIVOS de siniestros `gestionado_correduria` — CIMA no manda
-- este nivel de detalle (medido: 0 de 69 siniestros reales traen tramitador,
-- perito ni gravedad de CIMA). No hay migración de datos: son columnas/tablas
-- nuevas, vacías hasta que el corredor o el cliente las rellenen.

alter table seguros.siniestros
  add column if not exists datos_ramo jsonb;

comment on column seguros.siniestros.datos_ramo is
  'Campos propios del ramo (auto/hogar/RC/...), catálogo en @central/module-seguros/siniestro-ramo.ts. NULL = sin datos, nunca {}.';

create table if not exists seguros.siniestro_intervinientes (
  id              uuid primary key default gen_random_uuid(),
  siniestro_id    uuid not null references seguros.siniestros(id) on delete cascade,
  tipo            text not null,
  es_conductor    boolean,
  nombre          text,   -- cifrado
  telefono        text,   -- cifrado
  matricula       text,   -- cifrado; solo 'tercero'
  marca_modelo    text,
  compania_nombre text,
  numero_poliza   text,
  created_at      timestamptz not null default now(),
  constraint siniestro_intervinientes_tipo check (tipo in ('tercero', 'testigo')),
  -- Un testigo no lleva datos de vehículo: si el código descarta esos campos
  -- antes de escribir (ver `revisarInterviniente`), la BD lo confirma.
  constraint siniestro_intervinientes_testigo_sin_vehiculo check (
    tipo = 'tercero' or (matricula is null and marca_modelo is null and compania_nombre is null and numero_poliza is null and es_conductor is null)
  )
);

create index if not exists siniestro_intervinientes_siniestro_idx on seguros.siniestro_intervinientes (siniestro_id);

comment on table seguros.siniestro_intervinientes is
  'Terceros y testigos de un siniestro gestionado_correduria. PII cifrada en aplicación.';

grant select, insert, update, delete on seguros.siniestro_intervinientes to prisma_seguros;
