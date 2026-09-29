-- 2026-09-29h — Baja VERIFICADA por el corredor antes de que CIMA la confirme.
--
-- Caso (Alberto, 29/09/2026): la clienta avisó de que no iba a mantener la moto; el recibo de
-- renovación vuelve devuelto y la compañía anulará la póliza por impago. El corredor lo da por hecho
-- desde el recibo («El cliente se va»): la póliza pasa a `cancelada` YA, sin esperar semanas a que
-- CIMA lo traiga.
--
-- Columnas PROPIAS (la ingesta de CIMA no las toca), como `sustituida_at`:
--   baja_verificada_at / _por  → quién y cuándo
--   baja_motivo               → uno de MOTIVOS_PERDIDA (competidor, precio, cliente_desiste, otro)
--   baja_estado_previo        → el estado que tenía, para poder deshacerlo a mano
--
-- 🚨 Y el trigger: la ingesta de CIMA (repo del CRM) escribe `estado` y puede volver a mandar la
-- póliza como vigente antes de mandar la anulación. Con la baja verificada, un estado VIGENTE que
-- llegue se queda en `cancelada`. Deshacer = poner `baja_verificada_at` a NULL en el MISMO UPDATE.

ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS baja_verificada_at timestamptz;
ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS baja_verificada_por text;
ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS baja_motivo text;
ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS baja_estado_previo text;

CREATE OR REPLACE FUNCTION seguros.poliza_respeta_baja_verificada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = seguros, pg_temp
AS $$
BEGIN
  IF NEW.baja_verificada_at IS NOT NULL
     AND NEW.estado::text IN ('activa', 'en_renovacion', 'en_vigor', 'recibo_devuelto', 'cambio_clave') THEN
    NEW.estado := 'cancelada';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'poliza_respeta_baja_verificada (póliza %): % — se deja pasar la escritura', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION seguros.poliza_respeta_baja_verificada() FROM PUBLIC;

DROP TRIGGER IF EXISTS poliza_respeta_baja_verificada ON seguros.polizas;
CREATE TRIGGER poliza_respeta_baja_verificada
  BEFORE UPDATE ON seguros.polizas
  FOR EACH ROW EXECUTE FUNCTION seguros.poliza_respeta_baja_verificada();
