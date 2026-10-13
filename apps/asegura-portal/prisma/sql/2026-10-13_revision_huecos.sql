-- ⏳ SIN APLICAR. Portal de Grupo ASegura — «Revisar mi póliza» con IA (13/10/2026).
--
-- Se aplica ANTES de desplegar el código que la usa (mismo paso). Sin ella el botón «Revisar mi póliza»
-- responde error (ruidoso); la ficha y el resto de la bóveda NO dependen de ella (lectura con catch).
-- ADITIVA: una tabla nueva. Los «huecos de protección» NO necesitan SQL (usan `portal_aviso_leido`).
--
-- Una fila por (póliza aportada, huella del documento): la huella es un SHA-256 de lo que se leyó de la
-- póliza (`lib/revision-poliza.ts`). Si el documento/los datos cambian, la huella cambia y se puede
-- revisar de nuevo; si no, se enseña lo cacheado y NO se llama a la IA. Las filas también cuentan el
-- tope diario por identidad (MAX_REVISIONES_DIA). Append-only: el rol solo INSERTA y LEE.
SET search_path = seguros, public;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_revision_poliza (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id         uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  poliza_declarada_id  uuid NOT NULL REFERENCES seguros.portal_poliza_declarada(id) ON DELETE CASCADE,
  huella               text NOT NULL CHECK (char_length(huella) = 64),
  -- Lista de {titulo, detalle}; [] = revisada y sin puntos que destacar (≠ no revisada: sin fila).
  puntos               jsonb NOT NULL CHECK (jsonb_typeof(puntos) = 'array'),
  creada_en            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_revision_poliza_una_por_huella UNIQUE (poliza_declarada_id, huella)
);

CREATE INDEX IF NOT EXISTS idx_portal_revision_poliza_identidad
  ON seguros.portal_revision_poliza (identidad_id, creada_en DESC);

-- Como el resto de `portal_*`: el aislamiento lo da el CÓDIGO (todo `where` lleva `identidad_id` de la cookie).
ALTER TABLE seguros.portal_revision_poliza DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON seguros.portal_revision_poliza TO prisma_asegura_portal;

-- Landmine de `apps/asegura-portal/CLAUDE.md` (24/09/2026): los privilegios por defecto dan DML a crm_seguros.
REVOKE ALL ON seguros.portal_revision_poliza FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_revision_poliza' ORDER BY 1, 2;
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS seguros.portal_revision_poliza;
--
-- ── Bloque Prisma (lo añade quien tenga el schema; el código actual usa $queryRaw y NO lo necesita) ──
-- model PortalRevisionPoliza {
--   id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
--   identidadId       String   @map("identidad_id") @db.Uuid
--   polizaDeclaradaId String   @map("poliza_declarada_id") @db.Uuid
--   huella            String
--   puntos            Json
--   creadaEn          DateTime @default(now()) @map("creada_en") @db.Timestamptz(6)
--   identidad PortalIdentidad @relation(fields: [identidadId], references: [id], onDelete: Cascade)
--   @@unique([polizaDeclaradaId, huella], map: "portal_revision_poliza_una_por_huella")
--   @@index([identidadId, creadaEn(sort: Desc)], map: "idx_portal_revision_poliza_identidad")
--   @@map("portal_revision_poliza")
--   @@schema("seguros")
-- }
