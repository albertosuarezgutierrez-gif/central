-- Grafo de código PROPIO, parte 2: lo que faltaba para dar de baja Graphify (12/09/2026).
--   (a) Búsqueda SEMÁNTICA (`query_graph` / `rank_files` de Graphify): embeddings pgvector de cada
--       archivo y función del índice `mapa_arquitectura`, calculados y consultados por SQL a través
--       de la extensión `http` contra OpenRouter (mismo modelo que la caché semántica de la pasarela:
--       openai/text-embedding-3-small a 768 dims). La clave vive en Vault (`grafo_openrouter_api_key`)
--       y la escribe /api/internal/grafo-codigo/embeddings desde la env de Vercel — nunca el repo.
--   (b) Funciones estructurales que Graphify daba como tools y aún no teníamos: camino entre dos
--       archivos (`grafo_camino`), referencias a un símbolo (`grafo_referencias`), imports/exports de un
--       archivo (`grafo_imports_exports`), ficha de un nodo (`grafo_nodo`) y subgrafo (`grafo_subgrafo`).
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- Artefacto GLOBAL del operador (como grafo_nodos): sin cuenta_id, sin RLS, NUNCA por REST/anon.
-- ⚠️ Quien pueda ejecutar SQL como postgres puede leer la clave de Vault: usa una key de OpenRouter
--    DEDICADA (env GRAFO_OPENROUTER_API_KEY) con límite de gasto propio, no la principal.

CREATE EXTENSION IF NOT EXISTS http   WITH SCHEMA extensions;

-- ── Embeddings ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grafo_embeddings (
  id          text PRIMARY KEY,               -- igual que grafo_nodos.id: 'ruta' (archivo) o 'ruta#nombre'
  tipo        text NOT NULL,                  -- archivo | funcion
  ruta        text NOT NULL,
  nombre      text NOT NULL,
  linea       int,
  texto       text NOT NULL,                  -- lo que se embebe: firma + ruta + resumen
  hash        text NOT NULL,                  -- md5(texto): si cambia, embedding vuelve a NULL y se recalcula
  embedding   vector(768),         -- NULL = pendiente de calcular
  sha         text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grafo_embeddings_hnsw
  ON public.grafo_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_grafo_embeddings_pendiente ON public.grafo_embeddings (id) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS idx_grafo_embeddings_ruta ON public.grafo_embeddings (ruta);
REVOKE ALL ON public.grafo_embeddings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grafo_embeddings TO prisma_plataforma;

-- Sincroniza la tabla de textos con mapa_arquitectura (1 fila por archivo + 1 por función).
-- Un texto que no cambia conserva su embedding; uno que cambia lo pierde (se recalcula); un archivo
-- que desaparece del mapa se borra. Devuelve cuántas filas nuevas, cambiadas y borradas.
CREATE OR REPLACE FUNCTION public.grafo_embeddings_sync()
RETURNS TABLE (insertadas int, cambiadas int, borradas int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE ins int; cam int; bor int;
BEGIN
  DROP TABLE IF EXISTS _grafo_src;
  CREATE TEMP TABLE _grafo_src ON COMMIT DROP AS
  SELECT DISTINCT ON (s.id) s.*
  FROM (
    SELECT m.ruta AS id, 'archivo'::text AS tipo, m.ruta, m.ruta AS nombre, NULL::int AS linea,
           left(concat_ws(' — ', m.ruta, m.ambito, m.resumen), 2000) AS texto, m.sha
    FROM mapa_arquitectura m
    UNION ALL
    SELECT m.ruta || '#' || (f->>'nombre'), 'funcion', m.ruta, f->>'nombre', (f->>'linea')::int,
           left(concat_ws(' — ',
             coalesce(f->>'kind', 'function') || ' ' || (f->>'nombre') || '(' || coalesce(f->>'params', '') || ')'
               || coalesce(': ' || nullif(f->>'retorno', ''), ''),
             m.ruta, f->>'resumen'), 2000),
           m.sha
    FROM mapa_arquitectura m, jsonb_array_elements(m.funciones) f
    WHERE coalesce(f->>'nombre', '') <> ''
  ) s
  ORDER BY s.id, s.linea NULLS FIRST;

  WITH up AS (
    INSERT INTO grafo_embeddings (id, tipo, ruta, nombre, linea, texto, hash, sha)
    SELECT id, tipo, ruta, nombre, linea, texto, md5(texto), sha FROM _grafo_src
    ON CONFLICT (id) DO UPDATE SET
      tipo = EXCLUDED.tipo, ruta = EXCLUDED.ruta, nombre = EXCLUDED.nombre, linea = EXCLUDED.linea,
      sha = EXCLUDED.sha, texto = EXCLUDED.texto, hash = EXCLUDED.hash,
      embedding  = CASE WHEN grafo_embeddings.hash IS DISTINCT FROM EXCLUDED.hash THEN NULL  ELSE grafo_embeddings.embedding  END,
      updated_at = CASE WHEN grafo_embeddings.hash IS DISTINCT FROM EXCLUDED.hash THEN now() ELSE grafo_embeddings.updated_at END
    -- updated_at solo se toca cuando cambia el hash (now() es constante en la transacción): eso es «cambiada».
    -- Contar `embedding IS NULL` mezclaría lo que cambió con lo que aún no se ha embebido.
    RETURNING (xmax = 0) AS insertada, (updated_at = now()) AS cambiada
  )
  SELECT count(*) FILTER (WHERE insertada)::int, count(*) FILTER (WHERE NOT insertada AND cambiada)::int
  INTO ins, cam FROM up;

  DELETE FROM grafo_embeddings e WHERE NOT EXISTS (SELECT 1 FROM _grafo_src s WHERE s.id = e.id);
  GET DIAGNOSTICS bor = ROW_COUNT;
  RETURN QUERY SELECT ins, cam, bor;
END $$;
REVOKE ALL ON FUNCTION public.grafo_embeddings_sync() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grafo_embeddings_sync() TO prisma_plataforma;

-- La clave de OpenRouter la guarda la app (desde su env) en Vault; nunca viaja en el repo ni en CI.
CREATE OR REPLACE FUNCTION public.grafo_guardar_clave(clave text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE sid uuid;
BEGIN
  IF clave IS NULL OR length(clave) < 10 THEN RAISE EXCEPTION 'grafo_guardar_clave: clave vacía'; END IF;
  SELECT id INTO sid FROM vault.secrets WHERE name = 'grafo_openrouter_api_key';
  IF sid IS NULL THEN
    PERFORM vault.create_secret(clave, 'grafo_openrouter_api_key', 'OpenRouter (embeddings del grafo de código); la escribe /api/internal/grafo-codigo/embeddings');
  ELSE
    PERFORM vault.update_secret(sid, clave);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.grafo_guardar_clave(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grafo_guardar_clave(text) TO prisma_plataforma;

-- Embebe N textos en UNA llamada a OpenRouter. idx es el índice 0-based del array de entrada.
CREATE OR REPLACE FUNCTION public.grafo_embed_textos(textos text[])
RETURNS TABLE (idx int, embedding vector)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, vault AS $$
DECLARE clave text; resp extensions.http_response; cuerpo jsonb;
BEGIN
  IF textos IS NULL OR array_length(textos, 1) IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO clave FROM vault.decrypted_secrets WHERE name = 'grafo_openrouter_api_key' LIMIT 1;
  IF clave IS NULL THEN
    RAISE EXCEPTION 'grafo_embed_textos: no hay clave en Vault (grafo_openrouter_api_key). La guarda /api/internal/grafo-codigo/embeddings al correr la auditoría.';
  END IF;
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '90000');
  resp := extensions.http((
    'POST',
    'https://openrouter.ai/api/v1/embeddings',
    ARRAY[extensions.http_header('Authorization', 'Bearer ' || clave),
          extensions.http_header('X-Title', 'central grafo-codigo')],
    'application/json',
    jsonb_build_object('model', 'openai/text-embedding-3-small', 'input', to_jsonb(textos), 'dimensions', 768)::text
  )::extensions.http_request);
  IF resp.status <> 200 THEN
    RAISE EXCEPTION 'OpenRouter embeddings HTTP %: %', resp.status, left(coalesce(resp.content, ''), 300);
  END IF;
  cuerpo := resp.content::jsonb;
  RETURN QUERY
    SELECT (d->>'index')::int, (d->'embedding')::text::vector
    FROM jsonb_array_elements(cuerpo->'data') d;
END $$;
REVOKE ALL ON FUNCTION public.grafo_embed_textos(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grafo_embed_textos(text[]) TO prisma_plataforma;

-- Calcula hasta n embeddings pendientes (una llamada HTTP). Devuelve cuántos escribió; 0 = nada pendiente.
CREATE OR REPLACE FUNCTION public.grafo_embed_lote(n int DEFAULT 96)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE ids text[]; textos text[]; cnt int;
BEGIN
  SELECT array_agg(s.id ORDER BY s.id), array_agg(s.texto ORDER BY s.id) INTO ids, textos
  FROM (SELECT id, texto FROM grafo_embeddings WHERE embedding IS NULL ORDER BY id LIMIT n) s;
  IF ids IS NULL THEN RETURN 0; END IF;
  UPDATE grafo_embeddings e SET embedding = v.embedding, updated_at = now()
  FROM grafo_embed_textos(textos) v
  WHERE e.id = ids[v.idx + 1];
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END $$;
REVOKE ALL ON FUNCTION public.grafo_embed_lote(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grafo_embed_lote(int) TO prisma_plataforma;

-- ── Consultas semánticas (lo que Graphify llamaba query_graph / rank_files / find_seeds) ─────
-- Pregunta en lenguaje natural → símbolos/archivos más parecidos. `similitud` = coseno (1 = igual).
CREATE OR REPLACE FUNCTION public.grafo_buscar(q text, lim int DEFAULT 15)
RETURNS TABLE (id text, tipo text, ruta text, nombre text, linea int, similitud real, texto text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE qv vector;
BEGIN
  SELECT v.embedding INTO qv FROM grafo_embed_textos(ARRAY[q]) v LIMIT 1;
  IF qv IS NULL THEN RAISE EXCEPTION 'grafo_buscar: no se pudo embeber la pregunta'; END IF;
  RETURN QUERY
    SELECT e.id, e.tipo, e.ruta, e.nombre, e.linea, (1 - (e.embedding <=> qv))::real, e.texto
    FROM grafo_embeddings e
    WHERE e.embedding IS NOT NULL
    ORDER BY e.embedding <=> qv
    LIMIT lim;
END $$;
-- SECURITY DEFINER + EXECUTE por defecto a anon = RPC público que gasta OpenRouter y devuelve el índice: se cierra.
REVOKE ALL ON FUNCTION public.grafo_buscar(text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grafo_buscar(text, int) TO prisma_plataforma;

-- Archivos relevantes para una tarea (rank_files): agrega los k nodos más parecidos por archivo.
CREATE OR REPLACE FUNCTION public.grafo_rank_files(q text, lim int DEFAULT 10, k int DEFAULT 40)
RETURNS TABLE (ruta text, puntuacion real, nodos int, simbolos text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT b.ruta, sum(b.similitud)::real, count(*)::int,
         (array_agg(b.nombre ORDER BY b.similitud DESC) FILTER (WHERE b.tipo <> 'archivo'))[1:6]
  FROM grafo_buscar(q, k) b
  GROUP BY b.ruta
  ORDER BY 2 DESC
  LIMIT lim
$$;
REVOKE ALL ON FUNCTION public.grafo_rank_files(text, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grafo_rank_files(text, int, int) TO prisma_plataforma;

-- ── Consultas estructurales que faltaban ─────────────────────────────────────────────────────
-- Camino dirigido más corto entre dos ARCHIVOS por dependencias (importa/reexporta/llama/usa,
-- consciente de barriles vía grafo_deps_archivo). Lo que Graphify daba como trace / shortest_path.
-- BFS por NIVELES con conjunto de visitados (O(V+E)): una CTE recursiva con el camino en un array
-- explota en un grafo de 3.000 archivos (fan-out^prof filas). Una fila por paso; vacío = no hay camino
-- en ≤ max_prof saltos.
CREATE OR REPLACE FUNCTION public.grafo_camino(origen_in text, destino_in text, max_prof int DEFAULT 8)
RETURNS TABLE (paso int, ruta text)
LANGUAGE plpgsql SET search_path = public AS $$  -- VOLATILE a propósito: escribe una tabla temporal
DECLARE nivel int := 0; nuevos int;
BEGIN
  IF origen_in = destino_in THEN RETURN QUERY SELECT 0, origen_in; RETURN; END IF;
  DROP TABLE IF EXISTS _grafo_bfs;
  CREATE TEMP TABLE _grafo_bfs (ruta text PRIMARY KEY, padre text, prof int) ON COMMIT DROP;
  INSERT INTO _grafo_bfs VALUES (origen_in, NULL, 0);
  LOOP
    INSERT INTO _grafo_bfs (ruta, padre, prof)
    SELECT DISTINCT ON (d.destino) d.destino, d.origen, nivel + 1
    FROM grafo_deps_archivo d JOIN _grafo_bfs b ON b.ruta = d.origen AND b.prof = nivel
    WHERE NOT EXISTS (SELECT 1 FROM _grafo_bfs v WHERE v.ruta = d.destino)
    ORDER BY d.destino, d.origen;
    GET DIAGNOSTICS nuevos = ROW_COUNT;
    nivel := nivel + 1;
    EXIT WHEN nuevos = 0 OR nivel >= max_prof OR EXISTS (SELECT 1 FROM _grafo_bfs WHERE _grafo_bfs.ruta = destino_in);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM _grafo_bfs WHERE _grafo_bfs.ruta = destino_in) THEN DROP TABLE _grafo_bfs; RETURN; END IF;
  -- Reconstruye el camino recorriendo padres desde el destino y lo devuelve en orden.
  RETURN QUERY
    WITH RECURSIVE atras AS (
      SELECT b.ruta, b.padre, b.prof FROM _grafo_bfs b WHERE b.ruta = destino_in
      UNION ALL
      SELECT b.ruta, b.padre, b.prof FROM _grafo_bfs b JOIN atras a ON b.ruta = a.padre
    )
    SELECT a.prof, a.ruta FROM atras a ORDER BY a.prof;
  DROP TABLE _grafo_bfs;
END $$;

-- Todas las referencias a un símbolo: quién lo llama/usa (aristas al nodo) y quién lo importa
-- (aristas importa/reexporta cuyo `simbolos` lo nombra). Lo que Graphify llamaba references.
CREATE OR REPLACE FUNCTION public.grafo_referencias(simbolo text)
RETURNS TABLE (origen text, tipo text, linea int, destino text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH raiz AS (
    SELECT id, ruta, nombre FROM grafo_nodos n
    WHERE n.id = simbolo OR (n.nombre = simbolo AND n.tipo <> 'archivo')
  )
  SELECT a.origen, a.tipo, a.linea, a.destino
  FROM grafo_aristas a JOIN raiz r ON a.destino = r.id
  UNION
  SELECT a.origen, a.tipo, a.linea, a.destino
  FROM grafo_aristas a JOIN raiz r ON a.destino = r.ruta
  WHERE a.tipo IN ('importa', 'reexporta') AND r.nombre = ANY(a.simbolos)
  ORDER BY 1, 3
$$;

-- Imports (qué trae y de dónde) y exports (qué declara público) de un archivo.
CREATE OR REPLACE FUNCTION public.grafo_imports_exports(ruta_in text)
RETURNS TABLE (direccion text, tipo text, ruta text, nombre text, linea int, simbolos text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT 'import' AS direccion, a.tipo, a.destino AS ruta, NULL::text AS nombre, a.linea, a.simbolos
  FROM grafo_aristas a WHERE a.origen = ruta_in AND a.tipo IN ('importa', 'reexporta')
  UNION ALL
  SELECT 'export', n.tipo, n.ruta, n.nombre, n.linea, NULL::text[]
  FROM grafo_nodos n WHERE n.ruta = ruta_in AND n.tipo <> 'archivo' AND n.exportado IS TRUE
  ORDER BY 1, 5
$$;

-- Ficha de un nodo (por id, ruta o nombre): qué es, dónde vive y cuántas aristas entran/salen.
-- El CUERPO se lee del archivo (Read) — el grafo da la línea, no sustituye leer el código.
CREATE OR REPLACE FUNCTION public.grafo_nodo(clave text)
RETURNS TABLE (id text, tipo text, ruta text, nombre text, linea int, exportado boolean, ambito text,
               entrantes int, salientes int, llamado_por text[], llama_a text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT n.id, n.tipo, n.ruta, n.nombre, n.linea, n.exportado, n.ambito,
         (SELECT count(*)::int FROM grafo_aristas a WHERE a.destino = n.id),
         (SELECT count(*)::int FROM grafo_aristas a WHERE a.origen = n.id),
         (SELECT (array_agg(DISTINCT a.origen))[1:20] FROM grafo_aristas a WHERE a.destino = n.id),
         (SELECT (array_agg(DISTINCT a.destino))[1:20] FROM grafo_aristas a WHERE a.origen = n.id)
  FROM grafo_nodos n
  WHERE n.id = clave OR n.ruta = clave OR (n.nombre = clave AND n.tipo <> 'archivo')
  ORDER BY (n.id = clave) DESC, n.tipo, n.ruta
  LIMIT 20
$$;

-- Subgrafo: las aristas que unen un conjunto de nodos (ids o rutas). Para dibujar/leer la relación
-- entre varias piezas concretas (lo que Graphify llamaba render_subgraph).
CREATE OR REPLACE FUNCTION public.grafo_subgrafo(claves text[])
RETURNS TABLE (origen text, destino text, tipo text, linea int)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH nodos AS (
    SELECT n.id FROM grafo_nodos n WHERE n.id = ANY(claves) OR n.ruta = ANY(claves)
  )
  SELECT a.origen, a.destino, a.tipo, a.linea
  FROM grafo_aristas a
  WHERE a.origen IN (SELECT id FROM nodos) AND a.destino IN (SELECT id FROM nodos)
  ORDER BY 1, 2, 4
$$;
