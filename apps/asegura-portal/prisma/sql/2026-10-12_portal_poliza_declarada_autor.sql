-- 💡 PROPUESTA — NO APLICAR sin decisión de Alberto. Ni `schema.prisma` ni el
-- código la usan todavía: declarar las columnas en Prisma ANTES de aplicarla
-- tumbaría toda lectura de `portal_poliza_declarada` (Prisma pide cada columna).
--
-- ── POR QUÉ ──────────────────────────────────────────────────────────────────
-- Desde el 12/10/2026 quien tiene «Total» sobre la ficha de un titular puede
-- añadir, corregir y quitar las pólizas que ese titular añadió en su portal.
-- La fila sigue siendo del titular (`identidad_id`), así que hoy NO consta en
-- ella quién la escribió de verdad: el único rastro es el USO de la
-- autorización (`portal_autorizacion_uso`, por día, sin decir qué se hizo).
-- «Editado por X en nombre de Y» necesita una columna. Lo mínimo:
--
--   creada_por_identidad_id      quién la añadió (NULL = el propio titular o
--                                 fila anterior a esto: «no consta», no «él»)
--   actualizada_por_identidad_id quién hizo la última corrección (mismo NULL)
--
-- Un borrado no deja fila: si hace falta saber quién quitó una póliza ajena,
-- eso es una tabla de auditoría aparte (fuera de esta propuesta).
--
-- Pasos al aceptarla: 1) aplicar esto; 2) declarar las dos columnas en
-- `apps/asegura-portal/prisma/schema.prisma`; 3) escribirlas en
-- `POST /api/polizas` (alta en nombre de) y `PATCH /api/polizas/[id]` con la
-- identidad de la SESIÓN cuando `acceso.propia === false`.

SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS creada_por_identidad_id uuid
    REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizada_por_identidad_id uuid
    REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL;

COMMENT ON COLUMN seguros.portal_poliza_declarada.creada_por_identidad_id IS
  'Quien la anadio si NO fue su titular (acceso Total). NULL = no consta (el titular, o fila anterior al 12/10/2026).';
COMMENT ON COLUMN seguros.portal_poliza_declarada.actualizada_por_identidad_id IS
  'Quien hizo la ultima correccion si NO fue su titular (acceso Total). NULL = no consta.';

-- El rol del portal ya tiene SELECT/INSERT/UPDATE sobre la tabla entera; si el
-- GRANT fuera por columnas, añadir aquí:
-- GRANT SELECT (creada_por_identidad_id, actualizada_por_identidad_id),
--       INSERT (creada_por_identidad_id), UPDATE (actualizada_por_identidad_id)
--   ON seguros.portal_poliza_declarada TO prisma_asegura_portal;

COMMIT;
