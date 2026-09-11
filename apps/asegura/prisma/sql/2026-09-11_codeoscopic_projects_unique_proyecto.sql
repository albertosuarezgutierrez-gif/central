-- Candado de idempotencia para el envío real a Codeoscopic (ReRate + Submit).
--
-- `codeoscopic_projects` ya traía `submit_attempt_id`/`submit_in_flight_at`
-- desde la spec de emisión del 02/09/2026, pero nadie los usaba: no había
-- ninguna restricción `UNIQUE` sobre `(correduria_id, project_id_codeoscopic)`,
-- así que un `ON CONFLICT` no tenía sobre qué actuar y dos peticiones
-- concurrentes podían crear dos filas para el MISMO proyecto — dos candados
-- que no se ven entre sí no son un candado.
--
-- Sin `WHERE` (a diferencia de otros índices parciales del schema) porque un
-- proyecto de Codeoscopic es siempre de UNA correduría y no hay estado en el
-- que dos filas para el mismo `(correduria_id, project_id_codeoscopic)` sean
-- correctas.
create unique index if not exists codeoscopic_projects_correduria_proyecto_idx
  on seguros.codeoscopic_projects (correduria_id, project_id_codeoscopic);
