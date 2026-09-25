-- ⏳ PENDIENTE DE APLICAR. Paso B de DOS — SOLO cuando `asegura-portal` y
-- `asegura` ya están desplegadas con el código que lee `caducaEn` como
-- opcional (PR #3570). Antes, el cliente Prisma viejo revienta al leer un NULL.
-- Requiere el paso A (`2026-09-25_portal_autorizacion_sin_caducidad_y_total.sql`).
--
-- Las vivas (pendientes y aceptadas) pasan a no caducar (decisión de Alberto,
-- 25/09/2026). La oferta pendiente olvidada la cubre la revisión anual, que
-- cuenta desde `otorgado_en`. Las caducadas se quedan como están: dejaron de
-- valer y resucitarlas sería conceder algo que nadie ha vuelto a conceder.

SET search_path = seguros, public;

BEGIN;

UPDATE seguros.portal_autorizacion
   SET caduca_en = NULL
 WHERE revocado_en IS NULL
   AND caduca_en > now();

COMMIT;
