-- Vertical TALLER — 0014: VARIOS roles por persona, capacidades extra y capacidades por rol EDITABLES por taller (07/11/2026).
-- Requiere 0001-0013. IDEMPOTENTE y ADITIVA. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (BYPASSRLS),
-- preview → prod tras OK de Alberto. 🚨 Aplicarla ANTES de desplegar el código que la usa (Prisma pide las columnas nuevas).
--
-- Lógica en `@central/module-taller` (src/permisos.ts): capacidades efectivas = unión de las de cada rol de la persona
-- (según `configuracion.capacidades_por_rol`, NULL = valores por defecto del módulo) + sus `capacidades_extra`. El dueño lo
-- tiene todo y no se edita. «ajustes», «usuarios» y «pedidos_enviar» son SOLO del dueño (ni en un rol ni como extra).
--
--  1) `usuarios_taller.roles text[]` (+ backfill `ARRAY[rol]`). La columna `rol` SE CONSERVA como «rol principal» (login,
--     cookie, código viejo): un trigger la mantiene = el de más alcance de `roles` (dueño > admin > recepción > mecánico) y,
--     si alguien inserta solo `rol` (código anterior a 0014), rellena `roles = ARRAY[rol]`.
--  2) `usuarios_taller.capacidades_extra text[]` (vacío = ninguna).
--  3) `configuracion.capacidades_por_rol jsonb` (NULL = por defecto). CHECK con `taller.capacidades_por_rol_valido()`.
-- Las listas de aquí ≡ ROLES_TALLER / CAPACIDADES / CAPACIDADES_RESERVADAS_DUENO del módulo (cepo test/esquema-sql-0014.test.ts).
-- RLS intacto (no se toca ninguna política). «Al menos un dueño activo» lo asegura la app (`errorUltimoDueno`) dentro de la
-- transacción de Ajustes, igual que la baja desde 0001.
BEGIN;

ALTER TABLE taller.usuarios_taller ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';
ALTER TABLE taller.usuarios_taller ADD COLUMN IF NOT EXISTS capacidades_extra text[] NOT NULL DEFAULT '{}';
ALTER TABLE taller.configuracion ADD COLUMN IF NOT EXISTS capacidades_por_rol jsonb;

-- Capacidades que se pueden dar a un rol o como extra (todas menos las reservadas al dueño).
CREATE OR REPLACE FUNCTION taller.capacidades_delegables() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ARRAY['recepcion','ordenes_ver','ordenes_todas','ordenes_gestionar','ordenes_avanzar','ot_trabajo','ampliaciones',
               'partes','presupuestos','precios_ver','contacto_cliente_ver','margenes_ver','citas','facturar',
               'facturas_rectificar','almacen']::text[]
$$;

-- NULL o { "admin"|"recepcion"|"mecanico": [capacidad delegable, …] }. Nunca "dueno".
CREATE OR REPLACE FUNCTION taller.capacidades_por_rol_valido(j jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT j IS NULL OR (
    jsonb_typeof(j) = 'object' AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(j) e
      WHERE e.key NOT IN ('admin','recepcion','mecanico')
         OR jsonb_typeof(e.value) <> 'array'
         OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(e.value) x
              WHERE jsonb_typeof(x) <> 'string' OR NOT ((x #>> '{}') = ANY (taller.capacidades_delegables()))
            )
    )
  )
$$;

-- Rol principal ≡ `rolPrincipal` del módulo; `roles` vacío (código viejo que solo escribe `rol`) → ARRAY[rol].
CREATE OR REPLACE FUNCTION taller.usuarios_taller_sincronizar_rol() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[NEW.rol];
  END IF;
  NEW.rol := CASE
    WHEN 'dueno' = ANY (NEW.roles) THEN 'dueno'
    WHEN 'admin' = ANY (NEW.roles) THEN 'admin'
    WHEN 'recepcion' = ANY (NEW.roles) THEN 'recepcion'
    WHEN 'mecanico' = ANY (NEW.roles) THEN 'mecanico'
    ELSE NEW.rol
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_usuarios_taller_sincronizar_rol ON taller.usuarios_taller;
CREATE TRIGGER trg_usuarios_taller_sincronizar_rol
  BEFORE INSERT OR UPDATE OF rol, roles ON taller.usuarios_taller
  FOR EACH ROW EXECUTE FUNCTION taller.usuarios_taller_sincronizar_rol();

-- Backfill: cada persona conserva su rol de hoy como único rol. Idempotente (solo filas sin roles).
-- Si quien aplica NO saltara RLS, no vería filas y el CHECK de abajo FALLARÍA (rollback), no se aplicaría a medias.
UPDATE taller.usuarios_taller SET roles = ARRAY[rol] WHERE cardinality(roles) = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_taller_roles_chk') THEN
    ALTER TABLE taller.usuarios_taller ADD CONSTRAINT usuarios_taller_roles_chk
      CHECK (cardinality(roles) >= 1 AND roles <@ ARRAY['dueno','admin','recepcion','mecanico']::text[] AND rol = ANY (roles));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_taller_capacidades_extra_chk') THEN
    ALTER TABLE taller.usuarios_taller ADD CONSTRAINT usuarios_taller_capacidades_extra_chk
      CHECK (capacidades_extra <@ taller.capacidades_delegables());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'configuracion_capacidades_por_rol_chk') THEN
    ALTER TABLE taller.configuracion ADD CONSTRAINT configuracion_capacidades_por_rol_chk
      CHECK (taller.capacidades_por_rol_valido(capacidades_por_rol));
  END IF;
END $$;

-- Permisos mínimos del rol de la app (la tabla ya tenía SELECT/INSERT/UPDATE desde 0002; se deja explícito por columna).
GRANT SELECT (roles, capacidades_extra), UPDATE (rol, roles, capacidades_extra, actualizado_en) ON taller.usuarios_taller TO prisma_taller;
GRANT SELECT (capacidades_por_rol), UPDATE (capacidades_por_rol, actualizado_en) ON taller.configuracion TO prisma_taller;
GRANT EXECUTE ON FUNCTION taller.capacidades_delegables() TO prisma_taller;
GRANT EXECUTE ON FUNCTION taller.capacidades_por_rol_valido(jsonb) TO prisma_taller;

COMMIT;

-- Comprobación tras aplicar (debe dar 0 y 0):
-- SELECT count(*) FROM taller.usuarios_taller WHERE cardinality(roles) = 0 OR NOT (rol = ANY (roles));
-- SELECT count(*) FROM taller.configuracion WHERE NOT taller.capacidades_por_rol_valido(capacidades_por_rol);
