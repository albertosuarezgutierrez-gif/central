-- ────────────────────────────────────────────────────────────────────────
-- Fix: renombrar mesas "salón" del restaurante demo a S1, S2, S3, S4
-- Demo restaurante_id = '00000000-0000-0000-0000-000000000001'
--
-- Problema: las mesas del salón tenían códigos T01-T12 (colisión visual
--            con el prefijo T de Terraza). El patrón correcto es:
--            Salón→S, Terraza→T, Barra→B, (otro salón→H, etc.)
--
-- Resultado: S1, S2, S3, S4 (4 mesas de salón)
-- Extra:     el resto de mesas salon (T05-T12) se eliminan si no tienen
--            comandas activas (para no dejar mesa fantasma en la demo).
-- ────────────────────────────────────────────────────────────────────────

-- PASO 1: Renombrar las 4 primeras mesas de salón (orden alfabético por código actual)
--         → S1, S2, S3, S4
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY codigo ASC) AS rn
  FROM   mesas
  WHERE  restaurante_id = '00000000-0000-0000-0000-000000000001'
    AND  zona = 'salon'
)
UPDATE mesas m
SET    codigo = 'S' || r.rn,
       nombre = 'S' || r.rn
FROM   ranked r
WHERE  m.id = r.id
  AND  r.rn BETWEEN 1 AND 4;

-- PASO 2: Eliminar las mesas de salón que quedaron sin renombrar (rn > 4)
--         Solo si no tienen comandas activas (estado ≠ cerrada/cancelada)
DELETE FROM mesas
WHERE  restaurante_id = '00000000-0000-0000-0000-000000000001'
  AND  zona = 'salon'
  AND  codigo NOT IN ('S1','S2','S3','S4')
  AND  id NOT IN (
         SELECT DISTINCT mesa_id
         FROM   comandas
         WHERE  mesa_id IS NOT NULL
           AND  estado NOT IN ('cerrada','cancelada')
       );
