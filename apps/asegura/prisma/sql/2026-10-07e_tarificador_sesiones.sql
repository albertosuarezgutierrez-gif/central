-- Sesión MANUAL del tarificador RPA (07/10/2026). Portales con SMS en el acceso (Generali): Alberto inicia sesión
-- una vez a mano y el worker reutiliza ese storageState mientras siga vivo. Ver services/tarificador-rpa/src/
-- boveda-sesion.ts y sesion-manual.ts, y la ruta GET|PUT|DELETE /api/tarificador/sesion/[compania].
--
-- 🔒 `blob` es OPACO: AES-256-GCM sellado en el worker con el fly secret TARIFICADOR_SESION_KEY. Ni asegura, ni
--    Vercel, ni esta BD tienen la clave: aquí no se puede abrir. La caducidad buena va DENTRO del blob (autenticada);
--    `caduca_en` es la copia para que asegura conteste 404 y borre lo caducado sin poder leerlo.
-- 🛡️ Solo `prisma_seguros` (la app, puerto del worker). Ni `crm_seguros`, ni el portal del cliente, ni anon/authenticated.
--    RLS activada SIN políticas: cerrada para cualquier rol sin BYPASSRLS. `prisma_seguros` ES BYPASSRLS (bootstrap
--    2026-08-19), así que no necesita política; igual que el resto de tablas de `seguros`. No añadir políticas: abrirían
--    la tabla a roles sin BYPASSRLS.
--
-- Idempotente (IF NOT EXISTS). Se deshace con:  DROP TABLE seguros.tarificador_sesiones;
BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.tarificador_sesiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  -- Slug canónico de la compañía (lista blanca en lib/tarificador-sesion-reglas.ts).
  compania        text NOT NULL CHECK (compania ~ '^[a-z0-9-]{1,40}$'),
  -- Token `v1.<iv>.<datos>` en base64url. Tope igual que la ruta (MAX_TOKEN_CHARS).
  blob            text NOT NULL CHECK (length(blob) BETWEEN 20 AND 1000000),
  caduca_en       timestamptz NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarificador_sesiones_unica UNIQUE (correduria_id, compania)
);

COMMENT ON TABLE seguros.tarificador_sesiones IS
  'Sesión manual (storageState) de un portal de compañía, SELLADA por el worker del tarificador (AES-256-GCM, clave '
  'solo en Fly). Asegura la guarda opaca; caduca_en permite borrarla caducada sin abrirla.';

ALTER TABLE seguros.tarificador_sesiones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_sesiones FROM PUBLIC, anon, authenticated, crm_seguros;
DO $portal$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_asegura_portal') THEN
    EXECUTE 'REVOKE ALL ON seguros.tarificador_sesiones FROM prisma_asegura_portal';
  END IF;
END
$portal$;
-- DELETE sí: la sesión caducada o rechazada por el portal se BORRA (no se deja basura que parezca viva).
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.tarificador_sesiones TO prisma_seguros;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON seguros.tarificador_sesiones FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select count(*) from seguros.tarificador_sesiones;   -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'tarificador_sesiones' order by 1, 2;   -- solo prisma_seguros: DELETE, INSERT, SELECT, UPDATE
-- ════════════════════════════════════════════════════════════════════════════
