-- 2026-11-07b — ALMACÉN DE PRECIOS OBSERVADOS, fase 0 (Alberto, OK 07/11/2026).
-- Diseño: docs/superpowers/specs/2026-11-07-almacen-precios.md (§1 y §8). Código: apps/asegura/lib/observacion-precio.ts (PURO,
-- con test) + lib/observaciones-precio.ts (BD, no lanza) + app/api/cron/observaciones-precio/route.ts (barrido/backfill).
--
-- ⛔ NO APLICADA. La aplica la sesión principal tras revisarla, con el ensayo BEGIN … ROLLBACK del final primero.
--    El CÓDIGO va antes que el SQL: sin la tabla, los enganches (Avant2 y bots) y el barrido detectan `sin_migracion`, lo dicen
--    UNA vez en el log y no escriben; tarificar no se entera. Además arrancan APAGADOS (`OBSERVACIONES_PRECIO_ACTIVO=1` para
--    escribir) y sin `ASEGURA_PRECIOS_HUELLA_SECRET` tampoco escriben.
--
-- Una fila = «la compañía X dio (o no dio) el precio P para el riesgo R en la fecha F, y lo sabemos por la fuente S».
-- Append-only (trigger): sin DELETE ni TRUNCATE; el único UPDATE es la DESVINCULACIÓN (origen y evidencia a NULL + sello).
-- Sin datos personales: ni cliente_id, poliza_id, oportunidad_id, NIF, nombre, matrícula, dirección, fecha de nacimiento ni texto
-- libre. `perfil` es una LISTA BLANCA CERRADA por CHECK (tramos); los tres HMAC son opacos (secreto del servidor).
-- Retención: sin límite (decisión de Alberto, 07/11/2026: no hay PII).
-- Escribe y lee SOLO asegura (`prisma_seguros`). Ni el portal ni plataforma reciben GRANT (plataforma leerá por el puerto, fase 2).
-- Transaccional. Se deshace con el bloque ROLLBACK del final.

BEGIN;
SET LOCAL lock_timeout = '5s';

create table seguros.observaciones_precio (
  id                     uuid primary key default gen_random_uuid(),
  correduria_id          uuid not null references seguros.corredurias(id),
  fuente                 text not null check (fuente in ('avant2','rpa','oferta_pdf','poliza_competencia','declarada_portal','competencia_volcado','cima_renovacion','manual')),
  origen_tabla           text not null check (origen_tabla in ('tarificacion_precios','tarificaciones','oportunidad_oferta','documentos','portal_poliza_declarada','polizas','manual')),
  origen_id              uuid,
  origen_subclave        text not null default '' check (length(origen_subclave) <= 120),
  clave_origen           text not null check (length(clave_origen) between 3 and 300),
  huella_valores         text not null check (huella_valores ~ '^[0-9a-f]{32}$'),
  sustituye_a            uuid references seguros.observaciones_precio(id),
  resultado              text not null check (resultado in ('precio','rechazo_compania','sin_precio_no_concluyente','anulada')),
  motivo_codigo          text check (motivo_codigo is null or motivo_codigo ~ '^[a-z0-9_]{1,60}$'),
  compania_dgs           text references seguros.companias_dgs(codigo_dgs),
  compania_texto         text not null check (length(compania_texto) between 1 and 120),
  compania_resolucion    text not null check (compania_resolucion in ('resuelta','ambigua','sin_resolver')),
  ramo                   text not null check (ramo in ('auto','moto','patinete','hogar','comunidades','comercio','rc','vida','salud','decesos','otro')),
  producto               text check (producto is null or length(producto) <= 120),
  modalidad              text check (modalidad is null or length(modalidad) <= 120),
  categoria              text check (categoria is null or length(categoria) <= 120),
  nivel                  text not null default 'sin clasificar' check (length(nivel) between 1 and 120),
  nivel_fuente           text check (nivel_fuente is null or nivel_fuente in ('categoria','modalidad','producto','coberturas','corredor')),
  nivel_version          smallint not null default 1 check (nivel_version >= 1),
  prima_anual_cents      bigint check (prima_anual_cents is null or prima_anual_cents > 0),
  prima_tipo             text not null default 'total' check (prima_tipo in ('total','neta')),
  forma_pago             text check (forma_pago is null or forma_pago in ('anual','semestral','trimestral','mensual')),
  franquicia_cents       bigint check (franquicia_cents is null or franquicia_cents >= 0),
  coberturas             jsonb check (coberturas is null or jsonb_typeof(coberturas) = 'object'),
  firmeza                text not null check (firmeza in ('firme','estimado','condicionado','declarada','historica','cobrada','telefonica')),
  coherencia             text not null default 'no_revisada' check (coherencia in ('ok','incoherente','no_revisada')),
  observada_at           timestamptz not null,
  fecha_tipo             text not null check (fecha_tipo in ('cotizada','leida','efecto_anualidad','vencimiento_declarado')),
  fecha_efecto           date,
  grupo_comparacion      text check (grupo_comparacion is null or grupo_comparacion ~ '^[0-9a-f]{64}$'),
  ancla_riesgo           text check (ancla_riesgo is null or ancla_riesgo ~ '^[0-9a-f]{64}$'),
  riesgo_huella          text check (riesgo_huella is null or riesgo_huella ~ '^[0-9a-f]{64}$'),
  provincia              char(2) check (provincia is null or provincia ~ '^(0[1-9]|[1-4][0-9]|5[0-2])$'),
  -- Lista blanca CERRADA: cualquier otra clave se rechaza. Espejo en TS: CLAVES_PERFIL de lib/observacion-precio.ts (un test
  -- compara las dos listas).
  perfil                 jsonb not null default '{}'::jsonb check (
                           jsonb_typeof(perfil) = 'object'
                           and (perfil - array[
                             'conductor_edad_tramo','carne_antiguedad_tramo','vehiculo_antiguedad_tramo','vehiculo_marca',
                             'vehiculo_segmento','combustible','uso','garaje','anios_sin_siniestros_tramo',
                             'vivienda_tipo','vivienda_uso','regimen','m2_tramo','anio_construccion_tramo',
                             'capital_continente_tramo','capital_contenido_tramo',
                             'edad_tramo','asegurados_n','capital_tramo','fumador'
                           ]::text[]) = '{}'::jsonb),
  evidencia_documento_id uuid,
  creado_por             text not null check (length(creado_por) between 1 and 120),
  creado_at              timestamptz not null default now(),
  desvinculada_at        timestamptz,
  constraint observacion_precio_con_prima check (resultado <> 'precio' or prima_anual_cents is not null),
  constraint observacion_precio_motivo check (motivo_codigo is null or resultado in ('rechazo_compania','sin_precio_no_concluyente')),
  constraint observacion_precio_origen check (origen_id is not null or desvinculada_at is not null or origen_tabla = 'manual')
);

comment on table seguros.observaciones_precio is
  'Append-only. Un precio (o la falta de él) de una compañía para un riesgo, normalizado: DGS, nivel (tarificacion-niveles.ts), '
  'prima anual total en céntimos, perfil agregado SIN PII (lista blanca por CHECK). Spec docs/superpowers/specs/2026-11-07-almacen-precios.md';

-- Idempotencia: el enganche en caliente y el barrido escriben la MISMA fila (misma clave + misma huella) → ON CONFLICT DO NOTHING.
create unique index observaciones_precio_idem on seguros.observaciones_precio (correduria_id, clave_origen, huella_valores);
create index observaciones_precio_segmento on seguros.observaciones_precio (correduria_id, ramo, nivel, observada_at desc) where resultado = 'precio';
create index observaciones_precio_grupo    on seguros.observaciones_precio (correduria_id, grupo_comparacion) where grupo_comparacion is not null;
create index observaciones_precio_compania on seguros.observaciones_precio (correduria_id, compania_dgs, ramo, observada_at desc);
create index observaciones_precio_origen   on seguros.observaciones_precio (correduria_id, fuente, origen_tabla, origen_id);
create index observaciones_precio_ancla    on seguros.observaciones_precio (correduria_id, ancla_riesgo) where ancla_riesgo is not null;
-- La versión vigente de una clave (lectura «la última por creado_at» y `sustituye_a` al escribir).
create index observaciones_precio_clave    on seguros.observaciones_precio (correduria_id, clave_origen, creado_at desc);

-- Append-only. El mensaje no escribe el nombre del schema (el cepo de aislamiento lo marca en texto de mensajes).
create function seguros.observaciones_precio_solo_desvincular() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' or tg_op = 'TRUNCATE' then
    raise exception 'observaciones_precio es append-only (% no permitido)', tg_op;
  end if;
  -- Único UPDATE admitido: dejar origen y evidencia a NULL con el sello de desvinculación; el resto de columnas, idéntico.
  -- `to_jsonb(NEW) - …` cubre también columnas que se añadan en el futuro sin tocar el trigger.
  if new.origen_id is not null
     or new.evidencia_documento_id is not null
     or new.desvinculada_at is null
     or (to_jsonb(new) - array['origen_id','evidencia_documento_id','desvinculada_at'])
        is distinct from (to_jsonb(old) - array['origen_id','evidencia_documento_id','desvinculada_at']) then
    raise exception 'observaciones_precio: solo se admite desvincular (origen y evidencia a NULL con desvinculada_at)';
  end if;
  return new;
end $$;

create trigger observaciones_precio_no_update   before update   on seguros.observaciones_precio for each row       execute function seguros.observaciones_precio_solo_desvincular();
create trigger observaciones_precio_no_delete   before delete   on seguros.observaciones_precio for each row       execute function seguros.observaciones_precio_solo_desvincular();
create trigger observaciones_precio_no_truncate before truncate on seguros.observaciones_precio for each statement execute function seguros.observaciones_precio_solo_desvincular();

-- RLS sin políticas: nadie sin BYPASSRLS lee. La ingesta de Manuel (`crm_seguros`) recibe DML en `seguros` por privilegios por
-- defecto: se le quita, como en `oportunidad_oferta`.
alter table seguros.observaciones_precio enable row level security;
revoke all on seguros.observaciones_precio from public, anon, authenticated, crm_seguros, prisma_plataforma, prisma_asegura_portal;
grant select, insert on seguros.observaciones_precio to prisma_seguros;
grant update (origen_id, evidencia_documento_id, desvinculada_at) on seguros.observaciones_precio to prisma_seguros;

COMMIT;

-- ── Ensayo (ANTES de aplicar: todo dentro de BEGIN … ROLLBACK, con la correduría real) ─────────────────────────────────────────
-- BEGIN;
--   <el bloque de arriba, sin su BEGIN/COMMIT>
--   insert into seguros.observaciones_precio (correduria_id, fuente, origen_tabla, origen_id, clave_origen, huella_valores, resultado,
--     compania_texto, compania_resolucion, ramo, prima_anual_cents, firmeza, observada_at, fecha_tipo, creado_por)
--   values ('<correduria>', 'avant2', 'tarificacion_precios', gen_random_uuid(), 'avant2|x|y|', md5('a'), 'precio', 'Mapfre',
--     'sin_resolver', 'auto', 30000, 'estimado', now(), 'cotizada', 'ensayo');                                   → ok
--   (la misma con ON CONFLICT (correduria_id, clave_origen, huella_valores) DO NOTHING)                          → 0 filas
--   update seguros.observaciones_precio set prima_anual_cents = 1;                                               → ERROR append-only
--   delete from seguros.observaciones_precio;                                                                    → ERROR append-only
--   truncate seguros.observaciones_precio;                                                                       → ERROR append-only
--   (insert con perfil '{"nif":"x"}')                                                                            → ERROR lista blanca
--   (insert resultado 'precio' con prima_anual_cents NULL)                                                       → ERROR con_prima
--   update seguros.observaciones_precio set origen_id = null, desvinculada_at = now();                           → ok
-- ROLLBACK;

-- ── Rollback (retirarla; nada más depende de ella) ─────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--   drop table seguros.observaciones_precio;
--   drop function seguros.observaciones_precio_solo_desvincular();
-- COMMIT;
