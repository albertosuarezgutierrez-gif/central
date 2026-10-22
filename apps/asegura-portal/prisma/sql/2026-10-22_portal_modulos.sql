-- ✅ APLICADA el 22/10/2026 (proyecto central). Portal de Grupo ASegura — «Herramientas» (módulos), Fase 0 (22/10/2026).
--
-- Se aplica ANTES (o en el mismo paso) que el despliegue de asegura-portal que la usa: el
-- `schema.prisma` del portal ya declara `PortalModulo`. Sin la tabla, `/herramientas` pinta las
-- tarjetas «sin comprobar» (lectura con catch) y «Solicitar» responde error (ruidoso). ADITIVA.
--
-- ── QUÉ ES ───────────────────────────────────────────────────────────────────
-- Una fila por (identidad del portal, módulo) con su ciclo: `solicitado` → `activo` → `retirado`.
-- Es la activación por IDENTIDAD del portal (la persona que entra), no por ficha de la cartera:
-- quien pide puede no tener ficha (portal abierto a cualquiera) y la petición no puede esperar a eso.
-- Hoja de ruta: `docs/ASEGURA-PORTAL-MODULOS.md`.
--
-- 📌 NO se reutiliza `public.tenant_modulos`: es de plataforma (activaciones por TENANT de las apps
-- SaaS, usada solo por ialimp) y el rol del portal no debe tener permiso alguno fuera de `seguros`;
-- además aquí la clave es la identidad del portal, que no es un tenant.
--
-- ── Permisos ─────────────────────────────────────────────────────────────────
-- · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT de lo que pinta e INSERT SOLO de
--   (identidad_id, modulo, version_condiciones). `estado` y `origen` NO se le conceden en el INSERT:
--   nacen por DEFAULT `solicitado`/`portal`, así que el portal NO PUEDE autoactivarse un módulo.
--   Sin UPDATE ni DELETE en Fase 0: activar/retirar lo hace el corredor a mano.
-- · `prisma_seguros` (apps/asegura): SELECT, para que Alberto vea la cola por el puerto
--   `GET /api/operador/portal-modulos`.
-- · `crm_seguros`: REVOKE ALL (landmine del 24/09/2026: los privilegios por defecto le dan DML).
-- El aislamiento lo da el CÓDIGO (`apps/asegura-portal/lib/modulos.ts`: `identidad_id` de la cookie
-- dentro de cada `where` y de cada INSERT), no RLS.
SET search_path = seguros, public;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_modulo (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id        uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  -- Catálogo CERRADO: el mismo que `MODULOS_PORTAL` de `packages/module-seguros-portal/src/modulos.ts`.
  modulo              text NOT NULL CHECK (modulo IN ('flota', 'rrhh', 'alquileres')),
  estado              text NOT NULL DEFAULT 'solicitado' CHECK (estado IN ('solicitado', 'activo', 'retirado')),
  solicitado_en       timestamptz NOT NULL DEFAULT now(),
  activado_en         timestamptz,
  retirado_en         timestamptz,
  -- Versión del texto mostrado al pedir (`VERSION_CONDICIONES_MODULOS`). NULL = fila del corredor
  -- sin texto aceptado por la persona (no se inventa una versión).
  version_condiciones text,
  -- Quién creó la fila: la persona desde el portal o el corredor a mano.
  origen              text NOT NULL DEFAULT 'portal' CHECK (origen IN ('portal', 'corredor')),
  CONSTRAINT portal_modulo_activo_con_fecha   CHECK (estado <> 'activo'   OR activado_en IS NOT NULL),
  CONSTRAINT portal_modulo_retirado_con_fecha CHECK (estado <> 'retirado' OR retirado_en IS NOT NULL),
  -- Lo pedido desde el portal lleva SIEMPRE el texto aceptado.
  CONSTRAINT portal_modulo_portal_con_texto   CHECK (origen <> 'portal' OR version_condiciones IS NOT NULL)
);

-- Como mucho UNA fila vigente (no retirada) por persona y módulo: pedir dos veces = P2002
-- (`ya_solicitado`). Una retirada no bloquea volver a pedirlo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_modulo_vigente
  ON seguros.portal_modulo (identidad_id, modulo)
  WHERE estado <> 'retirado';

-- La cola del corredor: pendientes por antigüedad.
CREATE INDEX IF NOT EXISTS idx_portal_modulo_pendientes
  ON seguros.portal_modulo (solicitado_en)
  WHERE estado = 'solicitado';

ALTER TABLE seguros.portal_modulo DISABLE ROW LEVEL SECURITY;

-- 🚨 GRANT antes que schema: `schema.prisma` declara exactamente estas columnas.
GRANT SELECT (id, identidad_id, modulo, estado, solicitado_en, activado_en, retirado_en, version_condiciones, origen)
  ON seguros.portal_modulo TO prisma_asegura_portal;
GRANT INSERT (identidad_id, modulo, version_condiciones)
  ON seguros.portal_modulo TO prisma_asegura_portal;

GRANT SELECT ON seguros.portal_modulo TO prisma_seguros;

REVOKE ALL ON seguros.portal_modulo FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--  WHERE table_schema = 'seguros' AND table_name = 'portal_modulo' ORDER BY 1, 2, 3;
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_modulo' ORDER BY 1, 2;
--
-- ── Activar a mano (Fase 0, por el corredor con su rol de administración) ────
-- UPDATE seguros.portal_modulo SET estado = 'activo', activado_en = now()
--  WHERE id = '<id>' AND estado = 'solicitado';
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS seguros.portal_modulo;
