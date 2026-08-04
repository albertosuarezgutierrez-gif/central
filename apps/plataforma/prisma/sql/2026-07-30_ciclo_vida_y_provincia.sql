-- Análisis del corpus de subastas (30/07/2026) — dos arreglos de raíz.
--
-- 1. PROVINCIA CANÓNICA. Cada fuente escribía la provincia a su manera: el BOE
--    manda «Sevilla» y la Junta de Andalucía «SEVILLA». El radar no sufría el
--    problema (compara con `norm()`), pero todo lo que AGRUPA por el valor literal
--    las contaba como provincias distintas: Sevilla aparecía como 5 + 4 subastas y
--    ninguna de las mitades llegaba al mínimo de muestra de
--    `calibracionAdjudicaciones` — es decir, el aprendizaje del agente estaba roto
--    en silencio. Ahora `provinciaCanonica()` unifica al persistir; esto backfillea
--    lo ya guardado.
UPDATE subastas SET provincia = CASE UPPER(TRANSLATE(provincia,'ÁÉÍÓÚáéíóúÜü','AEIOUAEIOUUu'))
    WHEN 'SEVILLA' THEN 'Sevilla'
    WHEN 'CADIZ'   THEN 'Cádiz'
    WHEN 'ALMERIA' THEN 'Almería'
    WHEN 'JAEN'    THEN 'Jaén'
    WHEN 'MALAGA'  THEN 'Málaga'
    WHEN 'GRANADA' THEN 'Granada'
    WHEN 'HUELVA'  THEN 'Huelva'
    WHEN 'CORDOBA' THEN 'Córdoba'
    WHEN 'ASTURIAS' THEN 'Asturias'
    ELSE provincia END,
  actualizado_en = now()
WHERE provincia IS NOT NULL;

-- 2. CICLO DE VIDA: archivar lo pasado SIN borrarlo.
--    Alberto pidió «borrar las pasadas» y en la misma frase apuntó que hay fincas
--    que salen varias veces — que es precisamente la razón para NO borrarlas:
--      · sin la convocatoria vieja, `detectarReapariciones` no puede ver que la
--        misma finca vuelve con el tipo rebajado (la mejor señal del canal);
--      · sin los resultados no hay calibración: es la memoria del agente.
--    Así que lo pasado sale de la VISTA (lista, radar) y se borra su fila de la
--    bandeja de avisos `subastas_radar` (efímera por diseño), pero la subasta se
--    queda en la base marcada como archivada.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS archivada_at timestamptz;

-- La consulta caliente: lo vigente y no archivado.
CREATE INDEX IF NOT EXISTS idx_subastas_vigentes
  ON subastas (fecha_fin)
  WHERE archivada_at IS NULL AND es_inmueble = true;
