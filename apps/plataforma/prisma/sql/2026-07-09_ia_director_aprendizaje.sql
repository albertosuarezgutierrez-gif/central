-- Bucle de aprendizaje del Agente Director (F4). Snapshot semanal del RENDIMIENTO REAL de cada
-- modelo servido por la pasarela (de ai_usos): nº de llamadas, tasa de error, latencia y coste
-- medios sobre una ventana de días. Lo escribe el cron /api/cron/ia-director-refresh, que además
-- penaliza/descarta del catálogo nuevo los modelos con mala racha (error_rate/latencia altas).
-- Determinista y AUDITABLE: nada de LLM decidiendo; solo métricas observadas. Histórico por día.
CREATE TABLE IF NOT EXISTS public.ia_director_aprendizaje (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha          date        NOT NULL DEFAULT current_date,  -- día del snapshot
  modelo         text        NOT NULL,                       -- slug base (sin sufijo :floor/:free)
  llamadas       integer     NOT NULL,                       -- nº de usos en la ventana
  error_rate     real        NOT NULL,                       -- 0..1 (fracción de usos NO ok)
  ms_medio       integer     NOT NULL,                       -- latencia media de los OK
  coste_medio_eur real       NOT NULL,                       -- coste_eur medio por llamada
  ventana_dias   integer     NOT NULL DEFAULT 7,             -- ventana usada para el agregado
  penalizado     boolean     NOT NULL DEFAULT false,         -- true si el cron lo descartó por rendimiento
  creada_at      timestamptz NOT NULL DEFAULT now()
);
-- Un snapshot por modelo y día (el cron hace UPSERT si corre más de una vez el mismo día).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ia_director_aprendizaje_fecha_modelo
  ON public.ia_director_aprendizaje(fecha, modelo);
CREATE INDEX IF NOT EXISTS idx_ia_director_aprendizaje_fecha
  ON public.ia_director_aprendizaje(fecha DESC);
