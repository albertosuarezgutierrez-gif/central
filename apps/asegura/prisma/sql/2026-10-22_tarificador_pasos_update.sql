-- 22/10/2026 — La purga del tarificador (`lib/tarificador-purga.ts`) anula `captura_ref` de los pasos cuyo
-- documento se borra, pero el GRANT de 08/10/2026 solo dio SELECT, INSERT a `prisma_seguros`: el cron registraba
-- «permission denied for table tarificacion_trabajo_pasos» (42501) en cada pasada. UPDATE solo de esa columna
-- (la purga no borra filas ni toca otras columnas).
-- Se deshace con: revoke update (captura_ref) on seguros.tarificacion_trabajo_pasos from prisma_seguros;
GRANT UPDATE (captura_ref) ON seguros.tarificacion_trabajo_pasos TO prisma_seguros;

-- Verificación:
--   select column_name, privilege_type from information_schema.column_privileges
--    where table_name='tarificacion_trabajo_pasos' and grantee='prisma_seguros' and privilege_type='UPDATE';  -- solo captura_ref
