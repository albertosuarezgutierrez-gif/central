-- De QUÉ ancla salió cada noche escrita. (28/08/2026)
--
-- El PR #1811 arregló EL SERRUCHO: el ancla global pasó de ser el percentil de UNA pasada de
-- barrido (5-35 fechas, distintas cada mañana) a serlo de un corpus acumulado de 30 días
-- (115-119 fechas). La medición de seguimiento del 03/09 tiene que responder a una pregunta que
-- HOY no se puede responder con la BD: ¿esta noche concreta se tarificó por el bucket de su MES
-- (rama estable, que ya existía) o por el ANCLA GLOBAL (la rama que oscilaba)?
--
-- Sin estas dos columnas la medición solo puede ser agregada: se vería que el precio oscila menos,
-- pero NO se podría atribuir la mejora a la rama que se tocó. Y una mejora que no se puede atribuir
-- es indistinguible de un mercado que esa semana estuvo tranquilo.
--
-- 🚨 NULL = «no se sabe», y aquí es la mayoría del histórico: todas las filas anteriores al despliegue
-- de esta migración. NO colapsar a 'global' ni a 'pasada' en ninguna consulta — sería exactamente la
-- mentira que persigue la regla «dato que NO hay ≠ dato que NO se ha mirado» del CLAUDE.md raíz.
-- Las filas del motor NUEVO anteriores a esta columna (27/08 19:00 → 28/08) también son NULL: se
-- sabe que usaron el ancla acumulada porque los 4 pisos la cumplían, pero eso es una inferencia de
-- fuera de la tabla, no un dato de la fila.

ALTER TABLE pricing_applied
  -- Cuál de los dos anclas globales tenía el PISO en esa pasada. Espeja `ancla_global.origen` de la
  -- respuesta de /api/sivra/pricing/apply:
  --   'acumulada_fiable' = corpus de 30 días, solo booking_mcp/manual (lo normal desde el 27/08)
  --   'acumulada_mixta'  = corpus de 30 días, con filas de barrido dentro (precio de ANUNCIO)
  --   'pasada'           = fallback al ancla VIEJA: ese piso no reunía MIN_FECHAS_ANCLA (15) fechas
  ADD COLUMN IF NOT EXISTS ancla_origen TEXT,
  -- De qué salió la base de ESTA noche. `useMonth` del apply:
  --   'mes'    = bucket del mes de la fecha (>= MIN_BUCKET comps y >= MIN_FECHAS_MES fechas)
  --   'global' = no había bucket de mes → cayó al ancla global. ES LA RAMA QUE OSCILABA.
  ADD COLUMN IF NOT EXISTS base_fuente TEXT;

-- El seguimiento agrupa por estas dos y por fecha; el corpus vivo son ~400 noches por pasada.
CREATE INDEX IF NOT EXISTS pricing_applied_base_fuente_idx
  ON pricing_applied (base_fuente, applied_at)
  WHERE base_fuente IS NOT NULL;
