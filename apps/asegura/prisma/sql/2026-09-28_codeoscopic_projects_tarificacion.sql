-- Emisión a clientes NUEVOS (sin póliza previa en cartera) — 28/09/2026.
--
-- Hasta hoy `/api/operador/codeoscopic/emitir` daba 409 si el proyecto no tenía
-- `poliza_id` («no se sabe de quién es»). Para emitir a alguien que no tiene póliza
-- con nosotros, el proyecto se enlaza al CLIENTE de la tarificación (`cliente_id`,
-- columna que ya existía) y a la propia tarificación (`tarificacion_id`, nueva),
-- de donde `/emitir` saca el ramo y el riesgo (matrícula, CP, m²…) para acuñar la
-- póliza con `poliza_origen_id = null`.
--
-- Aditiva: columna NULL, sin backfill. Un proyecto viejo sin ella sigue por el
-- camino de siempre (sustitución de una póliza) o da el 409 de siempre.
--
-- 🚨 Aplicar ANTES de desplegar el código que la usa: `/oferta` la escribe y
-- `/emitir` la lee, y sin la columna las dos fallan.

alter table seguros.codeoscopic_projects
  add column if not exists tarificacion_id uuid references seguros.tarificaciones(id);

comment on column seguros.codeoscopic_projects.tarificacion_id is
  'La tarificación (seguros.tarificaciones) de la que salió el ReRate. La escribe /oferta; '
  '/emitir la usa para emitir a un cliente sin póliza previa (ramo y riesgo). NULL = proyecto '
  'anterior al 28/09/2026 o no confirmado por /oferta.';
