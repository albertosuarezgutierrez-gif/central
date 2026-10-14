-- ⏳ SIN APLICAR. OPCIONAL (endurecimiento, no lo necesita el código). 14/10/2026.
--
-- El correo de vencimiento (`apps/asegura/lib/avisos-vencimiento.ts`) LEE ahora
-- `seguros.portal_preferencias_avisos.canal` con el rol `prisma_seguros`. No hace falta GRANT nuevo:
-- medido el 14/10/2026 (information_schema.role_table_grants), `prisma_seguros` ya tiene
-- SELECT, INSERT, UPDATE, DELETE — por los DEFAULT PRIVILEGES del schema `seguros`, no por el DDL
-- del portal (que solo concede a `prisma_asegura_portal`).
--
-- `apps/asegura` no escribe esta tabla en ningún sitio (la escribe el portal, por identidad de la
-- cookie). Este fichero le deja SOLO lectura, como `portal_acceso` (2026-09-07). Se puede aplicar en
-- cualquier momento: el código desplegado solo hace SELECT. Si alguien añade una escritura desde
-- asegura, fallará con 42501 (ruidoso), que es lo que se quiere.
SET search_path = seguros, public;

BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON seguros.portal_preferencias_avisos FROM prisma_seguros;
GRANT SELECT ON seguros.portal_preferencias_avisos TO prisma_seguros;
COMMIT;

-- ── Verificación (solo lectura) ──────────────────────────────────────────────
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_preferencias_avisos' ORDER BY 1, 2;
-- Esperado para prisma_seguros: solo SELECT.
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- GRANT INSERT, UPDATE, DELETE ON seguros.portal_preferencias_avisos TO prisma_seguros;
