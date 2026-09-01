-- ────────────────────────────────────────────────────────────────────────────
-- SIVRA · LA ORDEN A LA LIMPIEZA TIENE QUE VERSE EN LA PANTALLA DE LA LIMPIEZA
-- (01/09/2026, seguimiento del PR #1991)
--
-- El PR #1991 mandaba la orden por EMAIL y la pintaba en `/sivra/mensajes`, que
-- es la pantalla de Alberto. Sique Brilla (Vanesa) NO mira ninguna de las dos:
-- su único acceso es la intranet `/invitado/limpieza`, que lee `limpieza_tareas`.
-- Resultado: la cuna de la reserva 152490601 estaba pedida y NO aparecía donde
-- la mira quien tiene que montarla.
--
-- `tarea_id` enlaza la orden con su fila de `limpieza_tareas`:
--   con uuid → la orden ESTÁ en la pantalla de la limpieza.
--   NULL     → NO está (o no se ha podido crear). Eso se DECLARA, no se supone:
--              el email puede haber salido y la orden seguir siendo invisible
--              para ella, que es exactamente el fallo que esto viene a cerrar.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE sivra_ordenes_limpieza
  ADD COLUMN IF NOT EXISTS tarea_id uuid;

COMMENT ON COLUMN sivra_ordenes_limpieza.tarea_id IS
  'Fila de limpieza_tareas que hace visible esta orden en /invitado/limpieza. NULL = la limpieza NO la ve.';
