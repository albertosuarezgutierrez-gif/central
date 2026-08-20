-- ────────────────────────────────────────────────────────────────────────────
-- Subastas: HISTÓRICO de pujas + remate esperado con datos REALES (20/08/2026)
--
-- Complemento de `2026-08-20_subastas_pujas_avisos.sql` (PR #1537), que ya
-- añadió `subastas.pujas_estado` / `pujas_estado_at` con los cuatro estados que
-- publica la pestaña `ver=5` del Portal. Aquí NO se duplica ese contrato: dos
-- columnas para el mismo hecho es la forma más fácil de acabar con dos verdades
-- que se desincronizan.
--
-- (1) HISTÓRICO. `pujas_estado` guarda el estado de HOY, y el Portal no publica
--     nada más: ni la escalera de pujas, ni el número de postores, ni siquiera
--     al concluir (el certificado de cierre solo trae la puja máxima). Por eso
--     «¿cuándo entró la primera puja?» —la pregunta que dice si una subasta se
--     calienta al final— solo se puede responder con serie propia.
--
-- (2) REMATE ESPERADO. Los remates capturados dicen que se remata muy por
--     debajo del tipo, con excepciones brutales en zona prime (Carlos Cañal: 4x
--     el tipo). Esa mediana se guarda POR FILA para que la ficha y el aviso
--     comparen nuestro techo contra lo que de verdad se paga.
-- ────────────────────────────────────────────────────────────────────────────

-- (1) Serie temporal de observaciones ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subastas_pujas_obs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  identificador text,
  observado_en timestamptz NOT NULL DEFAULT now(),
  -- Mismos valores que `subastas.pujas_estado` ('sin_pujas' | 'con_puja' |
  -- 'secretas'). 'desconocido' NUNCA se escribe: un fallo de lectura no es una
  -- observación, y guardarlo llenaría la serie de huecos con forma de dato.
  estado text NOT NULL,
  -- Solo cuando el Portal lo publica: al concluir, o en vivo con sesión.
  importe numeric,
  -- 'publico' = sí/no visible sin sesión · 'sesion' = importe leído con la
  -- cookie del Portal · 'cierre' = la subasta ya había concluido.
  fuente text NOT NULL DEFAULT 'publico',
  -- Cuántas horas faltaban para el cierre: es el eje que da sentido a la serie
  -- («entró la primera puja a 6 h del cierre»).
  horas_para_cierre numeric
);

CREATE INDEX IF NOT EXISTS idx_pujas_obs_dedupe ON subastas_pujas_obs (dedupe_key, observado_en DESC);
-- Una observación por subasta y minuto: el cron puede repetir pasada sin
-- ensuciar la serie. El truncado va sobre `timezone('UTC', …)` a propósito:
-- `date_trunc('minute', timestamptz)` es STABLE (depende del TimeZone de la
-- sesión) y Postgres no admite una función así en un índice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pujas_obs_unica
  ON subastas_pujas_obs (dedupe_key, date_trunc('minute', timezone('UTC', observado_en)));

COMMENT ON TABLE subastas_pujas_obs IS
  'Serie temporal de las pujas observadas en la pestaña ver=5 del Portal. Append-only: permite saber cuándo entró la primera puja de cada subasta.';

-- Parte del DESENLACE: hasta ahora el remate se guardaba EN SILENCIO (la
-- captura escribía en la BD y no lo veía nadie hasta entrar en /subastas).
-- `resultado_avisado_at` fija que se cuenta UNA sola vez.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS resultado_avisado_at timestamptz;
COMMENT ON COLUMN subastas.resultado_avisado_at IS
  'Cuándo se contó por Telegram el desenlace de esta subasta. NULL = aún no contado (o aún sin resultado).';

-- (2) Remate esperado con la muestra real ────────────────────────────────────
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS remate_esperado numeric;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS remate_ratio numeric;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS remate_muestra integer;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS techo_fiable boolean;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS techo_motivo text;

COMMENT ON COLUMN subastas.remate_esperado IS
  'Euros que cabe esperar de remate = ratio mediano REAL (importe_adjudicacion/valor_subasta) de la provincia (o global) x valor_subasta. NULL = aún sin muestra suficiente; no se inventa.';
COMMENT ON COLUMN subastas.remate_ratio IS
  'Ratio mediano usado (remate/tipo). Se guarda junto al importe para que la cifra sea auditable meses después, cuando la muestra ya haya cambiado.';
COMMENT ON COLUMN subastas.techo_fiable IS
  'false = puja_maxima_calc NO es de fiar (p. ej. sale por encima del propio tipo porque el valor de mercado es la mediana del municipio). NULL = no evaluado.';
COMMENT ON COLUMN subastas.techo_motivo IS
  'Por qué el techo no es de fiar, en texto para la ficha y el aviso. NULL cuando techo_fiable es true.';

-- Limpieza de la sesión paralela: `hay_pujas` y `pujas_secretas` nacieron aquí
-- el mismo día que `pujas_estado` en #1537 y dicen lo MISMO con otra forma.
-- Se van: dos columnas para un hecho es garantía de que una se queda vieja y
-- alguien decide una puja mirando la equivocada. `pujas_at` también, que su
-- equivalente es `pujas_estado_at`.
ALTER TABLE subastas
  DROP COLUMN IF EXISTS hay_pujas,
  DROP COLUMN IF EXISTS pujas_secretas,
  DROP COLUMN IF EXISTS pujas_at;
