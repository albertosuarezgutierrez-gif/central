-- Saneo del corpus de trading: precios que eran de OTRA empresa (08/08/2026).
--
-- Qué pasó. La pasada diaria pide los `get_price_history` de los ~13 símbolos de la watchlist en
-- paralelo y los resultados NO vuelven en el orden en que se pidieron. Al transcribirlos por posición
-- se barajaron, y varios símbolos quedaron con el cierre REAL de otra compañía. Verificado uno a uno
-- contra IBKR (`get_price_history`, cierres consolidados) el 08/08/2026:
--
--   fecha       símbolo   valor que se guardó   de quién era   cierre REAL de ese símbolo
--   2026-07-17  META      393,82                MSFT           646,01
--   2026-07-17  MSFT      478,14                SPOT           393,82
--   2026-07-17  NFLX      1179,11               LLY            68,95
--   2026-07-17  SPOT      68,95                 NFLX           478,14
--   2026-08-03  LLY       193,18                CVX            1121,36
--   2026-08-03  META      1121,09               LLY            590,24
--   2026-08-04  NFLX      162,61                PLTR           73,57
--
-- Es un barajado, no una corrupción: los números son cierres verdaderos, solo que de otro. Por eso
-- ninguna guardia de plausibilidad los veía y por eso este PR añade `detectarSuplantaciones`.
--
-- DOS DAÑOS DISTINTOS, DOS TRATAMIENTOS DISTINTOS. Es la parte importante de este archivo:
--
--  (A) TESIS con el `precio_ref` suplantado → SE ANULAN, no se corrigen. No es una tesis buena mal
--      puntuada: `/analizar` alimenta `indicadoresDe(velas)` con TODA la serie del símbolo, y esa serie
--      era la de otra empresa. La dirección, la confianza y el rationale describen a MSFT bajo la
--      etiqueta META. Ponerle el precio bueno y re-puntuarla fabricaría el veredicto de una señal que
--      nunca se emitió sobre ese símbolo — exactamente el «no lo sé disfrazado de dato» del repo.
--
--  (B) RESULTADOS con el `precio_despues` suplantado pero cuya TESIS es sana → SE RE-PUNTÚAN. Aquí sí
--      se sabe todo: la tesis se construyó bien (22-24/07, precios verificados) y solo el precio de
--      cierre de la ventana vino cambiado. Mismo tratamiento que las 12 filas de CVX del 2026-08-08:
--      se recalcula con el cierre real de IBKR y se marca `precio_fuente = 'manual'`.
--
-- Ninguna fila se borra en ningún caso: 0 tesis `operada`, así que no hay ninguna orden paper que
-- dependa de esto, pero el registro del incidente es lo que impide repetirlo.
--
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 0) La columna que faltaba: una tesis también puede ser «esto no lo sabemos».
-- ---------------------------------------------------------------------------
ALTER TABLE "trading_tesis"
  ADD COLUMN IF NOT EXISTS "anulado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trading_tesis"
  ADD COLUMN IF NOT EXISTS "anulado_motivo" TEXT;

COMMENT ON COLUMN "trading_tesis"."anulado" IS
  'true = la tesis se construyó sobre un precio_ref que era de otra empresa. Ni se puntúa, ni sirve de referencia, ni se pinta. La fila se conserva como registro.';
COMMENT ON COLUMN "trading_tesis"."anulado_motivo" IS
  'Por qué se anuló, nombrando al símbolo dueño del precio y el cierre real verificado.';

-- ---------------------------------------------------------------------------
-- (A) Anular las 28 tesis con el precio_ref suplantado, y sus resultados.
-- ---------------------------------------------------------------------------
WITH cruces(simbolo, fecha, culpable, guardado, real_) AS (VALUES
  ('META', DATE '2026-07-17', 'MSFT',  393.82,  646.01),
  ('MSFT', DATE '2026-07-17', 'SPOT',  478.14,  393.82),
  ('NFLX', DATE '2026-07-17', 'LLY',  1179.11,   68.95),
  ('SPOT', DATE '2026-07-17', 'NFLX',   68.95,  478.14),
  ('LLY',  DATE '2026-08-03', 'CVX',   193.18, 1121.36),
  ('META', DATE '2026-08-03', 'LLY',  1121.09,  590.24),
  ('NFLX', DATE '2026-08-04', 'PLTR',  162.61,   73.57)
)
UPDATE "trading_tesis" t
SET anulado = true,
    anulado_motivo = format(
      'precio_ref %s era el cierre de %s, no de %s (real: %s, verificado contra IBKR el 2026-08-08). '
      || 'Los indicadores del torneo salieron de la serie de velas de %s, así que la señal no es de este símbolo. '
      || 'Causa: resultados de get_price_history paralelos transcritos por posición.',
      c.guardado, c.culpable, t.simbolo, c.real_, c.culpable)
FROM cruces c
WHERE t.simbolo = c.simbolo AND t.fecha::date = c.fecha
  AND abs(t.precio_ref - c.guardado) < 0.005     -- solo si el valor sigue siendo el suplantado
  AND NOT t.anulado;

-- Sus resultados: el precio_despues era correcto, pero medido contra un precio_ref falso el retorno no
-- significa nada. No cuentan para el walk-forward.
UPDATE "trading_tesis_resultado" r
SET anulado = true,
    anulado_motivo = coalesce(r.anulado_motivo || ' · ', '')
      || 'Anulado el 2026-08-08: su tesis se construyó con el precio de otra empresa.'
FROM "trading_tesis" t
WHERE t.id = r.tesis_id AND t.anulado AND NOT r.anulado;

-- ---------------------------------------------------------------------------
-- (B) Re-puntuar los 24 resultados con precio_despues suplantado (tesis sana).
--     Puntuados el 2026-08-03: LLY se llevó el cierre de CVX y META el de LLY.
-- ---------------------------------------------------------------------------
WITH reales(simbolo, dia, guardado, real_) AS (VALUES
  ('LLY',  DATE '2026-08-03',  193.18, 1121.36),
  ('META', DATE '2026-08-03', 1121.09,  590.24)
),
recalculo AS (
  SELECT r.id,
         x.real_                                        AS precio,
         (x.real_ - t.precio_ref) / t.precio_ref        AS mov,
         x.real_ > t.precio_ref                         AS subio,
         t.direccion
  FROM "trading_tesis_resultado" r
  JOIN "trading_tesis" t ON t.id = r.tesis_id
  JOIN reales x ON x.simbolo = t.simbolo AND r.puntuado_en::date = x.dia
  WHERE abs(r.precio_despues - x.guardado) < 0.005
    AND NOT t.anulado AND NOT r.anulado
)
UPDATE "trading_tesis_resultado" r
SET precio_despues = c.precio,
    acierto = (c.direccion = 'alcista' AND c.subio)
           OR (c.direccion = 'bajista' AND NOT c.subio)
           OR (c.direccion = 'neutral' AND abs(c.mov) < 0.02),
    retorno = CASE c.direccion WHEN 'bajista' THEN -c.mov WHEN 'neutral' THEN 0 ELSE c.mov END,
    precio_fuente = 'manual',
    -- La cicatriz sobrevive a la corrección: sin ella, dentro de un mes esta fila parece un dato
    -- normal de la pasada y nadie sabría que hubo que rescatarla.
    anulado_motivo = coalesce(r.anulado_motivo || ' · ', '')
      || 'Re-puntuada el 2026-08-08: el precio_despues guardado era de otra empresa; sustituido por el cierre real de IBKR.'
FROM recalculo c
WHERE r.id = c.id;

-- ---------------------------------------------------------------------------
-- 3) Recomputar el walk-forward. `/puntuar` lo rehace en cada pasada, pero `/analizar` corre ANTES
--    que él y lee estas stats para modular la confianza del torneo: dejarlas envenenadas hasta la
--    noche sería una pasada más decidiendo con el dato malo.
-- ---------------------------------------------------------------------------
INSERT INTO "trading_estrategia_stats" (estrategia, regimen, hit_rate, retorno_medio, n, actualizado_en)
SELECT t.estrategia, 'todos',
       count(*) FILTER (WHERE r.acierto)::float8 / count(*),
       avg(r.retorno),
       count(*),
       now()
FROM "trading_tesis_resultado" r
JOIN "trading_tesis" t ON t.id = r.tesis_id
WHERE NOT r.anulado AND NOT t.anulado
GROUP BY t.estrategia
ON CONFLICT (estrategia, regimen) DO UPDATE
SET hit_rate = EXCLUDED.hit_rate,
    retorno_medio = EXCLUDED.retorno_medio,
    n = EXCLUDED.n,
    actualizado_en = now();
