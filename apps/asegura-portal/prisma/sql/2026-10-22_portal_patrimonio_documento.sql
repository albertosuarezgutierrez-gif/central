-- Patrimonio en el portal del cliente — Fase 1, paso 8 (22/10/2026): DOCUMENTOS (ficheros en BD).
-- ✅ APLICADO 22/10/2026 por el MCP (verificado: SELECT 15 · INSERT 11 · UPDATE 2; crm_seguros 0; sin DELETE). Se aplica en el MISMO paso que el despliegue de asegura-portal que la usa
-- (regla del portal). Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado. IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de
-- objetos (el MCP de Supabase se cuelga con ellas), ni siquiera en comentarios: se aplica entera por el MCP.
-- 🚨 GRANT antes que schema: `schema.prisma` declara `PortalPatrimonioDocumento` con EXACTAMENTE las columnas que aquí se
-- conceden en SELECT (cepo `test/regression-portal-patrimonio-sql.test.ts`).
--
-- Decisión de Alberto (22/10/2026): los ficheros viven en BD (`bytea`, ≤ 10 MB, solo PDF/JPG/PNG/WebP), no en Storage.
--
-- ── Reglas que sostiene esta DDL ─────────────────────────────────────────────
--  1. Un documento cuelga de EXACTAMENTE UN owner (inmueble | contrato | inquilino) del MISMO titular: FK COMPUESTA
--     `(x_id, titular_id)` a los `UNIQUE (id, titular_id)` que ya existen, y `num_nonnulls(...) = 1`.
--  2. La carpeta existe PARA ESE owner (espejo de `lib/patrimonio/carpetas.ts`; cepo en el test del SQL).
--  3. El rol `prisma_asegura_portal` (SIN BYPASSRLS): SELECT/INSERT por columnas y UPDATE solo del sello de borrado.
--     Nunca DELETE. Borrar = sellar `borrado_en`; el fichero se queda (prueba y papelera). El trigger impide
--     «desborrar» y reescribir cualquier otra columna (también para `prisma_seguros`).
--  4. `crm_seguros`: REVOKE ALL (los inquilinos y sus papeles no son leads).
--  5. El tope diario (40/identidad, día de Madrid) lo cuenta el CÓDIGO con `creado_por_identidad_id, creado_en`;
--     por eso el índice y por eso los borrados también cuentan (no se puede subir-borrar en bucle).
SET search_path = seguros, public;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_documento (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id               uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  inmueble_id              uuid,
  contrato_id              uuid,
  inquilino_id             uuid,
  carpeta                  text NOT NULL CHECK (carpeta IN (
    'escritura', 'facturas', 'seguro_inmueble', 'fotos', 'otros_inmueble',
    'contrato_firmado', 'anexos', 'otros_contrato',
    'recibos', 'identificacion', 'otros_inquilino'
  )),
  nombre                   text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120),
  mime                     text NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes               integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256                   text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  contenido                bytea NOT NULL,
  creado_por_identidad_id  uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  borrado_en               timestamptz,
  borrado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  CONSTRAINT portal_patrimonio_documento_id_titular UNIQUE (id, titular_id),
  CONSTRAINT portal_patrimonio_documento_inmueble_del_titular
    FOREIGN KEY (inmueble_id, titular_id) REFERENCES seguros.portal_patrimonio_inmueble (id, titular_id),
  CONSTRAINT portal_patrimonio_documento_contrato_del_titular
    FOREIGN KEY (contrato_id, titular_id) REFERENCES seguros.portal_patrimonio_contrato (id, titular_id),
  CONSTRAINT portal_patrimonio_documento_inquilino_del_titular
    FOREIGN KEY (inquilino_id, titular_id) REFERENCES seguros.portal_patrimonio_inquilino (id, titular_id),
  CONSTRAINT portal_patrimonio_documento_un_owner CHECK (num_nonnulls(inmueble_id, contrato_id, inquilino_id) = 1),
  -- La carpeta tiene que ser de la taxonomía del owner (una carpeta de contrato no vale para un inmueble).
  CONSTRAINT portal_patrimonio_documento_carpeta_del_owner CHECK (
    (inmueble_id  IS NOT NULL AND carpeta IN ('escritura', 'facturas', 'seguro_inmueble', 'fotos', 'otros_inmueble')) OR
    (contrato_id  IS NOT NULL AND carpeta IN ('contrato_firmado', 'anexos', 'otros_contrato')) OR
    (inquilino_id IS NOT NULL AND carpeta IN ('recibos', 'identificacion', 'otros_inquilino'))
  ),
  CONSTRAINT portal_patrimonio_documento_tamano_real CHECK (octet_length(contenido) = size_bytes),
  -- Quién borró solo existe si está borrado (no hay «borrado por X» en un documento vivo).
  CONSTRAINT portal_patrimonio_documento_borrado_coherente CHECK (borrado_por_identidad_id IS NULL OR borrado_en IS NOT NULL)
);

-- Listados por owner (solo vivos, más recientes primero) y tope diario por identidad (cuenta también los borrados).
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_documento_inmueble
  ON seguros.portal_patrimonio_documento (titular_id, inmueble_id, creado_en DESC)
  WHERE inmueble_id IS NOT NULL AND borrado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_documento_contrato
  ON seguros.portal_patrimonio_documento (titular_id, contrato_id, creado_en DESC)
  WHERE contrato_id IS NOT NULL AND borrado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_documento_inquilino
  ON seguros.portal_patrimonio_documento (titular_id, inquilino_id, creado_en DESC)
  WHERE inquilino_id IS NOT NULL AND borrado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_documento_tope
  ON seguros.portal_patrimonio_documento (creado_por_identidad_id, creado_en);

-- Inmutable salvo el sello de borrado: no se «desborra», no se cambia el fichero, el owner ni la autoría. Única
-- excepción: poner a NULL la identidad (ON DELETE SET NULL de la supresión RGPD de una identidad es un UPDATE).
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_documento_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.titular_id IS DISTINCT FROM OLD.titular_id
     OR NEW.inmueble_id IS DISTINCT FROM OLD.inmueble_id
     OR NEW.contrato_id IS DISTINCT FROM OLD.contrato_id
     OR NEW.inquilino_id IS DISTINCT FROM OLD.inquilino_id
     OR NEW.carpeta IS DISTINCT FROM OLD.carpeta
     OR NEW.nombre IS DISTINCT FROM OLD.nombre
     OR NEW.mime IS DISTINCT FROM OLD.mime
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.contenido IS DISTINCT FROM OLD.contenido
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
     OR (NEW.creado_por_identidad_id IS DISTINCT FROM OLD.creado_por_identidad_id AND NEW.creado_por_identidad_id IS NOT NULL) THEN
    RAISE EXCEPTION 'portal_patrimonio_documento: un documento solo admite el sello de borrado' USING ERRCODE = '23514';
  END IF;
  IF OLD.borrado_en IS NOT NULL AND NEW.borrado_en IS DISTINCT FROM OLD.borrado_en THEN
    RAISE EXCEPTION 'portal_patrimonio_documento: un documento borrado no se recupera ni se vuelve a fechar' USING ERRCODE = '23514';
  END IF;
  -- Quién borró se escribe SOLO en el mismo UPDATE que sella `borrado_en` (vivo → borrado). Después solo puede pasar a NULL
  -- (ON DELETE SET NULL de la identidad): ni se reescribe, ni se rellena tras un SET NULL.
  IF NEW.borrado_por_identidad_id IS DISTINCT FROM OLD.borrado_por_identidad_id AND NEW.borrado_por_identidad_id IS NOT NULL
     AND NOT (OLD.borrado_en IS NULL AND NEW.borrado_en IS NOT NULL) THEN
    RAISE EXCEPTION 'portal_patrimonio_documento: quien borro solo se escribe al borrar' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- CREATE OR REPLACE (PG ≥ 14; central va en 17): idempotente sin quitar antes el trigger.
CREATE OR REPLACE TRIGGER portal_patrimonio_documento_inmutable
  BEFORE UPDATE ON seguros.portal_patrimonio_documento
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_documento_inmutable();

ALTER TABLE seguros.portal_patrimonio_documento DISABLE ROW LEVEL SECURITY;

-- Permisos: nunca DELETE; UPDATE solo del sello de borrado.
GRANT SELECT (id, titular_id, inmueble_id, contrato_id, inquilino_id, carpeta, nombre, mime, size_bytes, sha256, contenido,
              creado_por_identidad_id, creado_en, borrado_en, borrado_por_identidad_id)
  ON seguros.portal_patrimonio_documento TO prisma_asegura_portal;
GRANT INSERT (titular_id, inmueble_id, contrato_id, inquilino_id, carpeta, nombre, mime, size_bytes, sha256, contenido,
              creado_por_identidad_id)
  ON seguros.portal_patrimonio_documento TO prisma_asegura_portal;
GRANT UPDATE (borrado_en, borrado_por_identidad_id)
  ON seguros.portal_patrimonio_documento TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_documento FROM crm_seguros;
REVOKE DELETE, TRUNCATE ON seguros.portal_patrimonio_documento FROM prisma_seguros; -- aplicado 24/10/2026 (OK Alberto)

-- La factura leída con IA (paso 7) guarda su fichero como documento DEL MISMO titular. `documento_id` NULL = sin fichero
-- guardado (MATCH SIMPLE no comprueba la FK con una columna NULL). Sin ON DELETE: los documentos no se borran.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_gasto_documento_del_titular') THEN
    ALTER TABLE seguros.portal_patrimonio_gasto
      ADD CONSTRAINT portal_patrimonio_gasto_documento_del_titular
      FOREIGN KEY (documento_id, titular_id) REFERENCES seguros.portal_patrimonio_documento (id, titular_id);
  END IF;
END $$;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT grantee, privilege_type, count(*) FROM information_schema.column_privileges
--  WHERE table_schema = 'seguros' AND table_name = 'portal_patrimonio_documento' GROUP BY 1, 2 ORDER BY 1, 2;
--   -- prisma_asegura_portal: SELECT 15 · INSERT 11 · UPDATE 2; crm_seguros: 0 filas.
-- SELECT conname FROM pg_constraint WHERE conname = 'portal_patrimonio_gasto_documento_del_titular';
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- Solo si no hay filas (los documentos son del cliente: se sellan, no se borran), A MANO en el editor SQL de Supabase
-- (no por el MCP): quitar la constraint `portal_patrimonio_gasto_documento_del_titular`, luego la tabla
-- `seguros.portal_patrimonio_documento` y la función `seguros.portal_patrimonio_documento_inmutable()`.
