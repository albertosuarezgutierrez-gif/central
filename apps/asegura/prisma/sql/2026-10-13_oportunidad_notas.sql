-- 2026-10-13 — Notas libres en la oportunidad («Mis expedientes»).
--
-- Alberto (13/10/2026): «un campo de notas libre en la oportunidad para apuntar un recordatorio
-- (p. ej. para el año siguiente) que se vea cuando vuelva».
--
-- ADITIVA: una columna NULL. No toca ninguna fila (todas quedan sin notas = NULL, «no hay notas»).
-- No reutiliza `aparcada_motivo`: ese es el porqué de UN aparcado y se borra al reabrir/ganar/perder;
-- la nota tiene que sobrevivir a todo eso.
--
-- Código ANTES que el SQL: asegura lee la columna con `to_jsonb(o)->>'notas'` (sin la columna da NULL,
-- no rompe) y, si se intenta escribir una nota sin la columna, el puerto responde 503 `sin_migracion`.
--
-- Privilegios: la columna hereda los de la tabla (`prisma_seguros` y `crm_seguros`, igual que el resto
-- de columnas de `oportunidades`). Texto libre: al `oportunidad_historial` solo va QUE cambió.
--
-- Reversible: ALTER TABLE seguros.oportunidades DROP COLUMN notas;

ALTER TABLE seguros.oportunidades
  ADD COLUMN IF NOT EXISTS notas text;

ALTER TABLE seguros.oportunidades DROP CONSTRAINT IF EXISTS oportunidades_notas_largo_ck;
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_notas_largo_ck CHECK (
  notas IS NULL OR (char_length(notas) BETWEEN 1 AND 4000)
);

COMMENT ON COLUMN seguros.oportunidades.notas IS
  'Notas libres de Alberto (recordatorios para cuando vuelva). NULL = sin notas. Máx. 4000 (MAX_NOTAS de @central/module-seguros).';
