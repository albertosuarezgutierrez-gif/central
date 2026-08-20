-- ────────────────────────────────────────────────────────────────────────────
-- Subastas: PUJAS observadas + remate esperado con datos REALES (20/08/2026)
--
-- (1) PUJAS. Verificado contra el Portal: la pestaña general NUNCA publica una
--     puja — solo «Puja mínima» y «Tramos», que son las REGLAS del remate. Las
--     pujas viven en `detalleSubasta.php?idSub=…&ver=5`, y sin sesión el Portal
--     publica el SÍ/NO pero esconde el importe («debe acceder como usuario
--     registrado»). Por eso el estado son TRES valores y no un número:
--       NULL  = no se ha mirado (o la pestaña no se pudo leer)
--       false = el Portal AFIRMA «no ha recibido pujas» (revisado, no hay)
--       true  = hay al menos una puja; el importe puede seguir siendo NULL
--     `mejor_puja` (08/08/2026) se conserva con su significado: el IMPORTE de
--     la puja más alta cuando es visible (concluida, o con sesión iniciada).
--
-- (2) REMATE ESPERADO. Los 8 remates capturados dicen que en la muestra se
--     remata de mediana muy por debajo del tipo, con excepciones brutales en
--     zona prime (Carlos Cañal: 4x el tipo). Guardamos esa cifra POR FILA para
--     que el aviso y la ficha comparen nuestro techo contra lo que de verdad
--     se paga, en vez de contra la teoría del scoring.
-- ────────────────────────────────────────────────────────────────────────────

-- (1) Observación de pujas ───────────────────────────────────────────────────
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS hay_pujas boolean;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS pujas_at timestamptz;

COMMENT ON COLUMN subastas.hay_pujas IS
  'Tres estados: NULL = pestaña ver=5 no mirada/ilegible · false = el Portal afirma «no ha recibido pujas» · true = hay al menos una puja (el importe puede no ser público).';
-- Cuarto estado, visto en producción el mismo día: la autoridad gestora puede
-- declarar la puja SECRETA («La puja máxima de la subasta es secreta», 3 de las
-- 13 vivas). Eso no es un hueco pendiente de rellenar: no se sabrá nunca, ni
-- con sesión iniciada. Mismo patrón que `publicaAdjuntos` en resumen-docs.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS pujas_secretas boolean;
COMMENT ON COLUMN subastas.pujas_secretas IS
  'true = la autoridad gestora declaró las pujas secretas: hay_pujas se quedará NULL para siempre y NO hay nada pendiente de mirar.';

COMMENT ON COLUMN subastas.pujas_at IS
  'Cuándo se miró por última vez la pestaña de pujas (ver=5). Sin esto, un hay_pujas viejo pasaría por fresco.';

-- Histórico append-only: es la ÚNICA forma de saber cuándo entró la primera
-- puja y cómo evolucionó. El Portal no publica la escalera de pujas ni el
-- número de postores (ni siquiera en el certificado de cierre, que solo trae la
-- máxima), así que la serie temporal hay que construirla observando.
CREATE TABLE IF NOT EXISTS subastas_pujas_obs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  identificador text,
  observado_en timestamptz NOT NULL DEFAULT now(),
  -- Mismo contrato de tres estados que la columna: aquí NUNCA se escribe una
  -- observación 'no_publicado' (no se guarda lo que no se pudo leer).
  hay_pujas boolean NOT NULL,
  importe numeric,
  -- 'publico' = sí/no visible sin sesión · 'sesion' = importe leído con sesión
  -- iniciada en el Portal · 'cierre' = ficha ya concluida.
  fuente text NOT NULL DEFAULT 'publico',
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

-- Parte del día del cierre: hasta ahora el remate se guardaba EN SILENCIO (la
-- captura escribía en la BD y no lo veía nadie hasta entrar en /subastas). El
-- desenlace es justo lo que hay que saber el día que termina: si hubo pujas y
-- por cuánto se fue. `resultado_avisado_at` fija que se cuenta UNA sola vez.
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
