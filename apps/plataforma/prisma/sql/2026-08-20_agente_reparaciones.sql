-- 🔧 Memoria de las reparaciones automáticas de agentes.
--
-- POR QUÉ (20/08/2026). El cron `sivra_canal` nació el 19/08 y NUNCA completó una pasada: moría en
-- `42883 operator does not exist: date - bigint` en su primera consulta. El latido lo dijo a la
-- primera — pero hasta que un humano leyó el Telegram y abrió una sesión, los cuatro pisos siguieron
-- tarificando con el ×1,20 supuesto que ese agente existe para corregir. La casa tenía quien detecta;
-- le faltaba quien repara.
--
-- Esta tabla es lo que impide que ese reparador se convierta en una plaga: sin ella, un agente que
-- sigue rojo dispararía un intento (y un PR) CADA DÍA, con la misma información y el mismo resultado.
--
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql).

CREATE TABLE IF NOT EXISTS agente_reparaciones (
  id           bigserial PRIMARY KEY,
  -- Mismo id que en `agente_latidos` / `AGENTES_VIGILADOS`.
  agente       text NOT NULL,
  -- Huella ESTABLE del fallo (`lib/monitoring/reparable.ts::firmaError`), p.ej.
  -- `42883:prismaclientknownrequesterror:operator-does-not-exist-date`. Una firma = un intento:
  -- que siga rojo con el MISMO síntoma no es información nueva.
  firma        text NOT NULL,
  -- El parte crudo que disparó el intento. Se guarda para poder auditar la decisión después.
  detalle      text,
  -- intentando → pr_abierto | mergeada → resuelta | sigue_roja | fallida | rendida
  estado       text NOT NULL DEFAULT 'intentando',
  pr_numero    integer,
  run_url      text,
  intento_at   timestamptz NOT NULL DEFAULT now(),
  merged_at    timestamptz,
  -- Veredicto a las 24 h, dictado por el LATIDO del agente, no por el reparador: un agente no puede
  -- declararse curado a sí mismo (misma regla que el resto del repo).
  veredicto    text,
  veredicto_at timestamptz,
  -- Marca de que ya se avisó por Telegram de este desenlace (el éxito no avisa: silencio = bien).
  avisado_at   timestamptz
);

-- Búsqueda del historial de UN agente (es la consulta caliente: la hace cada pasada del disparador).
CREATE INDEX IF NOT EXISTS agente_reparaciones_agente_idx
  ON agente_reparaciones (agente, intento_at DESC);
-- Cola del veredicto: las mergeadas que aún no se han juzgado.
CREATE INDEX IF NOT EXISTS agente_reparaciones_pendientes_idx
  ON agente_reparaciones (estado) WHERE veredicto IS NULL;

-- Tabla interna de monitorización: nada que exponer a los roles de la API.
REVOKE ALL ON agente_reparaciones FROM anon, authenticated;
REVOKE ALL ON SEQUENCE agente_reparaciones_id_seq FROM anon, authenticated;
