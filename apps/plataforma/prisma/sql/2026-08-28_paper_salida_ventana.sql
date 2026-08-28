-- Salida por TIEMPO de las posiciones paper (H9, resuelta el 08/08/2026: «No se ponen stops»).
--
-- El código evaluaba un stop a 2·ATR cada noche y NO vendía nunca por tiempo, al revés de lo que H9
-- dejó firmado y de lo que el panel /trading promete desde entonces. Para cerrar por ventana hace falta
-- saber CUÁL era la ventana de cada posición, y eso no se guardaba.
--
-- NULL = no consta el horizonte → la posición NO se cierra (inventar la venta con una fecha que nadie
-- declaró es peor que dejarla abierta), y el latido de /puntuar la cuenta y la canta.
ALTER TABLE trading_paper_posicion
  ADD COLUMN IF NOT EXISTS horizonte_dias integer;

COMMENT ON COLUMN trading_paper_posicion.horizonte_dias IS
  'Ventana declarada de la tesis que abrio la posicion: la UNICA salida del paper (H9). NULL = no consta, no vence.';

-- Backfill de las posiciones ya abiertas: su horizonte SÍ se conoce — es el de la tesis que las abrió,
-- que se identifica por (simbolo, fecha = abierta_en). No se inventa nada: lo que no case se queda NULL.
UPDATE trading_paper_posicion p
SET horizonte_dias = t.horizonte_dias
FROM trading_tesis t
WHERE t.simbolo = p.simbolo
  AND t.fecha = p.abierta_en
  AND t.operada
  AND NOT t.anulado
  AND p.horizonte_dias IS NULL;
