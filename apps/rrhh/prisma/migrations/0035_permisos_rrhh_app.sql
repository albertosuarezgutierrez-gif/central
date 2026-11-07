-- Permisos de rrhh_app en las tablas de 0032 y 0033 (07/11/2026). Idempotente: REVOKE ALL + GRANT exacto (repetirla deja lo mismo).
-- Motivo: los privilegios por defecto del schema `rrhh` (pg_default_acl) dan a rrhh_app TODO (arwdDxtm) en cada tabla nueva,
-- así que los GRANT acotados de 0032/0033 no restringían nada: situacion_familiar tenía DELETE, TRUNCATE y UPDATE de cualquier
-- columna (la 0032 quería histórico inborrable), y convenio_tablas_salariales tenía además TRUNCATE/REFERENCES/TRIGGER.
-- REVOKE ALL a nivel de tabla quita también los privilegios por columna; por eso se re-concede el UPDATE por columnas.
-- Las FK (RESTRICT/CASCADE) las comprueba Postgres como dueño de la tabla (postgres): no necesitan privilegios de rrhh_app.

-- 1) situacion_familiar (modelo 145): sin DELETE ni TRUNCATE; UPDATE SOLO para cerrar vigencia o enlazar la firma.
REVOKE ALL ON rrhh.situacion_familiar FROM rrhh_app;
GRANT SELECT, INSERT ON rrhh.situacion_familiar TO rrhh_app;
GRANT UPDATE (vigente_hasta, firma_documento_id) ON rrhh.situacion_familiar TO rrhh_app;

-- 2) convenio_tablas_salariales: lo que concede la 0033 (alta/corrección por INSERT ... ON CONFLICT DO UPDATE y borrado de fila).
REVOKE ALL ON rrhh.convenio_tablas_salariales FROM rrhh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.convenio_tablas_salariales TO rrhh_app;

-- NO se cambia el default ACL del schema `rrhh` (ALTER DEFAULT PRIVILEGES): afectaría a las demás tablas y al código que
-- hoy cuenta con él. Regla (apps/rrhh/CLAUDE.md): toda migración que cree tabla en rrhh debe hacer REVOKE ALL + GRANT
-- explícito a rrhh_app, porque el default ACL lo da todo.
