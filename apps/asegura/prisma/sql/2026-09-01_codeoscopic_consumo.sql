-- Libro de consumo de Codeoscopic / Avant2 — apps/asegura
-- ============================================================================
-- Cada `POST /insurances` cuesta 0,50€ y NO es idempotente: repetir la llamada
-- crea otro proyecto y genera otro cargo. Este libro es lo que convierte el
-- "tope" en un tope de verdad.
--
-- 🚨 Por qué en BD y no en memoria: la app corre en Vercel (serverless). Un
-- contador en memoria se reinicia en cada cold start, así que no limita nada —
-- sería un tope que parece existir y no existe, que es peor que no tenerlo.
--
-- Tres estados, y solo uno libera cupo:
--   reservado  → escrito ANTES de llamar. Si nadie lo cierra, CUENTA como gasto:
--                un timeout a los 150 s no demuestra que el vendor no cobrara.
--   facturable → hubo respuesta del vendor. Cuenta.
--   descartado → hay PRUEBA de que no hubo cargo (auth, red antes de enviar,
--                rechazo de validación). Solo esto libera cupo.

create table if not exists seguros.codeoscopic_consumo (
  id                      uuid primary key default gen_random_uuid(),

  -- Aislamiento por correduría: mismo contrato que el resto de `seguros`.
  correduria_id           uuid        not null,

  -- Idempotencia NUESTRA: el llamante genera el uuid y lo reusa si reintenta,
  -- para no abrir dos reservas por el mismo intento lógico.
  intento_id              uuid        not null unique,

  estado                  text        not null
                          check (estado in ('reservado', 'facturable', 'descartado')),

  -- Trazabilidad de POR QUÉ se gastó: a fin de mes hay que poder explicar la
  -- factura línea a línea (p. ej. 'smoke', 'alta-manual', 'defensa-cartera').
  motivo                  text        not null,
  solicitado_por          text        not null,

  -- El `id` de raíz que devuelve la cotización. Es la clave con la que el
  -- webhook nos encuentra; sin guardarlo salen los `project_not_found`.
  project_id_codeoscopic  varchar,

  coste_cents             integer     not null default 50,

  -- Solo se rellena en 'descartado': la evidencia de que NO se cobró.
  descarte_evidencia      text,
  error_codigo            text,

  creado_at               timestamptz not null default now(),
  cerrado_at              timestamptz,

  -- Un descarte sin evidencia no es un descarte: es un «no lo sé» disfrazado.
  constraint descarte_con_evidencia
    check (estado <> 'descartado' or descarte_evidencia is not null),
  -- Lo cerrado tiene fecha de cierre; lo reservado, no.
  constraint cierre_coherente
    check ((estado = 'reservado') = (cerrado_at is null))
);

-- Índice de la consulta caliente: el recuento por correduría y ventana.
create index if not exists codeoscopic_consumo_ventana_idx
  on seguros.codeoscopic_consumo (correduria_id, creado_at desc);

-- Para localizar rápido el proyecto que llega por webhook.
create index if not exists codeoscopic_consumo_project_idx
  on seguros.codeoscopic_consumo (project_id_codeoscopic)
  where project_id_codeoscopic is not null;

comment on table seguros.codeoscopic_consumo is
  'Libro de cotizaciones facturables de Codeoscopic (0,50€ cada una). Un '
  '«reservado» sin cerrar cuenta como gasto: no saber el desenlace no es saber '
  'que fue gratis.';
