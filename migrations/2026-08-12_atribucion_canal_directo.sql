-- 2026-08-12_atribucion_canal_directo.sql
--
-- Reclasifica a DIRECTO las reservas que ya lo eran pero estaban guardadas como 'OTRO'.
--
-- Contexto: el cuadro de mando decía «canal directo = 0 € en 2026» mientras la landing de
-- housesevillana cerraba reservas por su motor, su WhatsApp de grupos y su teléfono. Esas
-- reservas entraban con portal='OTRO' — el centinela que el CLAUDE.md llama «el "no lo sé"
-- DISFRAZADO DE VALOR», que se cuela por toda guarda basada en NULL porque no ES null.
--
-- La regla es la misma que implementa apps/plataforma/lib/sivra/atribucion-canal.ts, y solo
-- escribe con EVIDENCIA POSITIVA. Nunca por descarte:
--   · amount_gross NO NULO y > 0   → sin bruto no hay nada que demostrar; un hueco no es prueba.
--   · comisión efectiva < 0,01 %   → el bruto llegó íntegro, nadie se llevó tajada por el medio.
--   · amount >= 5 €                → descarta bloqueos de calendario, pruebas y ajustes.
--
-- Idempotente: al terminar no queda ninguna fila que cumpla el filtro, así que re-ejecutarla no
-- hace nada. NO toca filas con portal declarado (BOOKING/AIRBNB/…) ni las que no cumplen todo.
--
-- Para revertir, si hiciera falta:
--   UPDATE incomes SET portal='OTRO' WHERE id IN (<los ids que imprime el SELECT de control>);

BEGIN;

-- Control previo: deja constancia en el log de QUÉ se va a tocar, antes de tocarlo.
-- (Los ids que salgan aquí son los que revierte la sentencia del comentario de arriba.)
SELECT id, "date", "guestName", amount, amount_gross
FROM incomes
WHERE portal = 'OTRO'
  AND amount_gross IS NOT NULL
  AND amount_gross > 0
  AND amount >= 5
  AND abs((amount_gross - amount) / amount_gross) * 100 < 0.01
ORDER BY "date";

UPDATE incomes
SET portal = 'DIRECTO'
WHERE portal = 'OTRO'
  AND amount_gross IS NOT NULL
  AND amount_gross > 0
  AND amount >= 5
  AND abs((amount_gross - amount) / amount_gross) * 100 < 0.01;

COMMIT;

-- Nota sobre lo que este backfill NO hace, a propósito:
--
-- No inventa el ORIGEN concreto (motor de reservas / WhatsApp / teléfono). Sabemos que no hubo
-- intermediario, no por dónde entró la reserva — y esa distinción es justo la que hay que
-- registrar en el momento de la venta, no deducir después. La columna de origen la añade el
-- motor de reservas cuando exista; hasta entonces, «DIRECTO sin origen» es la verdad disponible
-- y se prefiere a un origen inventado que luego nadie podría desmentir.
