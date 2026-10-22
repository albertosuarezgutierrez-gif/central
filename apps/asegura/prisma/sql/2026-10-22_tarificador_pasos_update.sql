-- 22/10/2026 — La purga del tarificador (`lib/tarificador-purga.ts`) anula `captura_ref` de los pasos cuyo
-- documento se borra, pero el GRANT de 08/10/2026 solo dio SELECT, INSERT a `prisma_seguros`: el cron registraba
-- «permission denied for table tarificacion_trabajo_pasos» (42501) en cada pasada. Solo UPDATE (la purga no borra filas).
-- Se deshace con: revoke update on seguros.tarificacion_trabajo_pasos from prisma_seguros;
GRANT UPDATE ON seguros.tarificacion_trabajo_pasos TO prisma_seguros;

-- Verificación:
--   select privilege_type from information_schema.role_table_grants
--    where table_name='tarificacion_trabajo_pasos' and grantee='prisma_seguros';  -- SELECT, INSERT, UPDATE
