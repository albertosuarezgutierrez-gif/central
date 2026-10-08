-- Acuerdos con compañías (comisiones, rappels, requisitos de clave) y las CLAVES
-- de mediador del tenant (06/10/2026, fase 1).
-- Spec: docs/superpowers/specs/2026-10-06-correduria-acuerdos-companias-design.md
--
-- Alberto se ha asociado a APROMES, que trae acuerdos con aseguradoras. Esto los
-- guarda junto a los directos (y los de otras asociaciones) con su vigencia, y
-- guarda la CLAVE por la que se produce cada uno: un acuerdo de APROMES paga por
-- lo producido con la clave de APROMES, no por la cartera de la clave directa.
-- La atribución recibo → clave se hace por los códigos que manda CIMA en
-- `datos_especificos.mediador.codigoInterno` (ver `atribuirClave` en
-- `@central/module-seguros/acuerdos.ts`).
--
-- 🚨 NULL ≠ 0 en todos los porcentajes: `pct_np`/`pct_cartera` NULL = «el acuerdo
-- no lo dice o no se ha extraído». Un 0 explícito es un dato («no comisiona»).
-- Por eso las columnas son NULLABLE y sin DEFAULT.
--
-- 🚨 `revisado_at` NULL = extracto SIN COTEJAR con el documento original. Lo que
-- entra por el seed (`prisma/seed/acuerdos-*.json`) nace así siempre; ningún
-- semáforo se pinta verde hasta que Alberto lo coteja (decisión 06/10/2026).
--
-- Multi-tenant: TODAS las tablas llevan `correduria_id` (las hijas lo heredan de
-- su cabecera por FK). Los roles que las leen tienen BYPASSRLS: el aislamiento
-- lo da el código (`correduriaUnica()` en cada consulta del puerto), no RLS.
--
-- `seguros.comision_pactada` (7 filas de Allianz, PR #3903: la lee
-- `lineasComision()` por `/api/operador/comisiones-pactadas`) NO se toca aquí:
-- sus filas viajan también al seed `prisma/seed/acuerdos-2026-directo.json` y la
-- fase 2 la absorbe. Ojo: que `crm_seguros` tenga DML
-- sobre ella NO prueba que el CRM de Manuel la use — se lo dan los default
-- privileges del schema a toda tabla nueva. Precisamente por eso aquí se REVOCA.
--
-- PENDIENTE DE APLICAR (preview → prod, con OK de Alberto). No hay ninguna fila
-- que migrar: las tablas nacen vacías.

-- ─── Claves de mediador (del TENANT, no de la compañía) ──────────────────────
-- `companias_dgs.clave_mediador` es texto libre en un catálogo GLOBAL; esto lo
-- sustituirá con el tiempo (no se toca ahora). La de Pelayo allí es `28823484E`,
-- que tiene forma de NIF: NO se trae como clave (pendiente de Alberto).
create table seguros.claves_mediador (
  id                    uuid primary key default gen_random_uuid(),
  correduria_id         uuid not null references seguros.corredurias(id),
  compania_codigo_dgs   varchar(16) not null references seguros.companias_dgs(codigo_dgs),
  estado                text not null check (estado in ('activa', 'solicitada', 'sin_clave', 'baja')),
  canal                 text not null check (canal in ('directo', 'asociacion', 'colaboracion')),
  asociacion            text,
  -- Tal cual los manda CIMA: '209-C/0018638/0000', 'M00171'. Un mismo código no
  -- puede estar en dos claves del mismo tenant: lo vigila `conflictosCodigos()`
  -- en código (un EXCLUDE sobre text[] cuesta más de lo que aporta).
  codigos_cima          text[] not null default '{}',
  etiqueta              text,
  fecha_alta            date,       -- NULL = no consta (≠ «hoy»)
  fecha_baja            date,
  notas                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (canal <> 'asociacion' or asociacion is not null)
);
comment on table seguros.claves_mediador is 'Claves de mediador del tenant por compañía. codigos_cima = como los manda CIMA en mediador.codigoInterno. fecha_alta NULL = no consta.';

create unique index claves_mediador_etiqueta_uq
  on seguros.claves_mediador (correduria_id, compania_codigo_dgs, etiqueta)
  where etiqueta is not null;
create index claves_mediador_compania_idx
  on seguros.claves_mediador (correduria_id, compania_codigo_dgs);

-- ─── Acuerdos: cabecera (compañía × fuente × vigencia) ───────────────────────
create table seguros.acuerdos_compania (
  id                    uuid primary key default gen_random_uuid(),
  correduria_id         uuid not null references seguros.corredurias(id),
  compania_codigo_dgs   varchar(16) not null references seguros.companias_dgs(codigo_dgs),
  fuente                text not null check (fuente in ('apromes', 'directo', 'otra_asociacion')),
  fuente_nombre         text,
  -- Por qué clave paga. NULL = clave aún no abierta o sin decidir: el acuerdo se
  -- pinta, pero su productividad sale «pendiente» (no se compara contra nada).
  clave_id              uuid references seguros.claves_mediador(id),
  vigencia_desde        date not null,
  vigencia_hasta        date,       -- NULL = el documento no da fin
  requisitos_apertura   text,
  letra_pequena         text,
  documento_fuente      text not null,
  revisado_at           timestamptz, -- NULL = sin cotejar con el documento
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (fuente <> 'otra_asociacion' or fuente_nombre is not null),
  check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);
comment on table seguros.acuerdos_compania is 'Acuerdo comercial con una compañía. clave_id NULL = sin clave asignada (productividad pendiente). revisado_at NULL = extracto sin cotejar.';

create unique index acuerdos_compania_uq
  on seguros.acuerdos_compania (correduria_id, compania_codigo_dgs, fuente, vigencia_desde);
create index acuerdos_compania_clave_idx
  on seguros.acuerdos_compania (clave_id);

-- ─── Acuerdos: líneas de comisión por ramo ───────────────────────────────────
create table seguros.acuerdo_comisiones (
  id                    uuid primary key default gen_random_uuid(),
  acuerdo_id            uuid not null references seguros.acuerdos_compania(id) on delete cascade,
  ramo                  seguros.tipo_seguro, -- NULL = no mapeado: se pinta, no se usa para calcular
  ramo_texto            text not null,       -- literal del acuerdo
  producto              text,
  modalidad             text,
  pct_np                numeric(5, 2) check (pct_np is null or (pct_np >= 0 and pct_np <= 100)),
  pct_cartera           numeric(5, 2) check (pct_cartera is null or (pct_cartera >= 0 and pct_cartera <= 100)),
  notas                 text,
  created_at            timestamptz not null default now()
);
comment on table seguros.acuerdo_comisiones is 'Comisión pactada por ramo. pct NULL = no consta (NUNCA 0 %).';

create index acuerdo_comisiones_acuerdo_idx on seguros.acuerdo_comisiones (acuerdo_id);

-- ─── Acuerdos: objetivos (rappel, mantener clave, apertura) ──────────────────
create table seguros.acuerdo_objetivos (
  id                      uuid primary key default gen_random_uuid(),
  acuerdo_id              uuid not null references seguros.acuerdos_compania(id) on delete cascade,
  tipo                    text not null check (tipo in ('rappel', 'mantener_clave', 'apertura')),
  ambito                  text not null check (ambito in ('individual', 'colectivo')),
  base                    text not null check (base in ('primas_np', 'primas_cartera', 'primas_total', 'polizas_np', 'crecimiento_pct', 'otra')),
  criterio_cobro          text check (criterio_cobro in ('cobradas', 'emitidas')), -- NULL = el doc no lo dice
  -- Vacío = todos los ramos (mismo convenio que companias_dgs.whatsapp_siniestros_ramos;
  -- NOT NULL porque Prisma no admite listas NULL).
  ramos                   seguros.tipo_seguro[] not null default '{}',
  periodo_desde           date not null,
  periodo_hasta           date not null,
  -- [{desde, hasta|null, pct|null, importe|null}]. La forma la valida
  -- `leerTramos()` de `@central/module-seguros`: un tramo mal formado deja el
  -- objetivo «no calculable», no se ignora.
  tramos                  jsonb not null default '[]'::jsonb check (jsonb_typeof(tramos) = 'array'),
  siniestralidad_max_pct  numeric(5, 2),
  condiciones             text,
  created_at              timestamptz not null default now(),
  check (periodo_hasta >= periodo_desde)
);
comment on table seguros.acuerdo_objetivos is 'Objetivos de un acuerdo. ambito colectivo = cuenta la producción de toda la asociación (nunca se pinta alcanzado). tramos validados en código.';

create index acuerdo_objetivos_acuerdo_idx on seguros.acuerdo_objetivos (acuerdo_id);

-- ─── Contactos: de dónde sale cada uno ───────────────────────────────────────
-- NULLABLE: los 35 contactos que ya hay no tienen fuente registrada y no se les
-- inventa una. No se declara todavía en el modelo Prisma `CompaniaContacto`: si
-- el código se desplegara antes que esta migración, `GET /api/operador/companias`
-- (que hace `include: { contactos }`) pediría una columna inexistente y se caería.
alter table seguros.compania_contactos add column fuente text;
comment on column seguros.compania_contactos.fuente is 'De dónde sale el contacto (apromes, correo…). NULL = no registrado.';

-- ─── Permisos ────────────────────────────────────────────────────────────────
-- Los default privileges del schema dan arwd a `crm_seguros` en toda tabla nueva.
-- El CRM de Manuel no tiene por qué ver los acuerdos comerciales de Alberto: se
-- revoca. `prisma_asegura_portal` no recibe nada (el cliente no ve comisiones).
alter table seguros.claves_mediador   enable row level security;
alter table seguros.acuerdos_compania enable row level security;
alter table seguros.acuerdo_comisiones enable row level security;
alter table seguros.acuerdo_objetivos enable row level security;

revoke all on seguros.claves_mediador, seguros.acuerdos_compania,
              seguros.acuerdo_comisiones, seguros.acuerdo_objetivos
  from crm_seguros;

grant select, insert, update, delete on seguros.claves_mediador, seguros.acuerdos_compania,
                                        seguros.acuerdo_comisiones, seguros.acuerdo_objetivos
  to prisma_seguros;
grant select on seguros.claves_mediador, seguros.acuerdos_compania,
                seguros.acuerdo_comisiones, seguros.acuerdo_objetivos
  to backup_seguros;
