-- Persistir el VEREDICTO del vigía de agentes (/api/cron/agentes-latido, diario 07:45 UTC).
--
-- Por qué existe (02/09/2026): el vigía evaluaba los 27 agentes de AGENTES_VIGILADOS cada día
-- y TIRABA el resultado — lo devolvía en el JSON de su respuesta HTTP y mandaba un Telegram.
-- Nada lo guardaba. Consecuencias medidas:
--   · Ninguna pantalla podía leerlo: /operador/agentes pintaba salud con `lib/agentes-salud.ts`,
--     que tiene 6 sondas propias para 29 agentes del catálogo → 23 salían ⚪ «sin telemetría»
--     mientras el dato real se calculaba cada mañana y se perdía.
--   · Con 8 de las rutinas sin ALERTA_TOKEN, ese Telegram no llega, así que el trabajo del
--     vigía desaparecía entero sin dejar rastro en ningún sitio consultable.
--
-- 🚨 `horas` es NULLABLE a propósito y NULL ≠ 0: significa «no hay ninguna señal registrada»,
-- que es un estado DISTINTO de «lleva 0 horas». Colapsarlo a 0 pinta de verde a un agente que
-- nunca ha dejado huella. Los tres estados que distingue `evaluarLatido` viajan en `motivo`.
--
-- `evaluado_at` NO es decorativo: es lo que permite decir «este veredicto es de hace 3 días»
-- en vez de pintarlo como si fuera de ahora. Un vigía muerto congelaría la pantalla en verde,
-- que es exactamente el fallo que el CLAUDE.md raíz marca como el más caro.
CREATE TABLE IF NOT EXISTS public.agente_salud (
  agente       text PRIMARY KEY,
  evaluado_at  timestamptz NOT NULL,
  alerta       boolean     NOT NULL,
  horas        double precision,          -- NULL = sin señal, NO cero
  motivo       text        NOT NULL,
  max_horas    integer     NOT NULL,
  etiqueta     text        NOT NULL,
  nota         text,
  -- Una sonda que revienta NO es un agente sano: se guarda aparte para poder decir
  -- «no se ha podido comprobar», que no es «está bien».
  sonda_error  text
);

ALTER TABLE public.agente_salud ENABLE ROW LEVEL SECURITY;
