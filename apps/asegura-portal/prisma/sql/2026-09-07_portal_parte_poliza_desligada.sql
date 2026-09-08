-- La FOTO de la póliza que el cliente quitó de su bóveda (07/09/2026).
--
-- Contexto: desde hoy el cliente puede quitar de «Mis seguros» una póliza que
-- añadió él (las de CIMA no: ninguna ruta del portal las escribe). El problema
-- es qué pasa con los partes de siniestro que colgaban de esa póliza.
--
-- 🚨 Ninguna de las dos salidas obvias vale:
--
--   · Borrar la póliza a secas NO falla: la FK `poliza_declarada_id` es
--     `ON DELETE SET NULL` y el CHECK admite las dos columnas de póliza nulas,
--     así que el parte queda HUÉRFANO —una comunicación de siniestro que no
--     dice de qué póliza habla— sin que nada avise.
--   · Borrarlo en cascada se lleva por delante la fecha de comunicación, que es
--     la prueba del art. 16 LCS (siete días). Lo borraría el propio asegurado,
--     sin querer, ordenando su bóveda.
--
-- Por eso el borrado CONGELA: antes de que la fila desaparezca, sus datos
-- identificativos se copian aquí como TEXTO. Es una foto, no una relación: vale
-- justamente porque el origen ya no existe. El parte sobrevive legible y nadie
-- pierde la prueba.
--
-- Las tres son nullable porque una póliza aportada puede no tener ni compañía
-- («Póliza sin compañía identificada» es un caso real y frecuente). Lo que NO
-- es opcional es la fecha: es la que distingue «se desligó y la póliza no decía
-- nada» de «este parte nunca se desligó», que con tres NULL se leerían igual.
ALTER TABLE seguros.portal_parte_siniestro
  ADD COLUMN IF NOT EXISTS poliza_desligada_at       timestamptz,
  ADD COLUMN IF NOT EXISTS poliza_desligada_compania text,
  ADD COLUMN IF NOT EXISTS poliza_desligada_numero   text,
  ADD COLUMN IF NOT EXISTS poliza_desligada_ramo     text;

-- Un parte desligado no puede seguir apuntando a una póliza: si lo hiciera,
-- habría dos fuentes para lo mismo y la pantalla elegiría una al azar. Y al
-- revés: una foto sin fecha es un dato sin saber de cuándo.
ALTER TABLE seguros.portal_parte_siniestro
  DROP CONSTRAINT IF EXISTS portal_parte_desligada_coherente;
ALTER TABLE seguros.portal_parte_siniestro
  ADD CONSTRAINT portal_parte_desligada_coherente CHECK (
    (poliza_desligada_at IS NULL
      AND poliza_desligada_compania IS NULL
      AND poliza_desligada_numero IS NULL
      AND poliza_desligada_ramo IS NULL)
    OR
    (poliza_desligada_at IS NOT NULL AND poliza_declarada_id IS NULL)
  );

COMMENT ON COLUMN seguros.portal_parte_siniestro.poliza_desligada_at IS
  'Cuándo el cliente quitó de su bóveda la póliza aportada de este parte. NULL = nunca se desligó.';
