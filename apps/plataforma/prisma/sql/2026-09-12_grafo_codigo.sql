-- Grafo de código PROPIO del monorepo (sustituto del uso diario de Graphify: callers/callees,
-- vecinos de un archivo, radio de impacto, tests que cubren un archivo). Lo genera
-- scripts/grafo-codigo.mjs en el workflow auditoria.yml (solo desde main) y lo inyecta por lotes
-- /api/internal/grafo-codigo (CRON_SECRET). Se consulta por SQL desde las sesiones (skill code-map).
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- Artefacto GLOBAL del operador (como mapa_arquitectura): sin cuenta_id, sin RLS, NUNCA por REST/anon.

CREATE TABLE IF NOT EXISTS public.grafo_nodos (
  id          text PRIMARY KEY,               -- 'ruta' (archivo) o 'ruta#nombre' (símbolo)
  tipo        text NOT NULL,                  -- archivo | funcion | clase | const | simbolo (importado sin declaración visible)
  ruta        text NOT NULL,                  -- ruta repo-relativa del archivo
  nombre      text NOT NULL,                  -- nombre del símbolo (o basename del archivo)
  linea       int,                            -- línea de la declaración (NULL para archivo/simbolo)
  exportado   boolean,
  ambito      text,                           -- 'apps/plataforma', 'packages/core-ai', 'scripts'…
  es_test     boolean NOT NULL DEFAULT false,
  sha         text,                           -- SHA de git del que se generó (frescura)
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grafo_nodos_nombre ON public.grafo_nodos (nombre);
CREATE INDEX IF NOT EXISTS idx_grafo_nodos_ruta   ON public.grafo_nodos (ruta);

CREATE TABLE IF NOT EXISTS public.grafo_aristas (
  origen      text NOT NULL,                  -- id de nodo (archivo o símbolo)
  destino     text NOT NULL,                  -- id de nodo
  tipo        text NOT NULL,                  -- importa | reexporta (archivo→archivo) · llama | usa (→ símbolo)
  linea       int  NOT NULL,
  simbolos    text[] NOT NULL DEFAULT '{}',   -- en importa/reexporta: qué nombres trae
  sha         text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origen, destino, tipo, linea)
);
CREATE INDEX IF NOT EXISTS idx_grafo_aristas_destino ON public.grafo_aristas (destino);
CREATE INDEX IF NOT EXISTS idx_grafo_aristas_origen  ON public.grafo_aristas (origen);

REVOKE ALL ON public.grafo_nodos, public.grafo_aristas FROM anon, authenticated;
-- (la vista grafo_deps_archivo, más abajo, hereda la misma restricción)

-- ── Consultas empaquetadas (las que Graphify servía como tools) ──────────────────────────────
-- Todas devuelven filas planas para que el resultado quepa en pocos tokens.

-- ¿Quién llama/usa a un símbolo? `simbolo` = nombre ('esCarteraViva') o id completo ('ruta#nombre').
-- prof>1 sube por la cadena: quién llama a quien lo llama. Cada fila trae la profundidad.
CREATE OR REPLACE FUNCTION public.grafo_callers(simbolo text, prof int DEFAULT 1)
RETURNS TABLE (origen text, destino text, tipo text, linea int, profundidad int)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE raiz AS (
    SELECT id FROM grafo_nodos n
    WHERE n.id = simbolo OR (n.nombre = simbolo AND n.tipo <> 'archivo')
  ), sube AS (
    SELECT a.origen, a.destino, a.tipo, a.linea, 1 AS profundidad
    FROM grafo_aristas a JOIN raiz r ON a.destino = r.id
    WHERE a.tipo IN ('llama','usa')
    UNION
    SELECT a.origen, a.destino, a.tipo, a.linea, s.profundidad + 1
    FROM grafo_aristas a JOIN sube s ON a.destino = s.origen
    WHERE a.tipo IN ('llama','usa') AND s.profundidad < prof
  )
  SELECT DISTINCT ON (origen, destino, profundidad) origen, destino, tipo, linea, profundidad
  FROM sube ORDER BY origen, destino, profundidad, linea
$$;

-- ¿A qué llama un símbolo (o un archivo entero si se pasa una ruta)?
CREATE OR REPLACE FUNCTION public.grafo_callees(simbolo text, prof int DEFAULT 1)
RETURNS TABLE (origen text, destino text, tipo text, linea int, profundidad int)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE raiz AS (
    SELECT id FROM grafo_nodos n
    WHERE n.id = simbolo OR n.ruta = simbolo OR (n.nombre = simbolo AND n.tipo <> 'archivo')
  ), baja AS (
    SELECT a.origen, a.destino, a.tipo, a.linea, 1 AS profundidad
    FROM grafo_aristas a JOIN raiz r ON a.origen = r.id
    WHERE a.tipo IN ('llama','usa')
    UNION
    SELECT a.origen, a.destino, a.tipo, a.linea, b.profundidad + 1
    FROM grafo_aristas a JOIN baja b ON a.origen = b.destino
    WHERE a.tipo IN ('llama','usa') AND b.profundidad < prof
  )
  SELECT DISTINCT ON (origen, destino, profundidad) origen, destino, tipo, linea, profundidad
  FROM baja ORDER BY origen, destino, profundidad, linea
$$;

-- Dependencias ARCHIVO→ARCHIVO, conscientes de barriles: además del `import` literal (que en el
-- monorepo casi siempre apunta al `index.ts` de un package), cuenta el archivo donde VIVE cada
-- símbolo llamado/usado. Así «quién depende de cartera-viva.ts» incluye a quien importó
-- `esCarteraViva` desde `@central/module-seguros`. Sin esto, el impacto se paraba en el barril.
CREATE OR REPLACE VIEW public.grafo_deps_archivo AS
  SELECT DISTINCT o.ruta AS origen, d.ruta AS destino
  FROM grafo_aristas a
  JOIN grafo_nodos o ON o.id = a.origen
  JOIN grafo_nodos d ON d.id = a.destino
  WHERE o.ruta <> d.ruta;
REVOKE ALL ON public.grafo_deps_archivo FROM anon, authenticated;

-- Radio de impacto de un ARCHIVO: quién depende de él, y quién depende de esos (hasta prof saltos).
-- Excluye tests por defecto; `con_tests => true` los incluye.
CREATE OR REPLACE FUNCTION public.grafo_impacto(ruta_in text, prof int DEFAULT 2, con_tests boolean DEFAULT false)
RETURNS TABLE (ruta text, profundidad int, via text)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE sube AS (
    SELECT d.origen AS ruta, 1 AS profundidad, d.destino AS via
    FROM grafo_deps_archivo d WHERE d.destino = ruta_in
    UNION
    SELECT d.origen, s.profundidad + 1, d.destino
    FROM grafo_deps_archivo d JOIN sube s ON d.destino = s.ruta
    WHERE s.profundidad < prof
  )
  SELECT DISTINCT ON (s.ruta) s.ruta, s.profundidad, s.via
  FROM sube s JOIN grafo_nodos n ON n.id = s.ruta
  WHERE con_tests OR NOT n.es_test
  ORDER BY s.ruta, s.profundidad
$$;

-- Vecinos directos de un archivo: de quién depende (sale) y quién depende de él (entra),
-- con los símbolos por los que se tocan.
CREATE OR REPLACE FUNCTION public.grafo_vecinos(ruta_in text)
RETURNS TABLE (direccion text, ruta text, simbolos text[])
LANGUAGE sql STABLE AS $$
  SELECT 'depende_de' AS direccion, d.ruta, array_agg(DISTINCT d.nombre) FILTER (WHERE d.tipo <> 'archivo')
  FROM grafo_aristas a JOIN grafo_nodos o ON o.id = a.origen JOIN grafo_nodos d ON d.id = a.destino
  WHERE o.ruta = ruta_in AND d.ruta <> ruta_in GROUP BY d.ruta
  UNION ALL
  SELECT 'dependiente', o.ruta, array_agg(DISTINCT d.nombre) FILTER (WHERE d.tipo <> 'archivo')
  FROM grafo_aristas a JOIN grafo_nodos o ON o.id = a.origen JOIN grafo_nodos d ON d.id = a.destino
  WHERE d.ruta = ruta_in AND o.ruta <> ruta_in GROUP BY o.ruta
  ORDER BY 1, 2
$$;

-- Tests que cubren un archivo: los que lo importan directamente o a través de un salto.
CREATE OR REPLACE FUNCTION public.grafo_tests_de(ruta_in text)
RETURNS TABLE (test text, profundidad int)
LANGUAGE sql STABLE AS $$
  SELECT i.ruta AS test, i.profundidad
  FROM grafo_impacto(ruta_in, 2, true) i JOIN grafo_nodos n ON n.id = i.ruta
  WHERE n.es_test ORDER BY i.profundidad, i.ruta
$$;

-- Buscar un símbolo por subcadena (lo que Graphify llamaba graphify_find).
CREATE OR REPLACE FUNCTION public.grafo_find(q text, lim int DEFAULT 20)
RETURNS TABLE (id text, tipo text, ruta text, linea int, exportado boolean)
LANGUAGE sql STABLE AS $$
  SELECT n.id, n.tipo, n.ruta, n.linea, n.exportado
  FROM grafo_nodos n
  WHERE n.tipo <> 'archivo' AND n.nombre ILIKE '%' || q || '%'
  ORDER BY (n.nombre = q) DESC, n.exportado DESC NULLS LAST, length(n.nombre), n.ruta
  LIMIT lim
$$;
