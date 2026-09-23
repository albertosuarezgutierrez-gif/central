-- 2026-09-23 — `seguros.auditoria.cambios` (Fase 1b de ASegura OS, pieza c): qué campos tocó cada
-- escritura del puerto. Lista JSON de `{entidad, id, campo, antes, despues}` para los campos de
-- negocio y `{entidad, id, campo, tocado: true}` para todo lo demás (lo decide
-- `apps/asegura/lib/cambios.ts`, que NO guarda nunca el valor de un dato personal).
--
-- ADITIVA: columna con defecto `[]`; las filas anteriores quedan con `[]`, que aquí significa
-- «esta fila es anterior a la pieza (c)», no «no cambió nada» — mírese `created_at`.
-- Reversible: `ALTER TABLE seguros.auditoria DROP COLUMN cambios;`

ALTER TABLE seguros.auditoria ADD COLUMN IF NOT EXISTS cambios jsonb NOT NULL DEFAULT '[]'::jsonb;
