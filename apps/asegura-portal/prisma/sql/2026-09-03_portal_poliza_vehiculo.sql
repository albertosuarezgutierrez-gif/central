-- 03/09/2026 · Los identificadores del BIEN en la póliza que aporta el cliente:
-- matrícula, bastidor (VIN) y fecha de primera matriculación.
--
-- ✅ APLICADO el 03/09/2026 a la Supabase compartida (schema `seguros`), y
-- verificado leyendo `information_schema.columns`: las tres columnas están.
-- Se aplicó ANTES de mergear a propósito: el `schema.prisma` de la app las
-- declara, y sin ellas en la BD cualquier consulta a `portal_poliza_declarada`
-- se cae con `column ... does not exist`. Schema y BD se mueven en el mismo
-- paso, igual que la contraseña de un rol y el env de su proyecto Vercel.
--
-- ── Por qué estas tres, y por qué aquí ──────────────────────────────────────
-- Son datos del VEHÍCULO, no del contrato: sobreviven a la póliza y son los
-- mismos si el cliente cambia de compañía. Su sitio natural es `portal_bien`
-- (que ya existe, con su `datos jsonb`), pero hoy el cliente los aporta dentro
-- del PDF de su póliza y no hay pantalla que cree el bien. Viven en la póliza
-- declarada mientras eso no exista; el día que haya ficha de vehículo, esta es
-- la columna que se migra, no un campo suelto dentro de un JSON.
--
-- El BASTIDOR es el que de verdad hace falta: identifica la VERSIÓN EXACTA del
-- vehículo, que es lo que ni CIMA ni el cliente saben decir. Por eso mismo se
-- guarda validado (17 caracteres, sin I/O/Q — ISO 3779) o no se guarda: un
-- bastidor mal leído no es un dato incompleto, es OTRO coche, y con él se pide
-- precio y se declara un siniestro.
--
-- `text` y NULLABLE a propósito, y sin valor por defecto: `NULL` es «no se
-- sabe». Nunca `''` ni `'N/A'` — un centinela se cuela por `IS NULL`, `??` y
-- `COALESCE` y termina pisando dato bueno (la lección de `subastas.tipo_bien`).
-- Los centinelas se anulan ANTES de escribir, en `lib/poliza-editable.ts`.
--
-- ── Permisos: NO hace falta ningún GRANT nuevo (comprobado, no supuesto) ─────
-- `prisma_asegura_portal` tiene el grant a nivel de TABLA sobre las `portal_*`
-- (`GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.portal_poliza_declarada`,
-- en `2026-09-02_portal_rol_vinculo_grants.sql`), no por columnas, así que las
-- columnas nuevas quedan concedidas solas. El grant por COLUMNAS es el de la
-- CARTERA (`clientes`, `polizas`…), donde añadir una al modelo de Prisma sin
-- conceder antes mata la consulta entera con `permission denied for column`.

ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS matricula          text,
  ADD COLUMN IF NOT EXISTS bastidor           text,
  ADD COLUMN IF NOT EXISTS fecha_matriculacion date;

-- Cepo en la BD además de en el código. La validación de verdad vive en
-- `lib/poliza-editable.ts` (una sola fuente para el extractor y para la
-- corrección a mano); esto es la red de abajo, para que ninguna escritura
-- futura —un script, un backfill, otra app— meta un bastidor que no lo es.
-- 17 caracteres, mayúsculas y dígitos, SIN I, O ni Q: la ISO 3779 las excluye
-- para que no se confundan con 1 y 0.
-- NOT VALID: no se valida contra las filas ya existentes (hoy no hay ninguna
-- con bastidor, pero eso no se supone: se deja explícito y se puede validar
-- después con `VALIDATE CONSTRAINT` cuando haya datos que mirar).
-- (En un DO porque `ADD CONSTRAINT` no admite `IF NOT EXISTS`: sin esto,
-- reejecutar el fichero entero se cae aquí y parece que ha fallado la migración.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_poliza_bastidor_forma'
  ) THEN
    ALTER TABLE seguros.portal_poliza_declarada
      ADD CONSTRAINT portal_poliza_bastidor_forma
      CHECK (bastidor IS NULL OR bastidor ~ '^[A-HJ-NPR-Z0-9]{17}$') NOT VALID;
  END IF;
END $$;

-- Buscar «de quién es este coche» es la consulta que justifica el campo.
-- Parciales: la inmensa mayoría de las filas no son de auto y tendrán NULL.
CREATE INDEX IF NOT EXISTS idx_portal_poliza_matricula
  ON seguros.portal_poliza_declarada (matricula)
  WHERE matricula IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_poliza_bastidor
  ON seguros.portal_poliza_declarada (bastidor)
  WHERE bastidor IS NOT NULL;

COMMENT ON COLUMN seguros.portal_poliza_declarada.matricula IS
  'Matrícula del vehículo, compactada y en mayúsculas. NULL = no se sabe.';
COMMENT ON COLUMN seguros.portal_poliza_declarada.bastidor IS
  'VIN (ISO 3779): 17 caracteres sin I, O ni Q. NULL = no se sabe; nunca un valor de cajón.';
COMMENT ON COLUMN seguros.portal_poliza_declarada.fecha_matriculacion IS
  'Primera matriculación del vehículo. NO es la fecha de efecto ni la de vencimiento de la póliza.';
