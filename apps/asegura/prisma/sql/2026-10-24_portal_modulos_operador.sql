-- 24/10/2026 — «Módulos del portal» desde la ficha de /correduria (plataforma → asegura
-- `POST /api/operador/cliente/portal-modulos`). Aplicada en producción el 24/10/2026.
--
-- `prisma_seguros` solo tenía SELECT sobre `seguros.portal_modulo` (Fase 0: la cola era de lectura). Para que el
-- corredor ACTIVE (insertar la fila ya `activo`, origen `corredor`, o promover una `solicitado`) y RETIRE, hace
-- falta INSERT y UPDATE, y solo de las columnas que el puerto toca. Sin DELETE. El rol del portal no cambia: sigue
-- sin poder autoactivarse.
-- Orden: aplicar ANTES (o a la vez) que el despliegue de asegura; sin esto el POST responde 500 `permisos`.
GRANT INSERT (identidad_id, modulo, estado, activado_en, origen) ON seguros.portal_modulo TO prisma_seguros;
GRANT UPDATE (estado, activado_en, retirado_en) ON seguros.portal_modulo TO prisma_seguros;

-- Verificación:
--   select column_name, privilege_type from information_schema.column_privileges
--    where table_schema='seguros' and table_name='portal_modulo' and grantee='prisma_seguros' order by 2, 1;
-- Marcha atrás:
--   revoke insert (identidad_id, modulo, estado, activado_en, origen) on seguros.portal_modulo from prisma_seguros;
--   revoke update (estado, activado_en, retirado_en) on seguros.portal_modulo from prisma_seguros;
