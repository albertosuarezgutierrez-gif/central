-- 04/09/2026 · Dos columnas sobre `seguros.portal_poliza_declarada`:
--   1. `referencia_catastral` — el identificador del BIEN inmueble, el
--      equivalente de la matrícula para hogar / comercio / comunidades.
--   2. `datos_ramo_origen`   — de dónde salió CADA campo de `datos_ramo`.
--
-- ✅ **APLICADO el 04/09/2026** por la sesión principal contra la Supabase
-- compartida (schema `seguros`). Verificado leyendo `information_schema.columns`:
-- las dos columnas existen, y `has_column_privilege()` confirma que el rol
-- `prisma_asegura_portal` puede LEERLAS y ESCRIBIRLAS (el GRANT sobre `portal_*`
-- es de tabla, así que una columna nueva entra sola; en la cartera, que es por
-- columnas, habría hecho falta un GRANT explícito).
--
-- Por qué importaba el orden: Prisma SELECCIONA todas las columnas del modelo
-- por su nombre, así que mientras `schema.prisma` las declaraba y la BD no las
-- tenía, CUALQUIER consulta a `portal_poliza_declarada` —también las que solo
-- leen— se caía con `column ... does not exist`. Schema y BD se mueven en el
-- mismo paso, igual que la contraseña de un rol y el env de su proyecto Vercel.
--
-- ── 1. Por qué `referencia_catastral` es COLUMNA y no una clave de `datos_ramo` ─
-- Porque IDENTIFICA EL BIEN, no lo describe. Es exactamente el mismo caso que la
-- matrícula y el bastidor (`2026-09-03_portal_poliza_vehiculo.sql`): «¿tengo otra
-- póliza de esta misma vivienda?» es una CONSULTA, y una consulta sobre una clave
-- enterrada en un `jsonb` no se indexa ni se puede filtrar sin escribir SQL de
-- JSON en media app. La regla que ya estaba escrita en `2026-09-04_portal_datos_ramo.sql`
-- («si alguna consulta va a filtrar por él, es una COLUMNA; si solo se pinta, va
-- dentro del JSON») se aplica aquí a sí misma: el 04/09/2026 se había decidido
-- meterla en el JSON, y esto lo CORRIGE antes de que haya una sola fila escrita.
--
-- 🚨 **VEINTE caracteres, no catorce.** La referencia de **20** es la del
-- INMUEBLE (el piso concreto). La de **14** es la de la FINCA: el edificio entero
-- o la parcela. Guardar una de 14 aquí como si fuera la vivienda trae los metros
-- del EDIFICIO a una póliza de hogar — un número plausible y equivocado, que es
-- el peor tipo de dato, y que en un siniestro se paga como infraseguro. Por eso
-- el CHECK exige 20 y por eso el código distingue los dos casos con un error
-- propio (`referencia_catastral_de_finca`), para poder decirle a la persona «esa
-- es la del edificio, necesitamos la de tu piso» en vez de «no es válida».
--
-- `text` y NULLABLE, sin default: `NULL` es «no se sabe». Nunca `''` ni `'N/A'`
-- —un centinela se cuela por `IS NULL`, `??` y `COALESCE` y termina pisando dato
-- bueno (la lección de `subastas.tipo_bien` del CLAUDE.md de la raíz)—. Los
-- centinelas se anulan ANTES de escribir, en `lib/poliza-editable.ts`, que es la
-- MISMA fuente para lo que lee la IA de un PDF y para lo que teclea la persona.
--
-- ── 2. Por qué hace falta `datos_ramo_origen` ───────────────────────────────
-- Porque **76 m² del Catastro y 76 m² estimados a ojo no valen lo mismo**, y hoy
-- no se distinguen: la póliza entera es `procedencia = 'declarado'`. Sin esto no
-- se puede saber sobre qué te apoyas al tarificar, ni decirle a la persona qué
-- campos convendría confirmar.
--
-- Es un `jsonb` **hermano** de `datos_ramo`, con la MISMA forma: clave del
-- catálogo → origen (`catastro` | `documento` | `declarado`, el vocabulario de
-- `packages/module-seguros-portal/src/direccion-catastro.ts`). Va en jsonb por la
-- misma razón que su hermano —el conjunto de claves depende del ramo y nadie
-- filtra por él— y va SEPARADO en vez de envolver cada valor en
-- `{valor, origen}` porque así `datos_ramo` no cambia de forma: lo que ya está
-- escrito sigue leyéndose igual, y una pantalla que no sepa de orígenes no
-- necesita saber nada nuevo.
--
-- 🚨 **Un origen sin su dato es una mentira**: «los metros vienen del Catastro»
-- cuando no hay metros es lo que luego pinta un sello de «verificado» sobre un
-- hueco. `normalizarOrigenes()` descarta los huérfanos ANTES de escribir, y por
-- eso los orígenes viajan SIEMPRE junto a sus datos: un parche que cambia
-- `datos_ramo` reescribe también esta columna (ver la cabecera de
-- `lib/poliza-editable.ts`). No hay CHECK en la BD sobre el vocabulario a
-- propósito: sería una segunda copia de la lista de orígenes, y el día que el
-- módulo añada uno nuevo el CHECK lo rechazaría sin que nada explicara por qué.
--
-- ── NULL, y nunca `{}` (las dos columnas de JSON) ──────────────────────────
-- NULLABLE y SIN default. `NULL` = «no se sabe / no se ha declarado nada»; un
-- `'{}'::jsonb` sería un objeto que EXISTE y está vacío, o sea un «no lo sé»
-- disfrazado de dato que pasa `IS NULL`, `??` y `COALESCE` sin despeinarse. Por
-- eso `DEFAULT '{}'` está prohibido aquí y el código escribe `Prisma.DbNull` (el
-- NULL de SQL) y JAMÁS `Prisma.JsonNull`, que guardaría el literal `null` DENTRO
-- del JSON y volvería a colarse por todas esas guardas.
--
-- ── Permisos: NO hace falta ningún GRANT nuevo (comprobado, no supuesto) ────
-- Leído en `prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql`, líneas 48-51:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON
--     seguros.portal_identidad, seguros.portal_canal, seguros.portal_codigo,
--     seguros.portal_bien, seguros.portal_poliza_declarada,
--     seguros.portal_consentimiento, seguros.portal_vinculo
--     TO prisma_asegura_portal;
-- Es un grant a NIVEL DE TABLA, así que una columna nueva de una `portal_*` queda
-- concedida sola. El grant por COLUMNAS es el de la CARTERA (`clientes`,
-- `polizas`, `poliza_recibos`…), donde añadir una columna al modelo de Prisma sin
-- conceder antes mata la consulta ENTERA con `permission denied for column` — de
-- ahí el cepo de `test/regression-portal-aislamiento.test.ts` sobre el
-- `schema.prisma`. Aquí no aplica: `portal_poliza_declarada` es del portal.

ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS referencia_catastral text,
  ADD COLUMN IF NOT EXISTS datos_ramo_origen    jsonb;

-- Cepo en la BD además de en el código. La validación de verdad vive en
-- `lib/poliza-editable.ts` sobre `formatoReferencia()` del módulo puro (una sola
-- fuente para el extractor y para la corrección a mano); esto es la red de abajo,
-- para que ninguna escritura futura —un script, un backfill, otra app— meta aquí
-- una referencia de FINCA (14) creyendo que identifica la vivienda.
-- 20 caracteres, mayúsculas y dígitos, sin espacios ni guiones: el código
-- compacta y pone en mayúsculas antes de escribir (`normalizarReferencia`).
-- NOT VALID: no se valida contra las filas ya existentes (hoy ninguna tiene
-- referencia, pero eso no se supone: se deja explícito y se puede validar después
-- con `VALIDATE CONSTRAINT` cuando haya datos que mirar).
-- (En un DO porque `ADD CONSTRAINT` no admite `IF NOT EXISTS`: sin esto,
-- reejecutar el fichero entero se cae aquí y parece que ha fallado la migración.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_poliza_referencia_catastral_forma'
  ) THEN
    ALTER TABLE seguros.portal_poliza_declarada
      ADD CONSTRAINT portal_poliza_referencia_catastral_forma
      CHECK (referencia_catastral IS NULL OR referencia_catastral ~ '^[A-Z0-9]{20}$') NOT VALID;
  END IF;
END $$;

-- 🔎 ESTE ÍNDICE ES LO QUE HACE QUE SEA UNA COLUMNA. «¿Tengo otra póliza de esta
-- misma vivienda?» y «¿de quién es este inmueble?» son las consultas que
-- justifican el campo, exactamente igual que `idx_portal_poliza_matricula` para
-- el coche. Parcial: la inmensa mayoría de las filas no son de inmueble (auto,
-- vida, salud…) y tendrán NULL, así que el índice solo pesa lo que pesa lo que
-- sí existe.
CREATE INDEX IF NOT EXISTS idx_portal_poliza_referencia_catastral
  ON seguros.portal_poliza_declarada (referencia_catastral)
  WHERE referencia_catastral IS NOT NULL;

COMMENT ON COLUMN seguros.portal_poliza_declarada.referencia_catastral IS
  'Referencia catastral del INMUEBLE asegurado: 20 caracteres alfanuméricos en mayúsculas, '
  'compactada (sin espacios, puntos ni guiones). Identifica el BIEN, no el contrato, y por eso '
  'es columna y no una clave de datos_ramo: se consulta e indexa («¿tengo otra póliza de esta '
  'misma vivienda?»). 🚨 NUNCA una referencia de 14 caracteres: esa es la de la FINCA (el '
  'edificio o la parcela) y traería los metros del edificio a una póliza de hogar. '
  'NULL = no se sabe; nunca '''' ni un valor de cajón.';

COMMENT ON COLUMN seguros.portal_poliza_declarada.datos_ramo_origen IS
  'De dónde salió CADA campo de datos_ramo: clave del catálogo → origen (catastro | documento | '
  'declarado), vocabulario de packages/module-seguros-portal/src/direccion-catastro.ts. Hermano '
  'de datos_ramo y con sus mismas claves: 76 m² del Catastro y 76 m² estimados a ojo no valen lo '
  'mismo, y la procedencia de la PÓLIZA (declarado) no lo distingue. Un origen sin su dato es una '
  'afirmación sobre algo que no existe: normalizarOrigenes() descarta los huérfanos y los orígenes '
  'se reescriben SIEMPRE junto a datos_ramo. NULL = no se sabe de dónde vino nada; NUNCA ''{}'' ni '
  'un null dentro del JSON.';
