-- 2026-09-29g — Enlazar la devolución cuando su recibo llega NUEVO por CIMA.
--
-- `recibo_respeta_devolucion` (BEFORE INSERT OR UPDATE) marca `devuelto` el recibo que llega, pero en un
-- INSERT no puede escribir `recibo_devolucion.recibo_id`: la fila aún no existe y la FK lo rechazaría.
-- Contaba con «la siguiente escritura», que para un recibo nuevo puede no llegar nunca. Caso real: la
-- devolución de Mapfre del 22/09/2026 cuyo recibo de renovación CIMA todavía no ha mandado — el día que
-- llegue, se quedaría devuelto pero sin enlace (sin importe ni comisión en riesgo en la ficha).
-- Este trigger AFTER INSERT hace ese enlace, solo sobre devoluciones abiertas y sin recibo.

CREATE OR REPLACE FUNCTION seguros.recibo_enlaza_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seguros, pg_temp
AS $$
BEGIN
  IF NEW.id_recibo IS NULL OR NEW.codigo_entidad_dgs IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE seguros.recibo_devolucion
     SET recibo_id = NEW.id, poliza_id = NEW.poliza_id
   WHERE correduria_id = NEW.correduria_id
     AND codigo_entidad_dgs = NEW.codigo_entidad_dgs
     AND id_recibo_norm = ltrim(NEW.id_recibo, '0')
     AND resuelta_at IS NULL
     AND recibo_id IS NULL;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'recibo_enlaza_devolucion (recibo %): % — se deja pasar la escritura', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION seguros.recibo_enlaza_devolucion() FROM PUBLIC;

DROP TRIGGER IF EXISTS recibo_enlaza_devolucion ON seguros.poliza_recibos;
CREATE TRIGGER recibo_enlaza_devolucion
  AFTER INSERT ON seguros.poliza_recibos
  FOR EACH ROW EXECUTE FUNCTION seguros.recibo_enlaza_devolucion();
