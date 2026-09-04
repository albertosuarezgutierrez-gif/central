-- 04/09/2026 · Los campos ESPECÍFICOS DE CADA RAMO de la póliza que aporta el
-- cliente: una sola columna `jsonb` (`datos_ramo`) sobre
-- `seguros.portal_poliza_declarada`.
--
-- ✅ APLICADO el 04/09/2026 a la Supabase compartida por la sesión principal, y
-- verificado leyendo `information_schema.columns`: `datos_ramo` existe, es
-- `jsonb`, es NULLABLE y NO tiene default.
--
-- 🚨 Por qué el orden importaba: el `schema.prisma` declara `datosRamo`, y
-- Prisma SELECCIONA todas las columnas del modelo. Con el schema desplegado y
-- la columna sin crear, CUALQUIER consulta a `portal_poliza_declarada` se cae
-- con `column ... does not exist` — no solo las que la escriben. Schema y BD se
-- mueven en el mismo paso, igual que la contraseña de un rol y el env de su
-- proyecto Vercel.
--
-- ── Por qué UNA columna `jsonb` y no una columna por campo ──────────────────
-- Porque el conjunto de campos DEPENDE DEL RAMO y son puramente DESCRIPTIVOS.
-- El catálogo (`packages/module-seguros-portal/src/campos-ramo.ts`) tiene una
-- lista por ramo —hogar pregunta metros y año de construcción, vida pregunta
-- capital y modalidad, comercio pregunta actividad y superficie—, así que en
-- columnas serían decenas de campos NULL en la inmensa mayoría de las filas, y
-- cada ramo nuevo o cada campo nuevo del catálogo sería un `ALTER TABLE` con su
-- despliegue. Nadie los CONSULTA (no se filtra ni se agrupa por «año de
-- construcción»: se leen enteros al abrir la ficha), que es justo el caso en el
-- que un `jsonb` es la forma correcta y no un atajo.
--
-- 🚨 LO QUE **NO** VA AQUÍ, y es la línea que sostiene el diseño: los datos que
-- IDENTIFICAN EL BIEN. Matrícula, bastidor y fecha de matriculación son
-- COLUMNAS de esta misma tabla (`2026-09-03_portal_poliza_vehiculo.sql`) porque
-- se consultan, se indexan y tienen su propio CHECK. Meter aquí un dato que se
-- consulta crea dos sitios donde vive el mismo valor, y el día que discrepen
-- nadie sabrá cuál manda. La regla, para el que añada el siguiente campo: si
-- alguna consulta va a filtrar por él, es una COLUMNA; si solo se pinta, va
-- dentro de este JSON.
--
-- ── NULL, y nunca `{}` ─────────────────────────────────────────────────────
-- NULLABLE y SIN valor por defecto a propósito. `NULL` es «no se sabe / no se
-- ha declarado nada»; un `'{}'::jsonb` sería un objeto que EXISTE y está vacío,
-- o sea un «no lo sé» disfrazado de dato que pasa `IS NULL`, `??` y `COALESCE`
-- sin despeinarse (la lección de `subastas.tipo_bien` del CLAUDE.md de la raíz).
-- Por eso `DEFAULT '{}'` está prohibido aquí, y por eso el código escribe
-- `Prisma.DbNull` (el NULL de SQL) y NUNCA `Prisma.JsonNull`, que guardaría el
-- literal `null` DENTRO del JSON y volvería a colarse por todas esas guardas.
-- Quien decide qué claves entran es `normalizarDatosRamo()` del módulo puro:
-- una clave que no está en el catálogo del ramo se descarta, un valor de cajón
-- («n/a», «desconocido», «-») no se escribe, y si no queda ninguna clave el
-- resultado es NULL, no `{}`.
--
-- ── Permisos: NO hace falta ningún GRANT nuevo (comprobado, no supuesto) ────
-- Leído en `prisma/sql/2026-09-02_portal_rol_vinculo_grants.sql` (líneas 48-50):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON
--     ..., seguros.portal_poliza_declarada, ...
--   TO prisma_asegura_portal;
-- Es un grant a NIVEL DE TABLA, así que una columna nueva de una `portal_*`
-- queda concedida sola. El grant por COLUMNAS es el de la CARTERA (`clientes`,
-- `polizas`, `polizas_recibos`…), donde añadir una columna al modelo de Prisma
-- sin conceder antes mata la consulta ENTERA con `permission denied for column`
-- — de ahí el cepo de `test/regression-portal-aislamiento.test.ts` sobre el
-- `schema.prisma`. Aquí no aplica: `portal_poliza_declarada` es del portal.

ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS datos_ramo jsonb;

COMMENT ON COLUMN seguros.portal_poliza_declarada.datos_ramo IS
  'Campos DESCRIPTIVOS propios del ramo (hogar: metros y año; vida: capital y modalidad…), '
  'según el catálogo de packages/module-seguros-portal/src/campos-ramo.ts. jsonb y no columnas '
  'porque el conjunto depende del ramo y nadie filtra por ellos: se leen enteros al abrir la ficha. '
  'NULL = no se ha declarado nada; NUNCA ''{}'' ni un null dentro del JSON, que son «no lo sé» '
  'disfrazados de dato. Los identificadores del bien (matricula, bastidor, fecha_matriculacion) '
  'NO van aquí: son columnas, porque se consultan y se indexan.';
