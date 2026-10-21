-- 2026-10-21b — F2 del agente corredor de correo: lecturas del EXTRACTOR LLM en MODO SOMBRA
-- (docs/CORREDURIA-AGENTE-CORREO.md §3 capa 3, §8 y §9 F2). SIN APLICAR: lo aplica Alberto.
--
-- Qué añade (ADITIVO e idempotente): `seguros.correo_lectura_llm`, UNA fila por correo de compañía que el extractor LLM
-- ha leído, con la ficha ya VALIDADA contra el texto (cada valor literal o `null`) y, si un lector determinista también
-- reconoció el correo, la comparación campo a campo (la métrica de precisión del LLM).
--
-- Por qué una TABLA y no columnas en `correo_evento_entrante` (la spec §7 proponía `lectura_llm jsonb` ahí): la cola larga
-- es justo lo que NINGÚN lector reconoce, así que no hay fila de evento a la que colgarla; y una fila de LLM dentro de
-- `correo_evento_entrante` la verían la bandeja, el reevaluar y el cruce con CIMA (que AVISA por Telegram). Aquí no la
-- lee nada que actúe: en F2 es solo para medir. Nada de esta tabla escribe en la cartera.
--
-- Sin datos personales: ni el nombre del tomador (solo `tomadorLeido` dentro de `ficha`), ni IBAN ni NIF (el texto pasa
-- por `sinDatosSensibles` antes del modelo, y el puerto vuelve a filtrar). Ni cuerpo ni extracto del correo.
--
-- Orden: el CÓDIGO va antes que el SQL. Sin esta migración, `POST /api/operador/correo/lectura-llm` → 503 `sin_migracion`
-- (el triaje lo cuenta y sigue: la llamada al modelo ya se gastó, pero no se pierde nada de la cartera). Y el extractor
-- arranca APAGADO (`CORREO_LLM_MODO` sin poner = `off`).
--
-- Nota: `backup_seguros` hereda SELECT sobre esta tabla por los default privileges del schema (aceptado).
--
-- Reversible: DROP TABLE IF EXISTS seguros.correo_lectura_llm;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.correo_lectura_llm (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL,
  mensaje_id    text NOT NULL CHECK (mensaje_id <> '' AND char_length(mensaje_id) <= 300),
  -- `cola_larga` = ningún lector lo reconoce (la propuesta es lo único que hay) · `comparacion` = un lector sí lo leyó y el
  -- LLM corre en paralelo para medir su acierto (gana SIEMPRE el lector).
  proposito     text NOT NULL CHECK (proposito IN ('cola_larga', 'comparacion')),
  -- F2 solo conoce `sombra`; `vivo` queda reservado para cuando un tipo pase a automático (spec §8: flag en código).
  modo          text NOT NULL DEFAULT 'sombra' CHECK (modo IN ('sombra', 'vivo')),
  modelo        text NOT NULL CHECK (modelo <> '' AND char_length(modelo) <= 120),
  -- Tipo propuesto por el modelo; NULL = no lo dio o no es uno del catálogo.
  tipo          text CHECK (tipo IS NULL OR tipo IN ('recibo', 'poliza', 'solicitud', 'siniestro', 'suplemento', 'anulacion', 'liquidacion', 'comunicado')),
  confianza     numeric(3, 2) CHECK (confianza IS NULL OR (confianza >= 0 AND confianza <= 1)),
  -- `FichaGuardable` de @central/module-seguros (sin tomador). NULL = la respuesta del modelo no se pudo leer.
  ficha         jsonb,
  -- Campos en los que el modelo dio un valor que NO estaba en el texto (anulados): el contador de alucinaciones.
  no_literales  text[] NOT NULL DEFAULT '{}',
  -- Solo `comparacion`: el tipo del lector y el resultado por campo (`acierto|fallo|omitido|sin_referencia`).
  lector_tipo   text CHECK (lector_tipo IS NULL OR char_length(lector_tipo) <= 40),
  comparacion   jsonb,
  aciertos      smallint CHECK (aciertos IS NULL OR aciertos >= 0),
  fallos        smallint CHECK (fallos IS NULL OR fallos >= 0),
  -- Revisión humana (bandeja ✓/✗/corregir, pendiente de pantalla): NULL = sin revisar.
  revision      text CHECK (revision IS NULL OR revision IN ('correcta', 'incorrecta', 'corregida')),
  corregido     jsonb,
  revisado_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correo_lectura_llm_unica UNIQUE (correduria_id, mensaje_id),
  CONSTRAINT correo_lectura_llm_comparacion_ck CHECK (
    (proposito = 'comparacion') = (lector_tipo IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS correo_lectura_llm_reciente
  ON seguros.correo_lectura_llm (correduria_id, created_at DESC);

ALTER TABLE seguros.correo_lectura_llm ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE seguros.correo_lectura_llm IS
  'F2 agente de correo (2026-10-21): lecturas del extractor LLM en MODO SOMBRA (no tocan la cartera ni avisan). Ficha validada literal contra el texto; comparación con el lector determinista cuando lo hay. Sin nombres, NIF ni IBAN.';

-- ── Permisos (patrón de 2026-10-07b) ─────────────────────────────────────────
-- Solo `prisma_seguros` (la app), sin DELETE: el schema tiene default privileges `arwd`, así que se REVOCA explícitamente.
-- Ni `crm_seguros` (la ingesta de CIMA de Manuel) ni el portal ni anon/authenticated.
REVOKE ALL ON seguros.correo_lectura_llm FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.correo_lectura_llm TO prisma_seguros;
REVOKE DELETE, TRUNCATE ON seguros.correo_lectura_llm FROM prisma_seguros;

COMMIT;

-- Verificación tras aplicar:
--   select has_table_privilege('prisma_seguros', 'seguros.correo_lectura_llm', 'DELETE');  -- f
--   select has_table_privilege('crm_seguros',    'seguros.correo_lectura_llm', 'SELECT');  -- f
--
-- Precisión en sombra (lo que mide F2; criterio de paso a automático en spec §8: ≥ 95 % y ≥ 20 casos por tipo):
--   select lector_tipo, count(*) as casos, sum(aciertos) as aciertos, sum(fallos) as fallos,
--          round(100.0 * sum(aciertos) / nullif(sum(aciertos) + sum(fallos), 0), 1) as precision_pct
--   from seguros.correo_lectura_llm where proposito = 'comparacion' group by lector_tipo order by casos desc;
--   -- alucinaciones (valores no literales anulados):
--   select count(*) filter (where cardinality(no_literales) > 0) as con_no_literales, count(*) as total
--   from seguros.correo_lectura_llm;
