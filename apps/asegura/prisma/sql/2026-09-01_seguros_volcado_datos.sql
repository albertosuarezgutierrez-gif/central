-- =============================================================================
-- Volcado de la correduría: DATOS (origen de Manuel → schema `seguros` de central)
-- =============================================================================
-- ORDEN DE EJECUCIÓN:
--   1. `2026-09-01_seguros_volcado_ddl.sql`   (enums, tablas, constraints, índices)
--   2. ESTE FICHERO                            (datos, por dblink)
--   3. `2026-09-01_seguros_volcado_fks.sql`    (las 131 FKs — y su verificación)
--
-- Las FKs van al FINAL a propósito: sin ellas activas el orden de carga da igual,
-- y crearlas después es la prueba más dura de que el volcado está completo (si
-- alguna falla, falta una fila).
--
-- Copia SERVER-SIDE por `dblink`: los datos van de Postgres a Postgres sin pasar
-- por ninguna sesión, ningún fichero intermedio y ningún transcript. Es la única
-- vía viable: `pg_dump` local es 16.x y el origen es 17.6, así que se niega a
-- volcarlo.
--
-- ✅ EJECUTADO el 02/09/2026: 52 tablas, 86.628 filas, 131 FKs, 0 desajustes.
--    Cómo se consiguió la credencial (el 01/09 quedó bloqueado por ella): el
--    `execute_sql` del conector de Supabase entra en el proyecto de Manuel como
--    `supabase_read_only_user`, pero `apply_migration` entra como `postgres`.
--    Con eso se creó un rol temporal `traspaso_lectura` (LOGIN, BYPASSRLS,
--    SELECT sobre public), se puso su URL en el Vault, se copió, y al acabar
--    se DIO DE BAJA el rol y se VACIÓ el secreto (la contraseña pasó por la
--    sesión). Para re-sincronizar: repetir esos tres pasos. URL que funciona
--    desde central: pooler `aws-1-eu-central-1.pooler.supabase.com:5432` con
--    usuario `rol.uijsgeocgdaxkhvwtjqs` (el host directo `db.<ref>` rechaza la
--    conexión y el clúster `aws-0` no conoce el tenant).
--
-- 🔐 LA CREDENCIAL NO ESTÁ EN ESTE FICHERO Y NO DEBE ESTARLO.
--    Se lee del Vault de Supabase de central, dentro del bloque, y nunca se
--    devuelve en ningún resultado. Antes de ejecutar, crear el secreto:
--      Panel de Supabase (wswbehlcuxqxyinousql) → Integrations → Vault → New secret
--      name  = asegura_origen_url
--      value = la cadena de conexión de SOLO LECTURA al origen
--              (el ASEGURA_DATABASE_URL del proyecto Vercel `central-asegura`,
--               rol `central_asegura`, SELECT-only)
--
-- ⚠️ Esta copia mete en la BD compartida de la casa datos personales de ~32.600
--    personas (DNI, IBAN, carnets de conducir). El rol `prisma_seguros` es
--    BYPASSRLS: a partir de aquí el aislamiento es responsabilidad del CÓDIGO,
--    como ya advierte `apps/asegura/CLAUDE.md`. No es un efecto secundario
--    inesperado: es la consecuencia asumida de tener la cartera en casa.
--
-- ⚠️ Y ESTO NO AUTORIZA A QUE MANUEL BORRE NADA. Las columnas sensibles llegan
--    cifradas y seguirán ilegibles sin las dos claves (cifrado de campo + índice
--    ciego). Antes de que él borre hacen falta DOS pruebas sobre ESTA copia:
--    descifrar un registro real Y buscar un cliente conocido por email y por DNI.
--    La segunda es la que importa: sin la clave del índice ciego la búsqueda no
--    falla, devuelve vacío, y la pantalla dice «no existe ese cliente» sobre uno
--    que está ahí.
-- =============================================================================

-- Bitácora del volcado: qué se copió, cuánto y cuándo. Sirve de prueba.
CREATE TABLE IF NOT EXISTS seguros._volcado_control (
  tabla            text PRIMARY KEY,
  filas_insertadas bigint NOT NULL,
  copiado_at       timestamptz NOT NULL DEFAULT now()
);

DO $volcado$
DECLARE
  v_conn   text;
  v_tabla  text;
  v_cols   text;
  v_filas  bigint;
BEGIN
  SELECT decrypted_secret INTO v_conn
  FROM vault.decrypted_secrets
  WHERE name = 'asegura_origen_url';

  IF v_conn IS NULL OR length(v_conn) = 0 THEN
    RAISE EXCEPTION
      'Falta el secreto `asegura_origen_url` en el Vault de este proyecto. '
      'Créalo antes de ejecutar (ver la cabecera de este fichero).';
  END IF;

  -- Recorre SOLO las tablas del volcado: se excluyen las del portal (`portal_*`,
  -- que son nuestras y nacen vacías) y la propia bitácora.
  FOR v_tabla IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'seguros'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'portal\_%'
      AND c.relname <> '_volcado_control'
      -- Y SOLO lo que existe en el origen. `seguros` ya tiene tablas propias de
      -- central (p. ej. `codeoscopic_consumo`, del 01/09) que el origen no conoce;
      -- sin esta guarda el bloque falla en esa tabla y hace ROLLBACK de todo lo
      -- copiado antes (le pasó el 02/09/2026: 0 filas tras copiar 20 tablas).
      AND c.relname IN (
        SELECT t FROM dblink(v_conn, $q$SELECT tablename FROM pg_tables WHERE schemaname = 'public'$q$) AS o(t text)
      )
    ORDER BY c.relname
  LOOP
    -- Idempotencia: una tabla ya copiada no se vuelve a copiar. Sin esto, un
    -- segundo pase duplicaría todo lo que no tenga UNIQUE.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM seguros._volcado_control WHERE tabla = v_tabla
    );

    -- La lista `nombre tipo` se construye desde el catálogo LOCAL, en el mismo
    -- orden de columnas que el origen (el DDL se generó por attnum). Escribirla
    -- a mano para 51 tablas sería la forma más fácil de colar un desajuste.
    SELECT string_agg(
             quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod),
             ', ' ORDER BY a.attnum)
      INTO v_cols
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'seguros' AND c.relname = v_tabla
      AND a.attnum > 0 AND NOT a.attisdropped;

    BEGIN
      EXECUTE format(
        'INSERT INTO seguros.%I SELECT * FROM dblink(%L, %L) AS origen(%s)',
        v_tabla,
        v_conn,
        format('SELECT * FROM public.%I', v_tabla),
        v_cols
      );
    EXCEPTION WHEN OTHERS THEN
      -- El mensaje de dblink puede arrastrar la cadena de conexión. Se corta aquí
      -- y se re-lanza sin ella: un error no puede ser la vía por la que se filtra
      -- una credencial a un log.
      RAISE EXCEPTION 'Fallo copiando la tabla %: %', v_tabla, regexp_replace(SQLERRM, v_conn, '***', 'g')
        USING HINT = 'Revisa que el rol del secreto tenga SELECT sobre public.' || v_tabla;
    END;

    GET DIAGNOSTICS v_filas = ROW_COUNT;
    INSERT INTO seguros._volcado_control (tabla, filas_insertadas)
    VALUES (v_tabla, v_filas);

    RAISE NOTICE 'copiada %: % filas', v_tabla, v_filas;
  END LOOP;
END
$volcado$;

-- =============================================================================
-- VERIFICACIÓN — origen contra destino, tabla a tabla
-- =============================================================================
-- Ejecutar después. Cualquier fila con `cuadra = false` es un volcado incompleto:
-- NO dar la copia por buena hasta que salgan todas en true.
--
-- (Vuelve a leer el secreto del Vault; tampoco lo expone.)

CREATE OR REPLACE FUNCTION seguros._volcado_verificar()
RETURNS TABLE (tabla text, filas_origen bigint, filas_destino bigint, cuadra boolean)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_conn text;
  r      record;
  v_org  bigint;
  v_dst  bigint;
BEGIN
  SELECT decrypted_secret INTO v_conn
  FROM vault.decrypted_secrets WHERE name = 'asegura_origen_url';

  IF v_conn IS NULL THEN
    RAISE EXCEPTION 'Falta el secreto `asegura_origen_url` en el Vault.';
  END IF;

  FOR r IN
    SELECT c.relname AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'seguros' AND c.relkind = 'r'
      AND c.relname NOT LIKE 'portal\_%' AND c.relname <> '_volcado_control'
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM seguros.%I', r.t) INTO v_dst;
    EXECUTE format(
      'SELECT n FROM dblink(%L, %L) AS x(n bigint)',
      v_conn, format('SELECT count(*) FROM public.%I', r.t)
    ) INTO v_org;

    tabla := r.t; filas_origen := v_org; filas_destino := v_dst;
    cuadra := (v_org = v_dst);
    RETURN NEXT;
  END LOOP;
END
$fn$;

-- SELECT * FROM seguros._volcado_verificar() ORDER BY cuadra, tabla;
--
-- Y el resumen de una línea, que es el que hay que mirar primero:
-- SELECT count(*) FILTER (WHERE NOT cuadra) AS tablas_que_no_cuadran,
--        sum(filas_destino) AS filas_copiadas
-- FROM seguros._volcado_verificar();
