-- ⏳ SIN APLICAR (26/10/2026). Se aplica solo con OK de Alberto y en el MISMO paso que el despliegue de asegura-portal que la usa
--    (regla del portal). 🚨 GRANT antes que schema: `schema.prisma` ya declara estos modelos con EXACTAMENTE las columnas que aquí
--    se conceden en SELECT (cepo `test/regression-portal-patrimonio-sql.test.ts`). Sin esta DDL, cualquier consulta a esos modelos
--    cae con 42P01 / 42501.
-- Patrimonio — P17: ENLACE CON EL INQUILINO (26/10/2026). ADITIVA: una columna nueva en `portal_patrimonio_enlace_inquilino`,
-- una restricción UNIQUE (destino de FK) en esa tabla y en `portal_patrimonio_documento`, y tres tablas nuevas.
--
-- Spec: `docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md` · Plan: P17 del plan de patrimonio fase 1.
--
-- ── Reglas que sostiene esta DDL (el código no puede garantizarlas solo) ─────
--  1. Un enlace es de UN USO: `enlace_id` UNIQUE en el acceso. El segundo canje del mismo enlace choca con el índice (23505).
--  2. El acceso ata una IDENTIDAD del portal a UN par (contrato, inquilino) por FK compuesta al enlace: no se puede fabricar un
--     acceso a un contrato que no es el del enlace.
--  3. Revocable por ambos lados, y la revocación es un sello que no se deshace (trigger): vuelve a entrar con un enlace nuevo.
--  4. El consentimiento comercial del inquilino es APPEND-ONLY (el rol solo SELECT + INSERT): el último gesto manda.
--  5. El recibo compartido ata documento + inquilino + titular por FK compuesta: solo se puede compartir un documento DE ESE
--     inquilino, del MISMO titular que el contrato. Retirar = sello `retirado_en`.
--  6. Rol `prisma_asegura_portal`: GRANT por COLUMNAS, nunca DELETE. `crm_seguros`: REVOKE ALL en cada tabla (lo del inquilino
--     es un encargo de tratamiento del propietario: el CRM jamás lo lee; no son leads).
SET search_path = seguros, public;

BEGIN;

-- ─── 1. Enlace: el nombre con el que el propietario se presenta al inquilino ────────────────────────────
-- NULL = enlace anterior a P17 (la pantalla dice «tu propietario»). Es lo ÚNICO del propietario que ve el inquilino.
ALTER TABLE seguros.portal_patrimonio_enlace_inquilino
  ADD COLUMN IF NOT EXISTS contacto_nombre text
  CHECK (contacto_nombre IS NULL OR char_length(btrim(contacto_nombre)) BETWEEN 1 AND 80);

-- Destino de la FK compuesta del acceso (regla 2).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_enlace_id_par') THEN
    ALTER TABLE seguros.portal_patrimonio_enlace_inquilino
      ADD CONSTRAINT portal_patrimonio_enlace_id_par UNIQUE (id, contrato_id, inquilino_id);
  END IF;
  -- Destino de la FK compuesta del recibo compartido (regla 5): un documento solo se comparte con SU inquilino.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_documento_id_titular_inquilino') THEN
    ALTER TABLE seguros.portal_patrimonio_documento
      ADD CONSTRAINT portal_patrimonio_documento_id_titular_inquilino UNIQUE (id, titular_id, inquilino_id);
  END IF;
END $$;

-- ─── 2. Acceso: la identidad del inquilino ligada a UN contrato ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_inquilino_acceso (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE = un enlace, un uso (regla 1).
  enlace_id     uuid NOT NULL UNIQUE,
  contrato_id   uuid NOT NULL,
  inquilino_id  uuid NOT NULL,
  identidad_id  uuid NOT NULL REFERENCES seguros.portal_identidad (id) ON DELETE CASCADE,
  aceptado_en   timestamptz NOT NULL DEFAULT now(),
  revocado_en   timestamptz,
  revocado_por  text CHECK (revocado_por IN ('propietario', 'inquilino')),
  CONSTRAINT portal_patrimonio_inquilino_acceso_revocacion_par CHECK ((revocado_en IS NULL) = (revocado_por IS NULL)),
  CONSTRAINT portal_patrimonio_inquilino_acceso_enlace_del_par
    FOREIGN KEY (enlace_id, contrato_id, inquilino_id)
    REFERENCES seguros.portal_patrimonio_enlace_inquilino (id, contrato_id, inquilino_id),
  CONSTRAINT portal_patrimonio_inquilino_acceso_id_identidad UNIQUE (id, identidad_id)
);
-- Una identidad no tiene dos accesos VIVOS al mismo par.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_inquilino_acceso_vivo
  ON seguros.portal_patrimonio_inquilino_acceso (contrato_id, inquilino_id, identidad_id) WHERE revocado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_inquilino_acceso_identidad
  ON seguros.portal_patrimonio_inquilino_acceso (identidad_id) WHERE revocado_en IS NULL;

-- Inmutable salvo el sello de revocación; y una revocación no se deshace ni se re-fecha (regla 3).
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_inquilino_acceso_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.enlace_id IS DISTINCT FROM OLD.enlace_id
     OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     OR NEW.inquilino_id IS DISTINCT FROM OLD.inquilino_id
     OR NEW.identidad_id IS DISTINCT FROM OLD.identidad_id
     OR NEW.aceptado_en IS DISTINCT FROM OLD.aceptado_en THEN
    RAISE EXCEPTION 'portal_patrimonio_inquilino_acceso: solo admite el sello de revocacion' USING ERRCODE = '23514';
  END IF;
  IF OLD.revocado_en IS NOT NULL AND (NEW.revocado_en IS DISTINCT FROM OLD.revocado_en OR NEW.revocado_por IS DISTINCT FROM OLD.revocado_por) THEN
    RAISE EXCEPTION 'portal_patrimonio_inquilino_acceso: una revocacion no se deshace ni se vuelve a fechar' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER portal_patrimonio_inquilino_acceso_inmutable
  BEFORE UPDATE ON seguros.portal_patrimonio_inquilino_acceso
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_inquilino_acceso_inmutable();

-- ─── 3. Consentimiento comercial PROPIO del inquilino (append-only) ─────────────────────────────────────
-- El último gesto manda (`estadoConsentimiento`). `concedido=false` = retirada. `version_texto` = la del texto que vio.
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_inquilino_consentimiento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acceso_id     uuid NOT NULL,
  identidad_id  uuid NOT NULL REFERENCES seguros.portal_identidad (id) ON DELETE CASCADE,
  concedido     boolean NOT NULL,
  version_texto text NOT NULL CHECK (char_length(btrim(version_texto)) BETWEEN 1 AND 60),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  -- El acceso es de ESA identidad: nadie consiente "por" otro.
  CONSTRAINT portal_patrimonio_inquilino_consentimiento_acceso_de_identidad
    FOREIGN KEY (acceso_id, identidad_id) REFERENCES seguros.portal_patrimonio_inquilino_acceso (id, identidad_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_inquilino_consentimiento_identidad
  ON seguros.portal_patrimonio_inquilino_consentimiento (identidad_id, creado_en DESC);

-- ─── 4. Recibos que el propietario marca como compartidos con el inquilino ──────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_recibo_compartido (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id                  uuid NOT NULL,
  contrato_id                 uuid NOT NULL,
  inquilino_id                uuid NOT NULL,
  documento_id                uuid NOT NULL,
  compartido_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  creado_en                   timestamptz NOT NULL DEFAULT now(),
  retirado_en                 timestamptz,
  -- Contrato del MISMO titular, inquilino DE ese contrato, documento DE ese inquilino y del MISMO titular (regla 5).
  CONSTRAINT portal_patrimonio_recibo_contrato_del_titular
    FOREIGN KEY (contrato_id, titular_id) REFERENCES seguros.portal_patrimonio_contrato (id, titular_id),
  CONSTRAINT portal_patrimonio_recibo_inquilino_del_contrato
    FOREIGN KEY (contrato_id, inquilino_id) REFERENCES seguros.portal_patrimonio_contrato_inquilino (contrato_id, inquilino_id),
  CONSTRAINT portal_patrimonio_recibo_documento_del_inquilino
    FOREIGN KEY (documento_id, titular_id, inquilino_id)
    REFERENCES seguros.portal_patrimonio_documento (id, titular_id, inquilino_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_recibo_compartido_vivo
  ON seguros.portal_patrimonio_recibo_compartido (contrato_id, inquilino_id, documento_id) WHERE retirado_en IS NULL;

-- ─── 5. Permisos ────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE seguros.portal_patrimonio_inquilino_acceso         DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_inquilino_consentimiento DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_recibo_compartido        DISABLE ROW LEVEL SECURITY;

-- enlace: el propietario escribe el nombre de contacto al crearlo (el resto de grants del enlace ya existen).
GRANT SELECT (contacto_nombre) ON seguros.portal_patrimonio_enlace_inquilino TO prisma_asegura_portal;
GRANT INSERT (contacto_nombre) ON seguros.portal_patrimonio_enlace_inquilino TO prisma_asegura_portal;

-- acceso: nace al canjear el enlace; después solo se REVOCA.
GRANT SELECT (id, enlace_id, contrato_id, inquilino_id, identidad_id, aceptado_en, revocado_en, revocado_por)
  ON seguros.portal_patrimonio_inquilino_acceso TO prisma_asegura_portal;
GRANT INSERT (enlace_id, contrato_id, inquilino_id, identidad_id)
  ON seguros.portal_patrimonio_inquilino_acceso TO prisma_asegura_portal;
GRANT UPDATE (revocado_en, revocado_por)
  ON seguros.portal_patrimonio_inquilino_acceso TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_inquilino_acceso FROM crm_seguros;

-- consentimiento: APPEND-ONLY (sin UPDATE).
GRANT SELECT (id, acceso_id, identidad_id, concedido, version_texto, creado_en)
  ON seguros.portal_patrimonio_inquilino_consentimiento TO prisma_asegura_portal;
GRANT INSERT (acceso_id, identidad_id, concedido, version_texto)
  ON seguros.portal_patrimonio_inquilino_consentimiento TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_inquilino_consentimiento FROM crm_seguros;

-- recibo compartido: el propietario comparte (INSERT) y retira (sello); nunca se borra.
GRANT SELECT (id, titular_id, contrato_id, inquilino_id, documento_id, compartido_por_identidad_id, creado_en, retirado_en)
  ON seguros.portal_patrimonio_recibo_compartido TO prisma_asegura_portal;
GRANT INSERT (titular_id, contrato_id, inquilino_id, documento_id, compartido_por_identidad_id)
  ON seguros.portal_patrimonio_recibo_compartido TO prisma_asegura_portal;
GRANT UPDATE (retirado_en)
  ON seguros.portal_patrimonio_recibo_compartido TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_recibo_compartido FROM crm_seguros;

-- `prisma_seguros` (apps/asegura) recibe DML por los privilegios por defecto del schema: el consentimiento es APPEND-ONLY
-- también para él.
REVOKE UPDATE, DELETE ON seguros.portal_patrimonio_inquilino_consentimiento FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.portal_patrimonio_inquilino_consentimiento TO prisma_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT table_name, grantee, privilege_type, count(*) FROM information_schema.column_privileges
--  WHERE table_schema = 'seguros' AND table_name IN ('portal_patrimonio_inquilino_acceso', 'portal_patrimonio_inquilino_consentimiento',
--    'portal_patrimonio_recibo_compartido') GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
--   -- prisma_asegura_portal: acceso SELECT 8 · INSERT 4 · UPDATE 2; consentimiento SELECT 6 · INSERT 4; recibo SELECT 8 · INSERT 5 · UPDATE 1.
--   -- crm_seguros: 0 filas.
