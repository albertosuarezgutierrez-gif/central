-- ⏳ PENDIENTE DE APLICAR. Paso B de DOS — SOLO cuando `asegura-portal` y
-- `asegura` ya están desplegadas con el código que lee `caducaEn` como
-- opcional (PR #3570). Antes, el cliente Prisma viejo revienta al leer un NULL.
-- Requiere el paso A (`2026-09-25_portal_autorizacion_sin_caducidad_y_total.sql`).
--
-- Las ACEPTADAS vivas pasan a no caducar (decisión de Alberto, 25/09/2026). Las
-- pendientes conservan su fecha: una oferta sin contestar no se eterniza, y al
-- aceptarla el código ya pone `caduca_en = NULL`. Las caducadas se quedan como
-- están: dejaron de valer y resucitarlas sería conceder algo que nadie ha
-- vuelto a conceder.

SET search_path = seguros, public;

BEGIN;

UPDATE seguros.portal_autorizacion
   SET caduca_en = NULL
 WHERE revocado_en IS NULL
   AND aceptado_en IS NOT NULL
   AND caduca_en > now();

COMMIT;
