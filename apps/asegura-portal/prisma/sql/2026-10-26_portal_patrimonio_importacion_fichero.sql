-- Patrimonio en el portal del cliente — IMPORTAR DESDE EXCEL/CSV (P18, 26/10/2026).
-- ⏳ SIN APLICAR. Se aplica ANTES del despliegue de asegura-portal que lo usa: `schema.prisma` ya declara las columnas
-- nuevas de `portal_patrimonio_importacion` y, sin ellas en la BD, TODA lectura del modelo revienta (42703 / 42501).
-- Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado. IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de objetos
-- (el MCP de Supabase se cuelga con ellas), ni siquiera en comentarios; los CHECK se crean solo si no existen.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · `tipo` (inmueble · contrato · gasto): una importación trae UN tipo de dato. NULL = aún sin decidir (el fichero no se
--    pudo clasificar y el cliente tiene que elegirlo).
--  · `fichero_hash` (sha-256 del fichero subido), `fichero_nombre`, `filas_total`: identifican el fichero SIN guardarlo.
--    El índice único parcial impide tener dos importaciones ABIERTAS del mismo fichero para el mismo titular: subir el mismo
--    fichero otra vez devuelve la que ya está abierta (idempotente). Una vez confirmada o descartada, reimportarlo es legal:
--    cada fila se compara con lo que ya hay (clave natural) y lo existente se salta.
--  · `resultado` (jsonb): recuento al confirmar (creadas, ya existían, repetidas, apartadas, por validar). Es la AUDITORÍA de
--    la importación junto con identidad, titular y fechas de la propia fila; cada fila creada sella `creado_id`.
--  · `documento_id` SIGUE SIN FK, a propósito: el fichero de la hoja de cálculo NO se guarda. La tabla de documentos solo
--    admite PDF/imagen y exige un dueño (inmueble, contrato o inquilino); una FK allí no tendría a qué apuntar. El portal
--    lee el fichero en memoria, guarda las celdas útiles en `portal_patrimonio_importacion_fila.datos` (sin NIF, correo,
--    teléfono ni IBAN: se descartan al leer) y la BD las vacía al confirmar o descartar (trigger ya existente).
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT/INSERT/UPDATE solo de las columnas nuevas; nunca DELETE.
--  · `crm_seguros`: REVOKE ALL (otra vez): el CRM de Manuel no lee patrimonio.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_patrimonio_importacion
  ADD COLUMN IF NOT EXISTS tipo           text,
  ADD COLUMN IF NOT EXISTS fichero_hash   char(64),
  ADD COLUMN IF NOT EXISTS fichero_nombre text,
  ADD COLUMN IF NOT EXISTS filas_total    integer,
  ADD COLUMN IF NOT EXISTS resultado      jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_importacion_tipo_catalogo') THEN
    ALTER TABLE seguros.portal_patrimonio_importacion
      ADD CONSTRAINT portal_patrimonio_importacion_tipo_catalogo
        CHECK (tipo IS NULL OR tipo IN ('inmueble', 'contrato', 'gasto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_importacion_hash_hex') THEN
    ALTER TABLE seguros.portal_patrimonio_importacion
      ADD CONSTRAINT portal_patrimonio_importacion_hash_hex
        CHECK (fichero_hash IS NULL OR fichero_hash ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_importacion_filas_tope') THEN
    ALTER TABLE seguros.portal_patrimonio_importacion
      ADD CONSTRAINT portal_patrimonio_importacion_filas_tope
        CHECK (filas_total IS NULL OR filas_total BETWEEN 1 AND 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_importacion_nombre_largo') THEN
    ALTER TABLE seguros.portal_patrimonio_importacion
      ADD CONSTRAINT portal_patrimonio_importacion_nombre_largo
        CHECK (fichero_nombre IS NULL OR char_length(fichero_nombre) <= 120);
  END IF;
END $$;

-- Un mismo fichero (por titular) no puede tener dos importaciones ABIERTAS a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_importacion_fichero_abierto
  ON seguros.portal_patrimonio_importacion (titular_id, fichero_hash)
  WHERE fichero_hash IS NOT NULL AND estado IN ('propuesta', 'revisada');

-- Tope diario por identidad (se cuenta en BD) e historial.
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_importacion_identidad
  ON seguros.portal_patrimonio_importacion (identidad_id, creado_en DESC);

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-sql.test.ts`).
GRANT SELECT (tipo, fichero_hash, fichero_nombre, filas_total, resultado)
  ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;
GRANT INSERT (tipo, fichero_hash, fichero_nombre, filas_total)
  ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;
GRANT UPDATE (tipo, resultado)
  ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_importacion FROM crm_seguros;
REVOKE ALL ON seguros.portal_patrimonio_importacion_fila FROM crm_seguros;

COMMIT;
