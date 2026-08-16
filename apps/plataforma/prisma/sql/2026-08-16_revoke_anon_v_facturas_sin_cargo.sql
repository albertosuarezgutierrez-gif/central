-- PROPUESTA de la auditoría profunda del 16/08/2026 — NO aplicada automáticamente
-- (regla de la casa: la auditoría nunca ejecuta migraciones en producción).
--
-- Supabase advisors (get_advisors "security") marca `v_facturas_sin_cargo` como el ÚNICO
-- ERROR del proyecto compartido: SECURITY DEFINER + grants por defecto de anon/authenticated
-- (SELECT e incluso INSERT/UPDATE/DELETE) sin el REVOKE explícito que sí se aplicó a
-- `mapa_arquitectura` el 10/07/2026. La vista expone proveedor/importe/nombre de archivo/URL
-- de Drive de las facturas personales de Alberto (ver
-- prisma/sql/2026-08-11_facturas_drive_movimiento_fk.sql, donde se creó).
--
-- Revisar y aplicar por Supabase MCP (execute_sql o apply_migration) solo si Alberto lo confirma.

REVOKE ALL ON v_facturas_sin_cargo FROM anon, authenticated;

ALTER VIEW v_facturas_sin_cargo SET (security_invoker = true);
