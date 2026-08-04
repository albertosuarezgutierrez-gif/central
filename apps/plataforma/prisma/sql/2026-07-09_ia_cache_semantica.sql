-- Caché SEMÁNTICA de la pasarela de IA (opt-in, apagada por defecto: env IA_CACHE_SEMANTICA=1
-- + el caller debe mandar `cache:{ambito,...}` en el body). Primer uso de pgvector del monorepo.
-- Embeddings: Gemini text-embedding-004 (768 dims, gratis). Umbral de similitud coseno >= 0.97.
-- ⚠️ Antes de aplicar: comprobar que la extensión `vector` está disponible en el proyecto
-- Supabase compartido (wswbehlcuxqxyinousql). En Supabase viene empaquetada de serie.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.ia_cache_semantica (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  app        text         NOT NULL,               -- vertical que cacheó (ai_usos.app)
  ambito     text         NOT NULL,               -- espacio de nombres del caller (p. ej. 'clasificacion-gasto'); nunca se cruza
  pregunta   text         NOT NULL,               -- entrada original (para inspección humana)
  embedding  vector(768)  NOT NULL,               -- text-embedding-004
  respuesta  text         NOT NULL,
  modelo     text,                                -- modelo que generó la respuesta cacheada
  hits       integer      NOT NULL DEFAULT 0,
  creada_at  timestamptz  NOT NULL DEFAULT now(),
  expira_at  timestamptz  NOT NULL                -- TTL obligatorio (default 24h en código)
);
-- HNSW por coseno: barato de mantener a este volumen y sin necesidad de reindexar como ivfflat.
CREATE INDEX IF NOT EXISTS idx_ia_cache_semantica_emb
  ON public.ia_cache_semantica USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_ia_cache_semantica_expira ON public.ia_cache_semantica(expira_at);
