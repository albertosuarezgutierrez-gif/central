-- 🚨 NO SE HA EJECUTADO. Lo aplica la sesión principal contra la Supabase
-- compartida, en el MISMO paso que el cambio de `schema.prisma` (Prisma pide
-- cada columna del modelo por su nombre: si el schema declara una que la BD no
-- tiene, muere la consulta ENTERA, no esa columna).
--
-- ── QUÉ ABRE ESTO ───────────────────────────────────────────────────────────
--
-- Hasta hoy `portal_autorizacion.autorizado_cliente_id` era NOT NULL, o sea que
-- **solo se podía autorizar a alguien que YA fuera cliente de la correduría**.
-- Eso convertía en imposible el caso que de verdad pasa —el hijo que pide ver
-- la póliza de su padre y que no es cliente de nadie— y contradecía la idea del
-- producto: el portal es gratis y abierto a todo el mundo, cliente o no, porque
-- ahí está la captación.
--
-- A partir de aquí una autorización puede apuntar a una FICHA o a una IDENTIDAD
-- del portal, y exactamente a una de las dos.
--
-- ¿Por qué la identidad y no crearle una ficha vacía al invitado? Porque quien
-- MIRA es una identidad: es lo que hay detrás de la cookie. Una ficha es una
-- persona en la cartera de Alberto, con su historial y sus pólizas, y fabricar
-- una por cada curioso que entra ensucia la cartera —que ya arrastra 32.520
-- leads del volcado— con gente que miró la póliza de su padre una vez.

SET search_path = seguros, public;

ALTER TABLE seguros.portal_autorizacion
  ALTER COLUMN autorizado_cliente_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS autorizado_identidad_id uuid REFERENCES seguros.portal_identidad(id);

-- ── 🚨 LAS DOS TRAMPAS DE HACER NULLABLE UNA COLUMNA QUE YA TENÍA CEPOS ──────
--
-- Las dos son del tipo que este repo persigue: no fallan, no se ven, y dejan de
-- proteger. Medidas leyendo `pg_constraint` y `pg_indexes` ANTES de tocar nada.

DO $$
BEGIN
  -- TRAMPA 1. El cepo viejo era `otorgante_cliente_id <> autorizado_cliente_id`.
  -- En SQL, `algo <> NULL` no es FALSE: es NULL, y un CHECK que da NULL PASA.
  -- Así que en cuanto la columna admite NULL, la guarda de «no puedes
  -- autorizarte a ti mismo» deja de existir para toda fila de identidad — sin
  -- error, sin aviso y sin que ningún test de la BD lo note.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_autorizacion_no_a_si_mismo') THEN
    ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_no_a_si_mismo;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_autorizacion_destinatario_unico') THEN
    ALTER TABLE seguros.portal_autorizacion
      ADD CONSTRAINT portal_autorizacion_destinatario_unico
      CHECK (num_nonnulls(autorizado_cliente_id, autorizado_identidad_id) = 1);
  END IF;

  -- El «no a sí mismo» que SÍ se puede escribir en la BD: el de la rama de
  -- ficha, ahora explícito sobre la comparación y no colgando de un NULL.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_autorizacion_ficha_no_a_si_mismo') THEN
    ALTER TABLE seguros.portal_autorizacion
      ADD CONSTRAINT portal_autorizacion_ficha_no_a_si_mismo
      CHECK (autorizado_cliente_id IS NULL OR otorgante_cliente_id <> autorizado_cliente_id);
  END IF;
END $$;

-- ⚠️ Y lo que la BD NO puede comprobar, dicho en voz alta en vez de suponerlo:
-- que una IDENTIDAD no se autorice a sí misma exige mirar `portal_vinculo`
-- (¿está esa identidad vinculada a la ficha del otorgante?), y eso es una
-- consulta a otra tabla, no un CHECK de fila. Ese caso lo cierra el CÓDIGO, y
-- lo vigila un test. Escrito aquí para que quien lea solo el SQL no crea que
-- está cubierto.

-- TRAMPA 2. `idx_portal_autorizacion_viva` era UNIQUE sobre
-- (otorgante, autorizado_cliente_id, alcance) WHERE revocado_en IS NULL. En
-- Postgres **dos NULL no son iguales**, así que ese índice deja de impedir
-- duplicados en cuanto la columna es NULL: la misma identidad podría acumular
-- autorizaciones vivas infinitas sobre la misma ficha y el mismo alcance, y la
-- pantalla del otorgante las pintaría todas. El índice viejo se queda tal cual
-- (sigue cubriendo la rama de ficha) y se añade su gemelo para la de identidad.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_autorizacion_viva_identidad
  ON seguros.portal_autorizacion (otorgante_cliente_id, autorizado_identidad_id, alcance)
  WHERE revocado_en IS NULL AND autorizado_identidad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_autorizacion_autorizado_identidad
  ON seguros.portal_autorizacion (autorizado_identidad_id)
  WHERE autorizado_identidad_id IS NOT NULL;

COMMENT ON COLUMN seguros.portal_autorizacion.autorizado_identidad_id IS
  'A quien se autoriza cuando NO es cliente de la correduria: la identidad del portal, que es lo que hay detras de la cookie y por tanto quien de verdad mira. Exactamente una de autorizado_cliente_id / autorizado_identidad_id va rellena (CHECK portal_autorizacion_destinatario_unico). Se eligio la identidad en vez de fabricar una ficha vacia por invitado: una ficha es una persona en la cartera, y crear una por cada curioso ensucia los 32.520 leads que ya hay. OJO: que una identidad no se autorice a si misma NO lo puede comprobar la BD (hay que mirar portal_vinculo, que es otra tabla); eso lo cierra el codigo.';
