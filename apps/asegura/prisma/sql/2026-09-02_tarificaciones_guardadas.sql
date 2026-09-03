-- Tarificaciones guardadas — apps/asegura
--
-- 🚨 POR QUÉ NO SE LLAMAN `cotizaciones`: ese nombre YA ESTÁ COGIDO en el
-- schema `seguros`. `seguros.cotizaciones` es la tabla del COTIZADOR WEB —
-- viva (25 filas, de julio a hoy), con `tipo_seguro`, `lead_origen`,
-- `datos_cotizacion`… y la lee `cartera-historial.ts` para el contador de
-- presupuestos de la ficha de cliente. No se toca.
--
-- Este fichero llegó a escribirse con el nombre colisionado, y el fallo NO
-- avisa: `create table if not exists` sobre una tabla que existe es un no-op
-- silencioso —Postgres suelta un NOTICE y Supabase pinta «Success»— así que
-- se habría creado solo la tabla de precios, colgada por FK de la tabla
-- EQUIVOCADA, y como `guardarSinTumbar` se traga el error a propósito la
-- pantalla habría dicho «no ha quedado copia» para siempre, sin un solo error
-- rojo. Al aplicar un DDL sobre un schema heredado: mira ANTES si el nombre
-- existe; «Success» no dice que se haya creado nada.
-- ============================================================================
-- Hoy se apunta lo que se GASTA (`codeoscopic_consumo`) pero no lo que se
-- RECIBE: los precios viven en la pestaña del navegador. Recargar es tirar
-- 0,50€, y la renovación del año que viene no tiene con qué compararse.
--
-- Dos tablas y no una: la petición entera se guarda tal cual se mandó (jsonb,
-- para poder reenseñar y reproducir), pero los precios necesitan consultarse
-- por compañía y por importe para construir la horquilla. Un blob no se
-- consulta sin parsearlo entero.
--
-- 🚨 El invariante que lo sostiene: `simulado = (intento_id is null)`.
--    Una cotización REAL siempre tiene su línea en el libro de consumo; una
--    SIMULADA no la tiene nunca, porque no hubo llamada ni cargo. Así, «¿esto
--    costó dinero?» se responde con una columna y no con una suposición — y la
--    horquilla puede excluir lo simulado sin depender de que alguien se acuerde.

create table if not exists seguros.tarificaciones (
  id                      uuid primary key default gen_random_uuid(),

  -- Aislamiento por correduría: mismo contrato que el resto de `seguros`.
  correduria_id           uuid        not null,

  -- Enlace con el libro de gasto. NULL ⇔ simulada (ver invariante de abajo).
  intento_id              uuid        unique
                          references seguros.codeoscopic_consumo (intento_id),

  -- `false` = la dio una compañía de verdad. Nunca nulo: «no sé si este precio
  -- es inventado» no es un estado admisible para algo que se le enseña a un
  -- cliente.
  simulado                boolean     not null,

  -- El `id` de raíz de Codeoscopic. En simulación es NEGATIVO a propósito: los
  -- suyos son enteros positivos, así que un negativo en la BD o en un log
  -- delata al instante que esa cotización no la dio ninguna compañía.
  project_id_codeoscopic  varchar,

  ramo                    text        not null,
  -- Por qué puerta entró: condiciona el tope y cuánto detalle se enseña.
  puerta                  text        not null
                          check (puerta in ('corredor', 'agente', 'web')),

  -- De dónde salió, cuando salió de la cartera. Ambas opcionales: una
  -- tarificación de la web no tiene ni póliza ni cliente todavía.
  poliza_id               uuid,
  cliente_id              uuid,

  fecha_efecto            date,

  -- La petición EXACTA que viajó al vendor. Es lo que permite reproducir la
  -- cotización y explicar un precio raro seis meses después.
  peticion                jsonb       not null,

  -- ── Riesgo desnormalizado, solo para poder CONSULTAR ──────────────────────
  -- Duplica lo que ya está dentro de `peticion`. Se acepta la duplicación
  -- porque la horquilla busca «casos parecidos a este» y eso no se hace
  -- rebuscando en un jsonb. La fuente de verdad sigue siendo `peticion`.
  -- Todas admiten NULL: son tres estados, no dos. NULL = no se supo.
  codigo_postal           text,
  municipio_id            integer,
  metros_cuadrados        integer,
  anio_construccion       integer,
  capital_continente      numeric(12, 2),
  capital_contenido       numeric(12, 2),
  tipo_vivienda           text,
  uso                     text,        -- régimen: propietario / inquilino
  ocupacion               text,        -- uso: habitual / segunda residencia

  solicitado_por          text        not null,
  creado_at               timestamptz not null default now(),

  -- El invariante de arriba, en la BD y no en un comentario.
  constraint simulada_sin_libro
    check (simulado = (intento_id is null))
);

-- La consulta caliente de la horquilla: casos reales de esta correduría, por
-- recencia. El índice parcial deja escrito en el esquema que lo simulado NO
-- alimenta ninguna estimación.
create index if not exists cotizaciones_horquilla_idx
  on seguros.tarificaciones (correduria_id, ramo, creado_at desc)
  where not simulado;

create index if not exists cotizaciones_poliza_idx
  on seguros.tarificaciones (poliza_id)
  where poliza_id is not null;

comment on table seguros.tarificaciones is
  'Cada tarificación pedida, con la petición íntegra y el riesgo desnormalizado. '
  'Lo simulado se guarda igual (para poder recorrer la pantalla sin gastar) pero '
  'queda marcado y excluido de toda estimación.';


-- ── Los precios: una fila por CONFIGURACIÓN de producto, no por compañía ─────
-- Una misma compañía puede devolver varias configuraciones con precios
-- distintos, y agrupar por compañía perdería justo eso.
create table if not exists seguros.tarificacion_precios (
  id                uuid primary key default gen_random_uuid(),
  tarificacion_id     uuid        not null
                    references seguros.tarificaciones (id) on delete cascade,

  compania          text        not null,
  producto          text        not null,
  modalidad         text,
  categoria         text,

  -- Un precio sin importe no es un precio.
  prima_eur         numeric(10, 2) not null,
  entrada_eur       numeric(10, 2),

  -- 🚨 NULL = el producto NO declara franquicia, jamás «sin franquicia».
  -- Enseñar un todo riesgo callando que lleva 1.500€ de franquicia es la
  -- versión cara de leer mal un dato que sí está.
  franquicia_eur    numeric(10, 2),

  -- En hogar TODA primera cotización es estimada y trae `ReRate` obligatorio.
  -- Guardar la firmeza es lo que impide que un precio estimado se reenseñe
  -- mañana como si la compañía lo hubiera cerrado.
  firmeza           text        not null
                    check (firmeza in ('firme', 'condicionado', 'estimado')),
  requiere_rerate   boolean     not null,

  referencia_vendor text,
  -- Los avisos de la compañía se enseñan SIEMPRE, así que se guardan siempre.
  avisos            jsonb       not null default '[]'::jsonb,

  creado_at         timestamptz not null default now()
);

create index if not exists cotizacion_precios_tarificacion_idx
  on seguros.tarificacion_precios (tarificacion_id);

-- Para la capa 2 de la horquilla: tarifa observada por compañía.
create index if not exists cotizacion_precios_compania_idx
  on seguros.tarificacion_precios (compania, creado_at desc);

comment on table seguros.tarificacion_precios is
  'Un precio por configuración de producto. La firmeza viaja con el precio: sin '
  'ella, un estimado se reenseña mañana como si fuera cerrado.';
