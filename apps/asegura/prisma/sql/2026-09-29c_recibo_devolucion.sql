-- Devoluciones de recibos que la COMPAÑÍA avisa por correo antes (o en vez) de CIMA (28/09/2026).
--
-- Medido ese día: solo Occident (C0468) manda las devoluciones por CIMA. Reale, Mapfre y Generali
-- marcan el recibo domiciliado `cobrado` al emitirlo y la devolución no llega por el EIAC, así que el
-- recibo seguía «cobrado» mientras Reale ya había escrito diciendo que el banco lo devolvió. Y como
-- toda la cadena (acción urgente de la ficha, cola de impagos, borrador al cliente, portal, informe de
-- mediación) lee `poliza_recibos.situacion`, ninguna se enteraba.
--
-- Diseño:
-- · Esta tabla guarda LO QUE DIJO LA COMPAÑÍA (fuente, fecha, motivo). Se identifica por compañía +
--   nº de recibo SIN ceros a la izquierda —Mapfre escribe `8808116169` y CIMA `08808116169`—, no por
--   el uuid del recibo: la ingesta (rol `crm_seguros`) tiene DELETE y un recibo reinsertado cambia de id.
-- · El trigger de abajo impide que un dato de CIMA IGUAL O ANTERIOR a la devolución la deshaga (la
--   ingesta vuelve a escribir el recibo con su `cobrado` del día de emisión), y da la devolución por
--   resuelta cuando CIMA trae algo POSTERIOR (un cobro, una anulación): ahí manda CIMA.
-- · Una devolución sin recibo en cartera (Mapfre no siempre lo ha mandado) se guarda igual; cuando el
--   recibo entre, el trigger lo marca y los enlaza.
-- · El trigger es fail-open: si falla, AVISA (warning) y deja pasar la escritura. Nunca tumba la ingesta.

CREATE TABLE IF NOT EXISTS seguros.recibo_devolucion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL,
  codigo_entidad_dgs varchar(16) NOT NULL CHECK (codigo_entidad_dgs <> ''),
  id_recibo          text NOT NULL CHECK (id_recibo <> ''),
  id_recibo_norm     text GENERATED ALWAYS AS (ltrim(id_recibo, '0')) STORED,
  numero_poliza      text,
  recibo_id          uuid REFERENCES seguros.poliza_recibos (id) ON DELETE SET NULL,
  poliza_id          uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,
  fecha_devolucion   date NOT NULL,
  fecha_efecto       date,
  importe            numeric(12, 2),
  motivo             text,
  tipo_motivo        text CHECK (tipo_motivo IN ('cuenta', 'cliente_rechaza', 'fondos', 'otro')),
  fuente             text NOT NULL DEFAULT 'correo' CHECK (fuente IN ('correo', 'manual')),
  -- Message-ID del correo: de dónde salió, para poder volver a él.
  mensaje_id         text,
  resuelta_at        timestamptz,
  -- 'cima:cobrado', 'cima:anulado', 'manual:cobrado'…
  resuelta_motivo    text,
  resuelta_por       text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Una sola devolución ABIERTA por recibo: el mismo aviso dos veces (o el correo y el reenvío) no duplica.
CREATE UNIQUE INDEX IF NOT EXISTS recibo_devolucion_abierta
  ON seguros.recibo_devolucion (correduria_id, codigo_entidad_dgs, id_recibo_norm)
  WHERE resuelta_at IS NULL;
CREATE INDEX IF NOT EXISTS recibo_devolucion_recibo ON seguros.recibo_devolucion (recibo_id);

ALTER TABLE seguros.recibo_devolucion ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON seguros.recibo_devolucion TO prisma_seguros;

CREATE OR REPLACE FUNCTION seguros.recibo_respeta_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seguros, pg_temp
AS $$
DECLARE
  d seguros.recibo_devolucion%ROWTYPE;
  dia_cima date;
BEGIN
  IF NEW.id_recibo IS NULL OR NEW.codigo_entidad_dgs IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO d FROM seguros.recibo_devolucion
   WHERE correduria_id = NEW.correduria_id
     AND codigo_entidad_dgs = NEW.codigo_entidad_dgs
     AND id_recibo_norm = ltrim(NEW.id_recibo, '0')
     AND resuelta_at IS NULL
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Solo en UPDATE: en un INSERT la fila aún no existe y la FK lo rechazaría (el enlace lo hace la
  -- siguiente escritura o el puerto).
  IF TG_OP = 'UPDATE' AND d.recibo_id IS DISTINCT FROM NEW.id THEN
    UPDATE seguros.recibo_devolucion SET recibo_id = NEW.id, poliza_id = NEW.poliza_id WHERE id = d.id;
  END IF;

  IF NEW.situacion::text = 'devuelto' THEN
    RETURN NEW;
  END IF;

  dia_cima := (NEW.fecha_situacion AT TIME ZONE 'Europe/Madrid')::date;
  IF dia_cima IS NOT NULL AND dia_cima > d.fecha_devolucion THEN
    -- CIMA sabe algo POSTERIOR a la devolución (un cobro, una anulación): manda CIMA.
    UPDATE seguros.recibo_devolucion
       SET resuelta_at = now(), resuelta_motivo = 'cima:' || NEW.situacion::text, resuelta_por = 'sistema:cima'
     WHERE id = d.id;
    RETURN NEW;
  END IF;

  -- Dato de CIMA igual o anterior a la devolución: no la deshace.
  NEW.situacion := 'devuelto';
  NEW.fecha_situacion := (d.fecha_devolucion::timestamp AT TIME ZONE 'Europe/Madrid');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'recibo_respeta_devolucion (recibo %): % — se deja pasar la escritura', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION seguros.recibo_respeta_devolucion() FROM PUBLIC;

DROP TRIGGER IF EXISTS recibo_respeta_devolucion ON seguros.poliza_recibos;
CREATE TRIGGER recibo_respeta_devolucion
  BEFORE INSERT OR UPDATE ON seguros.poliza_recibos
  FOR EACH ROW EXECUTE FUNCTION seguros.recibo_respeta_devolucion();
