-- Formador del tarificador RPA (06/10/2026): corrige los permisos que dejó 2026-10-06b.
--
-- El schema `seguros` tiene default privileges de postgres (`prisma_seguros=arwd`), así que las tablas
-- nuevas nacen con SELECT/INSERT/UPDATE/DELETE para la app aunque el GRANT del fichero sea más corto; el
-- REVOKE de 2026-10-06b no los quitaba (solo PUBLIC/anon/authenticated/crm_seguros).
--   · `tarificador_intervenciones` es el RASTRO de lo que hizo la IA y su coste: solo SELECT + INSERT
--     (`on conflict do nothing` del cierre solo necesita INSERT).
--   · `tarificador_acompanamiento` CONSERVA UPDATE (upsert `on conflict ... do update` y `select ... for
--     update` en `cerrarAcompanamiento`); solo pierde DELETE.
--
-- ✅ APLICADA el 06/10/2026 (migración `tarificador_formador_revoke_rastro`). Idempotente.
-- Se deshace con: GRANT UPDATE, DELETE ON seguros.tarificador_intervenciones TO prisma_seguros;
--                 GRANT DELETE ON seguros.tarificador_acompanamiento TO prisma_seguros;
REVOKE UPDATE, DELETE ON seguros.tarificador_intervenciones FROM prisma_seguros;
REVOKE DELETE ON seguros.tarificador_acompanamiento FROM prisma_seguros;
