-- Memoria semántica PROPIA: sustituto de memories_about/recall/remember de Graphify (12/09/2026).
-- Única pieza que seguía en Graphify tras la paridad de grafo de código (docs/USO-HERRAMIENTAS.md).
-- Fuente: docs/CONTEXTO-SESIONES.md + docs/memoria/*.md (scripts/memoria-parsear.mjs, mismo
-- troceador que ya usa scripts/rotar-memoria.mjs). Reutiliza TAL CUAL grafo_embed_textos()
-- (2026-09-12_grafo_semantico.sql) y su clave en Vault (grafo_openrouter_api_key): no hace falta
-- clave ni infraestructura nueva, es la misma pieza aplicada a otro corpus.
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- Artefacto GLOBAL del operador (como grafo_embeddings): sin cuenta_id, sin RLS, NUNCA por REST/anon.

CREATE TABLE IF NOT EXISTS public.memoria_embeddings (
  id          text PRIMARY KEY,       -- 'fuente#md5(texto)[0:16]' (scripts/memoria-parsear.mjs) — estable aunque la entrada cambie de posición
  fuente      text NOT NULL,          -- 'docs/CONTEXTO-SESIONES.md' o 'docs/memoria/AAAA-MM.md'
  fecha       text,                   -- 'dd/mm/aaaa' de la cabecera de la entrada; NULL si no se pudo extraer
  texto       text NOT NULL,
  hash        text NOT NULL,          -- md5(texto): si cambia, embedding vuelve a NULL y se recalcula
  sha         text,                   -- commit que trajo esta entrada (para borrar lo que ya no está en el corpus)
  embedding   vector(768),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memoria_embeddings_hnsw
  ON public.memoria_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_memoria_embeddings_pendiente ON public.memoria_embeddings (id) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS idx_memoria_embeddings_fuente ON public.memoria_embeddings (fuente);
REVOKE ALL ON public.memoria_embeddings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memoria_embeddings TO prisma_plataforma;

-- Calcula hasta n embeddings pendientes (una llamada HTTP, vía grafo_embed_textos: misma clave,
-- mismo modelo openai/text-embedding-3-small a 768 dims). Devuelve cuántos escribió; 0 = nada pendiente.
CREATE OR REPLACE FUNCTION public.memoria_embed_lote(n int DEFAULT 96)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE ids text[]; textos text[]; cnt int;
BEGIN
  SELECT array_agg(s.id ORDER BY s.id), array_agg(s.texto ORDER BY s.id) INTO ids, textos
  FROM (SELECT id, texto FROM memoria_embeddings WHERE embedding IS NULL ORDER BY id LIMIT n) s;
  IF ids IS NULL THEN RETURN 0; END IF;
  UPDATE memoria_embeddings e SET embedding = v.embedding, updated_at = now()
  FROM grafo_embed_textos(textos) v
  WHERE e.id = ids[v.idx + 1];
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END $$;
REVOKE ALL ON FUNCTION public.memoria_embed_lote(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memoria_embed_lote(int) TO prisma_plataforma;

-- Pregunta en lenguaje natural → entradas de memoria más parecidas (recall/memories_about de
-- Graphify). `similitud` = coseno (1 = igual).
CREATE OR REPLACE FUNCTION public.memoria_buscar(q text, lim int DEFAULT 10)
RETURNS TABLE (id text, fuente text, fecha text, similitud real, texto text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE qv vector;
BEGIN
  SELECT v.embedding INTO qv FROM grafo_embed_textos(ARRAY[q]) v LIMIT 1;
  IF qv IS NULL THEN RAISE EXCEPTION 'memoria_buscar: no se pudo embeber la pregunta'; END IF;
  RETURN QUERY
    SELECT e.id, e.fuente, e.fecha, (1 - (e.embedding <=> qv))::real, e.texto
    FROM memoria_embeddings e
    WHERE e.embedding IS NOT NULL
    ORDER BY e.embedding <=> qv
    LIMIT lim;
END $$;
-- SECURITY DEFINER + EXECUTE por defecto a anon = RPC público que gasta OpenRouter: se cierra.
REVOKE ALL ON FUNCTION public.memoria_buscar(text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memoria_buscar(text, int) TO prisma_plataforma;
