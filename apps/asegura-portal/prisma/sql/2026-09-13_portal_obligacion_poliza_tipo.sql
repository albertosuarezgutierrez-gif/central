-- «Poder asignar el recordatorio al bien asegurado» (Alberto, 13/09/2026):
-- un recordatorio propio (ITV, mantenimiento…) tiene que poder colgarse de la
-- MISMA póliza que ya identifica el vehículo/inmueble por matrícula o
-- dirección — igual que hace `ParteSiniestro`, reutilizando `poliza_id` /
-- `poliza_declarada_id`, no una tabla `portal_bien` nueva y sin datos.
--
-- Pero `UNIQUE (identidad_id, poliza_id)` (la de 2026-09-03) solo dejaba UNA
-- fila por póliza de cartera — la que ya generaba el derivador
-- (`tipo: 'poliza'`) ocupaba ese hueco entero. La misma ampliación que ya
-- se le hizo a `poliza_declarada_id` el 09/09/2026 (`…_una_por_declarada_tipo`),
-- aquí con la misma razón: dos obligaciones sobre el MISMO seguro («se
-- renueva el 15» y «la ITV es el 3») son cosas distintas y `tipo` es lo que
-- las separa.

ALTER TABLE seguros.portal_obligacion
  DROP CONSTRAINT portal_obligacion_una_por_poliza;

ALTER TABLE seguros.portal_obligacion
  ADD CONSTRAINT portal_obligacion_una_por_poliza_tipo UNIQUE (identidad_id, poliza_id, tipo);
