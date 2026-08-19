-- Realtime de ia.rest en la BD compartida (wswbehlcuxqxyinousql)
--
-- Contexto (19/08/2026, cierre de la unificación Supabase): tras la migración de junio
-- solo `preavisos` quedó en la publication `supabase_realtime` → las suscripciones
-- postgres_changes del KDS/sala/bridge (comandas, mesas, print_jobs…) NO recibían
-- eventos en producción. Se añaden todas las tablas que la app (src) y el bridge de
-- impresión (scripts/bridge-v6) suscriben.
ALTER PUBLICATION supabase_realtime ADD TABLE
  iarest.comandas,
  iarest.comanda_items,
  iarest.marchar_log,
  iarest.mesas,
  iarest.mensajes_turno,
  iarest.productos,
  iarest.transcripciones,
  iarest.incidencias_sistema,
  iarest.print_jobs;
