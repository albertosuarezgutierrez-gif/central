-- Cómo salió el ÚLTIMO intento de vincular esta identidad con una ficha de la
-- cartera. Se sella en el canje del código, que es el único momento en que el
-- portal tiene el correo en claro: `portal_canal` solo guarda un hash con
-- pimienta propia, que no sirve para el índice ciego y no se revierte.
--
-- 🚨 Sin esto, /boveda no puede distinguir «no eres cliente» de «tu correo está
-- en dos fichas y lo estamos revisando», y le dice a los dos que no hemos
-- encontrado ninguna póliza a su nombre — que para el segundo es FALSO: sí se
-- han encontrado, y por eso precisamente no se le enseña ninguna.
--
-- Es una COLUMNA y no una tabla a propósito: solo interesa el último intento.
-- El histórico de quién intentó entrar y cómo salió no es un dato que ninguna
-- pantalla pida, y guardarlo sería acumular rastro de gente por si acaso.
--
-- ✅ APLICADA el 06/09/2026 contra la Supabase compartida, en la misma sesión
--    que el código que la usa (la lección de `portal_supresion`, 05/09/2026: su
--    código llegó a producción con la tabla sin crear y /boveda entera habría
--    reventado; no golpeó a nadie por suerte, no por diseño).
alter table seguros.portal_identidad
  add column if not exists ultimo_vinculo text,
  add column if not exists ultimo_vinculo_en timestamptz;

-- El vocabulario es el de `EstadoVinculo` de lib/vinculo.ts. Un valor fuera de
-- la lista es un error de programación, no un estado nuevo: que lo pare la BD.
alter table seguros.portal_identidad
  drop constraint if exists portal_identidad_ultimo_vinculo_valido;
alter table seguros.portal_identidad
  add constraint portal_identidad_ultimo_vinculo_valido check (
    ultimo_vinculo is null
    or ultimo_vinculo in ('ok', 'ya_vinculada', 'sin_ficha', 'ambiguo', 'sin_clave', 'error')
  );

-- Y el sello sin fecha no vale: un estado sin cuándo se midió no se puede
-- envejecer, y la bóveda tendría que decidir si fiarse de él a ciegas. La
-- igualdad cubre las DOS direcciones — una fecha sin estado es igual de inútil.
alter table seguros.portal_identidad
  drop constraint if exists portal_identidad_ultimo_vinculo_con_fecha;
alter table seguros.portal_identidad
  add constraint portal_identidad_ultimo_vinculo_con_fecha check (
    (ultimo_vinculo is null) = (ultimo_vinculo_en is null)
  );

-- 🚨 El GRANT va ANTES que el modelo de Prisma, no después. El rol tiene SELECT
-- por COLUMNAS: declarar en `schema.prisma` una columna sin conceder hace que
-- **todas** las lecturas de PortalIdentidad revienten con `permission denied
-- for column` (42501), no solo esa. Typecheckea, compila y muere en producción.
grant select (id, nombre, creada_en, ultimo_acceso_en, ultimo_vinculo, ultimo_vinculo_en)
  on seguros.portal_identidad to prisma_asegura_portal;
grant update (ultimo_acceso_en, ultimo_vinculo, ultimo_vinculo_en)
  on seguros.portal_identidad to prisma_asegura_portal;

-- ── Los tres cepos, VISTOS MORDER el 06/09/2026 ─────────────────────────────
-- Sobre una fila de prueba creada y borrada en el mismo bloque (la tabla tenía
-- 5 identidades reales antes y después):
--   1) ultimo_vinculo = 'lo_que_sea'          → 23514
--   2) ultimo_vinculo = 'ambiguo', fecha NULL → 23514
--   3) ultimo_vinculo NULL, fecha = now()     → 23514
--   4) ultimo_vinculo = 'ambiguo' + fecha     → entra
-- Un CHECK que nadie ha visto morder es una suposición, no un cepo.
