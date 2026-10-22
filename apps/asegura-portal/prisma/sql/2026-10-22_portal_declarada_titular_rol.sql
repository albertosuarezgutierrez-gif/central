-- Portal de Grupo ASegura — «¿Qué eres en X?» al declarar una póliza como de tu empresa (22/10/2026).
--
-- ⏳ SIN APLICAR. 🚨 Se aplica ANTES del despliegue de asegura-portal que la usa: su `schema.prisma`
-- ya declara `titular_rol_declarado`, y sin la columna CUALQUIER consulta a `portal_poliza_declarada`
-- cae con 42703 (bóveda, hoja QR, partes, calendario). Es ADITIVA: el código viejo sigue
-- funcionando sobre ella. `apps/asegura` NO la declara (lee por GRANT de columna): no le afecta.
--
-- ── Qué guarda ───────────────────────────────────────────────────────────────
-- Tras subir una póliza cuyo TOMADOR leído es una empresa, el portal pregunta «Esta póliza está a
-- nombre de X. ¿Es de tu empresa?» y, si dice que sí, «¿Qué eres en X?». Opcional y saltable.
--   NULL            = no lo dijo (o no se le preguntó). NO es «otro».
--   'propietario' | 'administrador' | 'empleado' | 'otro' = lo que contestó.
-- Solo tiene sentido con `titular_tipo = 'empresa'` (CHECK): un rol en una empresa que no consta no
-- significa nada. 🔒 Es una DECLARACIÓN: no da a la identidad acceso a la ficha de la empresa.
--
-- ── GRANTs ───────────────────────────────────────────────────────────────────
-- · `prisma_asegura_portal`: SELECT/UPDATE por columna (lo escribe el PATCH; el alta no la toca).
--   Se repite aunque haya grant de tabla (idempotente; patrón de `2026-10-22_portal_poliza_vigente_declarada.sql`).
-- · `prisma_seguros`: SELECT por columna, para que la correduría la lea cuando la declare.
-- · Columna en tabla existente: no hay REVOKE a `crm_seguros` que añadir.

SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS titular_rol_declarado text;

ALTER TABLE seguros.portal_poliza_declarada
  DROP CONSTRAINT IF EXISTS portal_poliza_titular_rol_valido;
ALTER TABLE seguros.portal_poliza_declarada
  ADD CONSTRAINT portal_poliza_titular_rol_valido
  CHECK (
    titular_rol_declarado IS NULL
    OR (titular_rol_declarado IN ('propietario', 'administrador', 'empleado', 'otro') AND titular_tipo = 'empresa')
  );

COMMENT ON COLUMN seguros.portal_poliza_declarada.titular_rol_declarado IS
  'Lo que el cliente dice ser en la empresa titular: propietario | administrador | empleado | otro. NULL = no lo dijo. Solo con titular_tipo=empresa. Declaracion: no da acceso a la ficha de la empresa.';

GRANT SELECT (titular_rol_declarado), UPDATE (titular_rol_declarado)
  ON seguros.portal_poliza_declarada TO prisma_asegura_portal;
GRANT SELECT (titular_rol_declarado)
  ON seguros.portal_poliza_declarada TO prisma_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
--  WHERE table_schema = 'seguros' AND table_name = 'portal_poliza_declarada' AND column_name = 'titular_rol_declarado';
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'portal_poliza_titular_rol_valido';
-- SELECT has_column_privilege('prisma_asegura_portal', 'seguros.portal_poliza_declarada', 'titular_rol_declarado', 'UPDATE');
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- 🚨 Primero se REVIERTE EL CÓDIGO (el schema.prisma que la declara): quitar la columna con el código
-- nuevo desplegado tumba toda lectura de declaradas con 42703.
--   ALTER TABLE seguros.portal_poliza_declarada DROP CONSTRAINT IF EXISTS portal_poliza_titular_rol_valido;
--   ALTER TABLE seguros.portal_poliza_declarada DROP COLUMN IF EXISTS titular_rol_declarado;
