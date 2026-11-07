-- CONTABILIDAD — 0007: corrige `contabilidad.comprobar_cuadre()` (trigger DIFERIDO de cuadre de 0001). Requiere 0001.
--
-- ⚠️ Por qué: la versión de 0001 calculaba el asiento con
--      v_asiento := CASE WHEN TG_TABLE_NAME = 'asientos' THEN NEW.id ELSE NEW.asiento_id END;
--    PL/pgSQL resuelve TODOS los campos de NEW de la expresión al prepararla, así que al dispararse sobre `asientos`
--    (`trg_asientos_cuadre`) falla con «record "new" has no field "asiento_id"». Como el trigger es DEFERRABLE INITIALLY DEFERRED,
--    el error salta en el COMMIT: TODA transacción que inserta un asiento se deshace (manual, hecho del puerto, cierre…).
--    Detectado el 07/11/2026 al ensayar 0005 en producción (con ROLLBACK, datos sintéticos): `SET CONSTRAINTS ALL IMMEDIATE`
--    tras un asiento cuadrado en un ejercicio abierto → error; con la rama IF/ELSE de abajo → pasa, y uno descuadrado → falla.
--
-- Qué cambia: SOLO la asignación de `v_asiento` (IF/ELSE: cada rama se prepara al ejecutarse, solo con el campo que existe).
-- Misma firma, mismo lenguaje, sin SECURITY DEFINER ni search_path (igual que 0001), mismos mensajes. Los triggers
-- `trg_asientos_cuadre` / `trg_apuntes_cuadre` apuntan a la función por nombre: no hay que recrearlos.
-- IDEMPOTENTE (CREATE OR REPLACE). Aplicada a mano como `postgres`.

BEGIN;

CREATE OR REPLACE FUNCTION contabilidad.comprobar_cuadre() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_asiento uuid;
  d bigint;
  h bigint;
  n integer;
BEGIN
  IF TG_TABLE_NAME = 'asientos' THEN
    v_asiento := NEW.id;
  ELSE
    v_asiento := NEW.asiento_id;
  END IF;
  SELECT coalesce(sum(debe), 0), coalesce(sum(haber), 0), count(*) INTO d, h, n
    FROM contabilidad.apuntes WHERE empresa_id = NEW.empresa_id AND asiento_id = v_asiento;
  IF n < 2 THEN
    RAISE EXCEPTION 'el asiento % necesita al menos 2 apuntes (tiene %)', v_asiento, n;
  END IF;
  IF d <> h THEN
    RAISE EXCEPTION 'asiento % descuadrado: debe % ≠ haber %', v_asiento, d, h;
  END IF;
  RETURN NULL;
END $$;

COMMIT;
