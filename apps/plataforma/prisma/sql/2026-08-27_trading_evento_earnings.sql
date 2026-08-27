-- 📅 Atribución por EVENTO en el libro paper: ¿el resultado vino de la señal o de unos resultados?
--
-- Caso fundacional (26-27/08/2026, NVDA). El agente abrió NVDA el 21/08 a 214,72 con stop en 203,22.
-- La víspera de sus resultados cotizaba a 209,96 (ya en pérdida, a un 3,3% del stop) y el 27/08 abrió
-- con un hueco del +6,79%. La operación acabó en verde, pero ese verde no lo produjo ninguna de las
-- cuatro estrategias del torneo: lo produjo el calendario. Un hueco simétrico del −7% habría abierto
-- POR DEBAJO del stop, así que la pérdida tampoco habría sido la dimensionada.
--
-- El agujero no era la decisión, era el REGISTRO: la fecha de resultados se USA (barrera
-- `earningsInminente` ≤3d y estrategia `catalizador`) pero no se persistía en ninguna columna — solo
-- quedaba como texto libre en `rationale` ('earnings en 2d'), que no se puede agregar ni cruzar. Sin
-- estas columnas no hay forma de responder con números a «¿cuánto del rendimiento del libro viene de
-- días de evento?», que es la pregunta que hay que tener contestada ANTES de poner dinero real.
--
-- Esto es carril de DATOS, no de modelo: nada de lo que se escribe aquí cambia una decisión del
-- agente (ni veta, ni dimensiona, ni toca `trading_estrategia_stats` ni la confianza del torneo).
-- Usar esta etiqueta para decidir sería un cambio de modelo → `docs/TRADING-HIPOTESIS-PREREGISTRO.md`.

-- ── Tres estados, no dos ────────────────────────────────────────────────────────────────────────
-- `proximo_earnings` NULL puede significar dos cosas OPUESTAS: que no se consultó la fuente, o que se
-- consultó y no publica fecha. Por eso la fecha viaja SIEMPRE con su estado, y el estado por defecto
-- es el pesimista ('sin_consultar'): las filas viejas no saben nada de su evento, y decir de ellas
-- que están limpias sería inventar.
--   sin_consultar  la fuente no respondió (Yahoo caído, símbolo nuevo, pasada degradada)
--   con_fecha      fecha conocida al escribir la fila
--   sin_fecha      la fuente respondió y no da fecha (≠ no haberla mirado)
--   reconstruido   deducida a posteriori del texto de `rationale` (backfill de abajo). Es una
--                  reconstrucción, no una medición: viaja etiquetada para no agregarla a ciegas.

ALTER TABLE public.trading_tesis
  ADD COLUMN IF NOT EXISTS proximo_earnings date,
  ADD COLUMN IF NOT EXISTS earnings_estado  text NOT NULL DEFAULT 'sin_consultar';

ALTER TABLE public.trading_paper_posicion
  ADD COLUMN IF NOT EXISTS proximo_earnings date,
  ADD COLUMN IF NOT EXISTS earnings_estado  text NOT NULL DEFAULT 'sin_consultar';

-- En la ORDEN solo tiene sentido en las SELL: es donde queda constancia de una operación cerrada
-- (la fila de `trading_paper_posicion` se borra al cerrar, así que sin esto el trade cerrado pierde
-- para siempre su contexto de evento). Tres estados en una sola columna de texto, nunca un boolean:
--   cruzado | limpio | sin_consultar        NULL = fila anterior a este cambio.
ALTER TABLE public.trading_paper_orden
  ADD COLUMN IF NOT EXISTS evento_dentro text;

COMMENT ON COLUMN public.trading_tesis.proximo_earnings IS
  'Fecha de resultados conocida al emitir la tesis. NULL = ver earnings_estado (puede ser «no consultado»).';
COMMENT ON COLUMN public.trading_tesis.earnings_estado IS
  'sin_consultar | con_fecha | sin_fecha | reconstruido. Distingue «no lo sé» de «no hay».';
COMMENT ON COLUMN public.trading_paper_orden.evento_dentro IS
  'Solo SELL: cruzado | limpio | sin_consultar. ¿Hubo resultados entre la apertura y el cierre?';

-- ── Backfill RECONSTRUIDO desde el texto de la tesis ────────────────────────────────────────────
-- La estrategia `catalizador` deja en `rationale` 'earnings en Nd' / 'earnings en 0d'. De ahí sale la
-- fecha del evento tal y como el agente la conocía ESE día: fecha_tesis + N. Se copia al resto de
-- tesis del mismo símbolo y día (las cuatro estrategias comparten pasada, así que compartían dato).
--
-- 🚨 Esto NO es una medición: es una deducción a posteriori sobre un texto que se escribió para leer,
-- no para parsear. Por eso queda con estado 'reconstruido' y NO 'con_fecha'. Cualquier agregado que
-- quiera ser estricto debe poder excluirlo, y por eso no se colapsa con las filas medidas.
WITH capturado AS (
  SELECT
    simbolo,
    fecha,
    fecha + (substring(rationale FROM 'earnings en ([0-9]+)d'))::int AS evento
  FROM public.trading_tesis
  WHERE estrategia = 'catalizador'
    AND rationale ~ 'earnings en [0-9]+d'
    AND NOT anulado
)
UPDATE public.trading_tesis t
   SET proximo_earnings = c.evento,
       earnings_estado  = 'reconstruido'
  FROM capturado c
 WHERE t.simbolo = c.simbolo
   AND t.fecha   = c.fecha
   AND t.proximo_earnings IS NULL
   AND t.earnings_estado = 'sin_consultar';

-- Misma reconstrucción para las posiciones ABIERTAS: se toma la fecha de evento que el agente conocía
-- el día que abrió. Sin tesis de ese día no se rellena nada (queda 'sin_consultar', que es la verdad).
UPDATE public.trading_paper_posicion p
   SET proximo_earnings = t.proximo_earnings,
       earnings_estado  = 'reconstruido'
  FROM public.trading_tesis t
 WHERE t.simbolo = p.simbolo
   AND t.fecha = p.abierta_en
   AND t.proximo_earnings IS NOT NULL
   AND p.proximo_earnings IS NULL
   AND p.earnings_estado = 'sin_consultar';
