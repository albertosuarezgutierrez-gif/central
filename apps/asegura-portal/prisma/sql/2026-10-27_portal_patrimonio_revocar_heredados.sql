-- ✅ APLICADA 27/10/2026 (orden explícita de Alberto: «quita los permisos»).
-- Patrimonio — RECORTE de los privilegios que `prisma_seguros` HEREDÓ de los default privileges del schema `seguros`.
-- IDEMPOTENTE (REVOKE/GRANT se pueden repetir); no borra tablas ni datos ni columnas.
--
-- ── Por qué ───────────────────────────────────────────────────────────────────────────────────────────────────
--  Cada tabla nueva de `seguros` nace con SELECT/INSERT/UPDATE/DELETE para `prisma_seguros` (rol de apps/asegura) por
--  los default privileges del schema, aunque apps/asegura no la use. Lo que preocupaba: `portal_patrimonio_recomendacion`
--  (guarda `correo_hash` del invitado, un tercero que aún no es cliente). Escribir en patrimonio es cosa del PORTAL
--  (`prisma_asegura_portal`, GRANT por columnas); a `prisma_seguros` se le deja SOLO lo que su código usa HOY.
--  Inventario hecho por grep de apps/asegura (lib/patrimonio-*.ts, lib/indices-renta.ts, app/api/cron/indices-renta,
--  app/api/portal/patrimonio/*) el 27/10/2026. Ninguna otra app conecta con `prisma_seguros` a estas tablas
--  (`packages/module-patrimonio` es TS puro; `apps/plataforma` recibe los datos por /api/operador/*).
--  Los triggers de estas tablas son SECURITY INVOKER pero solo tocan la propia fila/tabla (comprobado en pg_trigger);
--  las FK (RI) se comprueban como dueño de la tabla, no como el rol: no hace falta conceder nada en las tablas padre.
--
-- ── Qué NO se toca y por qué ──────────────────────────────────────────────────────────────────────────────────
--  · `backup_seguros` (SELECT en todas): es el rol de las copias de seguridad; quitárselo deja la tabla FUERA del backup.
--  · `portal_patrimonio_senal` (S/I/U/D): la escribe y purga el motor de señales (lib/patrimonio-senales.ts,
--    lib/patrimonio-supresion.ts: retención 24 meses y supresión RGPD).
--  · `portal_patrimonio_indice` (S/I): cron del INE, append-only (recortado ya en 2026-10-22_portal_patrimonio.sql).
--  · `portal_patrimonio_renta_actualizacion`: se deja SELECT y la columna UPDATE (notificada_en) concedida a propósito.
--    🚨 NO se hace `REVOKE UPDATE` de tabla aquí: en Postgres revocar el privilegio de TABLA arrastra también los de columna.
--  · `crm_seguros` y `prisma_asegura_portal`: sin cambios (ya van por su propio REVOKE ALL / GRANT por columnas).
--
-- ⚠️ Pendiente (no es este fichero): los default privileges del schema siguen vivos, así que la PRÓXIMA tabla
--    `portal_patrimonio_*` volverá a nacer con DML para `prisma_seguros`. Cada SQL nuevo debe recortarlo él mismo.
SET search_path = seguros, public;

BEGIN;

-- 1) Tablas que apps/asegura NO lee ni escribe → nada.
REVOKE ALL ON seguros.portal_patrimonio_recomendacion      FROM prisma_seguros;  -- correo_hash del invitado
REVOKE ALL ON seguros.portal_patrimonio_aviso_inquilino    FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_comunidad          FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_derrama            FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_documento          FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_enlace_inquilino   FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_importacion_fila   FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_inmueble_comunidad FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_inquilino_acceso   FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_inquilino_consentimiento FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_obligacion         FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_plantilla_gasto    FROM prisma_seguros;
REVOKE ALL ON seguros.portal_patrimonio_recibo_compartido  FROM prisma_seguros;

-- 2) Tablas que apps/asegura solo LEE → SELECT y nada más.
--    titular/inmueble/gasto/importacion: lib/patrimonio-conversion.ts (/api/operador/patrimonio-conversion);
--    titular/inmueble/inmueble_poliza/contrato: lib/patrimonio-senales.ts; contrato/titular: lib/patrimonio-inquilino-portal.ts;
--    inmueble/inmueble_poliza/contrato/renta_actualizacion/titular: lib/patrimonio-pedir-precio-portal.ts.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_titular         FROM prisma_seguros;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_inmueble        FROM prisma_seguros;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_inmueble_poliza FROM prisma_seguros;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_contrato        FROM prisma_seguros;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_gasto           FROM prisma_seguros;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_importacion     FROM prisma_seguros;
GRANT SELECT ON seguros.portal_patrimonio_titular, seguros.portal_patrimonio_inmueble, seguros.portal_patrimonio_inmueble_poliza,
                seguros.portal_patrimonio_contrato, seguros.portal_patrimonio_gasto, seguros.portal_patrimonio_importacion
  TO prisma_seguros;
-- renta_actualizacion: sin UPDATE de tabla (ver arriba: conserva la columna notificada_en).
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_renta_actualizacion FROM prisma_seguros;
GRANT SELECT ON seguros.portal_patrimonio_renta_actualizacion TO prisma_seguros;

-- 3) El PUENTE del inquilino (lib/patrimonio-inquilino-portal.ts, /api/portal/patrimonio/inquilino): la PII cifrada solo la
--    puede escribir asegura (tiene la clave). Lee, da de alta y reactiva (UPDATE archivado_en/papel); NUNCA borra.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_inquilino          FROM prisma_seguros;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON seguros.portal_patrimonio_contrato_inquilino FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.portal_patrimonio_inquilino, seguros.portal_patrimonio_contrato_inquilino TO prisma_seguros;

COMMIT;

-- Verificación (estado esperado tras aplicar):
--   select table_name, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
--   where table_schema = 'seguros' and table_name like 'portal_patrimonio_%' and grantee = 'prisma_seguros' group by 1;
--   → senal DELETE,INSERT,SELECT,UPDATE · indice INSERT,SELECT · inquilino y contrato_inquilino INSERT,SELECT,UPDATE ·
--     titular, inmueble, inmueble_poliza, contrato, gasto, importacion, renta_actualizacion SELECT · el resto, ninguna fila.
--   backup_seguros: SELECT en todas, sin cambios.
