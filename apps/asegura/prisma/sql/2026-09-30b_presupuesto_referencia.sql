-- La REFERENCIA propia del presupuesto: `AS-AA-NNNN` (30/09/2026, dictado de Alberto, OK a este diseño).
--
-- Alberto da esa referencia a su gente y al cliente; quien la teclea en el buscador principal de
-- `/correduria` rescata EXACTAMENTE la propuesta enviada y emite desde ahí. El nº de proyecto de
-- Avant2/Codeoscopic NO se le enseña al cliente (es del vendor y cambia al re-tarificar).
--
-- ⛔ NO APLICADA. Se aplica ANTES de desplegar el código que la nombra (asegura declara
--    `referencia` y `documento_descargado_at` en su schema Prisma: un `findFirst` sin `select`
--    sobre `presupuesto` fallaría en producción con la columna aún sin crear). Orden de la casa:
--    primero la BD, después el puerto.
--
-- Qué hace (todo aditivo, nada se borra):
--   1. `presupuesto.referencia` (text) — la pone la BD, NUNCA la app, con un contador por
--      correduría + año. Sin carreras: el `INSERT … ON CONFLICT DO UPDATE` bloquea la fila del
--      contador hasta el final de la transacción, así que dos presupuestos preparados a la vez
--      no pueden llevarse el mismo número. Única por correduría y, una vez puesta, INMUTABLE
--      (es lo que el cliente tiene apuntado).
--   2. `presupuesto.documento_descargado_at` — primer PDF descargado para el cliente.
--      🚨 NO es `enviado_at`: descargar no prueba que saliera (eso pasa fuera del sistema). La
--      semántica de los dos sellos de salida de 2026-09-21_presupuesto.sql se respeta tal cual.
--   3. Rellena las filas existentes por orden de creación (año de `creado_at`).
--
-- Lo que NO hace falta: una columna «en documento» en `presupuesto_opcion`. YA EXISTE:
-- `oculta_at IS NULL` (2026-09-29b_presupuesto_opcion_todas.sql). Medido en la BD el 30/09: el
-- presupuesto 6e082872… de Antonio Cruz guarda 8 opciones con 7 `oculta_at` y solo «Reale Terceros
-- Ampliado» visible — es exactamente lo que enseñó el PDF. Una segunda columna sería un segundo
-- sitio donde decir lo mismo, o sea un sitio donde contradecirse.
--
-- Se deshace con: drop trigger ×2, drop function ×3, drop table del contador, drop column ×2.
SET search_path = seguros, public;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. El contador (correduría + año)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.presupuesto_referencia_contador (
  correduria_id uuid     NOT NULL,
  anio          smallint NOT NULL,
  ultimo        integer  NOT NULL CHECK (ultimo >= 1),
  PRIMARY KEY (correduria_id, anio)
);

COMMENT ON TABLE seguros.presupuesto_referencia_contador IS
  'Último número de referencia AS-AA-NNNN dado por correduría y año. Solo lo escribe '
  'seguros.siguiente_referencia_presupuesto(); a mano, nunca (se repetirían referencias).';

-- El año es el de Madrid: un presupuesto preparado el 31/12 a las 23:30 es del año que acaba.
CREATE OR REPLACE FUNCTION seguros.siguiente_referencia_presupuesto(p_correduria uuid, p_momento timestamptz)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
  v_anio smallint := extract(year from (coalesce(p_momento, now()) at time zone 'Europe/Madrid'))::smallint;
  v_n    integer;
BEGIN
  INSERT INTO seguros.presupuesto_referencia_contador AS c (correduria_id, anio, ultimo)
  VALUES (p_correduria, v_anio, 1)
  ON CONFLICT (correduria_id, anio) DO UPDATE SET ultimo = c.ultimo + 1
  RETURNING c.ultimo INTO v_n;
  RETURN 'AS-' || lpad((v_anio % 100)::text, 2, '0') || '-' || lpad(v_n::text, 4, '0');
END;
$fn$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. Las columnas
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS documento_descargado_at timestamptz;

COMMENT ON COLUMN seguros.presupuesto.referencia IS
  'Referencia propia AS-AA-NNNN que se le da al cliente (nunca el nº de Avant2). La pone la BD al '
  'insertar; única por correduría e inmutable.';
COMMENT ON COLUMN seguros.presupuesto.documento_descargado_at IS
  'Primer PDF descargado para el cliente. NO prueba que se enviara: por eso no es enviado_at. '
  'NULL = no consta que se descargara. Cada descarga deja además un presupuesto_evento.';


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Rellenar las existentes (antes de los triggers y del NOT NULL)
-- ════════════════════════════════════════════════════════════════════════════
DO $relleno$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, correduria_id, creado_at FROM seguros.presupuesto
     WHERE referencia IS NULL
     ORDER BY creado_at, id
  LOOP
    UPDATE seguros.presupuesto
       SET referencia = seguros.siguiente_referencia_presupuesto(r.correduria_id, r.creado_at)
     WHERE id = r.id;
  END LOOP;
END;
$relleno$;

ALTER TABLE seguros.presupuesto ALTER COLUMN referencia SET NOT NULL;

ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_referencia_formato;
ALTER TABLE seguros.presupuesto
  ADD CONSTRAINT presupuesto_referencia_formato CHECK (referencia ~ '^AS-[0-9]{2}-[0-9]{4,}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_presupuesto_referencia
  ON seguros.presupuesto (correduria_id, referencia);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. La pone la BD al insertar, y no se reescribe
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION seguros.presupuesto_referencia_al_insertar()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.referencia IS NULL THEN
    NEW.referencia := seguros.siguiente_referencia_presupuesto(NEW.correduria_id, coalesce(NEW.creado_at, now()));
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS presupuesto_referencia_al_insertar ON seguros.presupuesto;
CREATE TRIGGER presupuesto_referencia_al_insertar
  BEFORE INSERT ON seguros.presupuesto
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_referencia_al_insertar();

CREATE OR REPLACE FUNCTION seguros.presupuesto_referencia_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.referencia IS DISTINCT FROM OLD.referencia THEN
    RAISE EXCEPTION 'presupuesto %: la referencia % ya se le ha dado a alguien y no se cambia', OLD.id, OLD.referencia;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS presupuesto_referencia_inmutable ON seguros.presupuesto;
CREATE TRIGGER presupuesto_referencia_inmutable
  BEFORE UPDATE OF referencia ON seguros.presupuesto
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_referencia_inmutable();


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Permisos
-- ════════════════════════════════════════════════════════════════════════════
-- La función es SECURITY INVOKER: quien inserta el presupuesto (prisma_seguros) mueve el contador.
GRANT SELECT, INSERT, UPDATE ON seguros.presupuesto_referencia_contador TO prisma_seguros;
GRANT EXECUTE ON FUNCTION seguros.siguiente_referencia_presupuesto(uuid, timestamptz) TO prisma_seguros;
-- 🚫 El portal (prisma_asegura_portal) no recibe nada aquí: lee por COLUMNAS y hoy no pinta la
-- referencia. Dársela es un PR con su cepo en test/regression-portal-aislamiento.test.ts.


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar (tiene que dar 0 filas y luego 0):
--   select id from seguros.presupuesto where referencia is null or referencia !~ '^AS-[0-9]{2}-[0-9]{4,}$';
--   select correduria_id, referencia, count(*) from seguros.presupuesto group by 1,2 having count(*) > 1;
-- ════════════════════════════════════════════════════════════════════════════
