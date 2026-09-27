-- Renovación deducida del RECIBO (27/09/2026).
--
-- Caso: Allianz no manda POL por CIMA, pero sí REC. Sus recibos del periodo siguiente
-- (vencimiento 2027, cobrados) entraban en `poliza_recibos` y la póliza seguía con el
-- vencimiento de 2026: el portal la daba por vencida y la sacaba de «En vigor». Medido:
-- 4 pólizas de Allianz con recibo cobrado del periodo nuevo y la póliza «vencida».
--
-- 🚨 Solo avanza pólizas cuyo vencimiento YA HA PASADO. La compañía emite el recibo de
-- renovación semanas antes (medido: 5 Allianz con vencimiento 01/11-01/12/2026 y su
-- recibo 2027 ya «pendiente»). Avanzarlas antes de tiempo borraría el aviso «avisar antes
-- del … para no renovar» y rompería una sustitución en curso (moto de Víctor de la
-- Fuente: Allianz vence 01/11/2026 y la sustituye Occident). Por eso no es un trigger
-- sobre el recibo sino una pasada diaria (pg_cron), que actúa cuando la fecha llega.
--
-- Va en BD y no en la ingesta porque la ingesta vive en otro repo (`asegura`) y hay más
-- de una vía de entrada de recibos: la regla tiene que valer para todas.
--
-- Avanza de aniversario en aniversario (+1 año, máx. 3) hasta cubrir el vencimiento del
-- recibo: un recibo semestral no convierte una anual en semestral. No toca recibos
-- anulados ni devueltos, pólizas no vigentes ni sin vencimiento (NULL = «no se sabe»).

CREATE OR REPLACE FUNCTION seguros.avanzar_vencimientos_por_recibo() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  f record;
  v_nuevo date;
  n int;
  total int := 0;
BEGIN
  FOR f IN
    SELECT p.id, p.fecha_vencimiento AS actual, max((r.fecha_vencimiento AT TIME ZONE 'UTC')::date) AS hasta
    FROM seguros.polizas p
    JOIN seguros.poliza_recibos r ON r.poliza_id = p.id
    WHERE p.merged_into_poliza_id IS NULL
      AND p.estado IN ('activa', 'en_renovacion', 'en_vigor', 'recibo_devuelto', 'cambio_clave')
      AND p.fecha_vencimiento IS NOT NULL
      AND p.fecha_vencimiento < current_date
      AND r.situacion IN ('cobrado', 'pendiente', 'emitido')
      AND r.fecha_vencimiento IS NOT NULL
    GROUP BY p.id, p.fecha_vencimiento
    HAVING max((r.fecha_vencimiento AT TIME ZONE 'UTC')::date) > p.fecha_vencimiento
  LOOP
    v_nuevo := f.actual;
    n := 0;
    WHILE v_nuevo < f.hasta AND n < 3 LOOP
      v_nuevo := (v_nuevo + interval '1 year')::date;
      n := n + 1;
    END LOOP;
    IF v_nuevo >= f.hasta THEN
      UPDATE seguros.polizas SET fecha_vencimiento = v_nuevo
      WHERE id = f.id AND fecha_vencimiento = f.actual;
      total := total + 1;
    END IF;
  END LOOP;
  RETURN total;
END;
$$;

-- A diario a las 06:30 UTC, después del pull de CIMA de las 05:30.
SELECT cron.unschedule('seguros-avanzar-vencimientos-recibo')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seguros-avanzar-vencimientos-recibo');
SELECT cron.schedule('seguros-avanzar-vencimientos-recibo', '30 6 * * *',
  $$SELECT seguros.avanzar_vencimientos_por_recibo()$$);

-- Relleno de lo ya entrado.
SELECT seguros.avanzar_vencimientos_por_recibo();
