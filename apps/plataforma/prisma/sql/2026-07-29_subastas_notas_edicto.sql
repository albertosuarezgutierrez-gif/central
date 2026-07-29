-- Señales explícitas extraídas de los DOCUMENTOS de la ficha del BOE (29/07/2026).
-- Los edictos traen capa de texto y publican cosas que la ficha no: herencia
-- yacente, vivienda habitual del demandado, «no consta la situación posesoria».
-- NULL = documentos aún no procesados · '' = procesados sin hallazgos (así el
-- cron no los re-descarga cada día) · texto = líneas legibles para la ficha.
ALTER TABLE public.subastas
  ADD COLUMN IF NOT EXISTS notas_edicto text;
