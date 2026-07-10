-- Índice de arquitectura a nivel de FUNCIÓN — lo consume el Director de código para acotar
-- qué archivo(s) tocar antes de invocar al agente programador (coste 0 tokens de contexto).
-- Se rellena por el endpoint /api/internal/mapa-arquitectura (POST con CRON_SECRET), alimentado
-- por scripts/auditar-estructura.mjs → docs/mapa-funciones.generated.json en el workflow de CI.
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- prisma_plataforma es BYPASSRLS → sin políticas RLS. NUNCA exponer por REST/anon.
-- Artefacto GLOBAL del operador (como ia_director/correo_triaje): sin cuenta_id.

CREATE TABLE IF NOT EXISTS public.mapa_arquitectura (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta        text NOT NULL,                 -- ruta repo-relativa del archivo (clave lógica)
  ambito      text,                          -- app o package (ej. 'apps/plataforma')
  resumen     text,                          -- comentario de cabecera del archivo (0 tokens IA)
  funciones   jsonb NOT NULL DEFAULT '[]',   -- [{nombre,params,retorno,exportada,kind,linea,resumen}]
  tablas      text[]  NOT NULL DEFAULT '{}', -- tablas SQL que el archivo referencia
  ruta_api    text,                          -- '/api/...' si el archivo es una ruta App Router
  hash        text,                          -- sha1 corto del contenido (salta upserts no-op)
  sha         text,                          -- SHA de git del que se generó el índice (frescura)
  busqueda    text,                          -- ruta + resumen + nombres de función (para trigram)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Clave del upsert: una fila por archivo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapa_arquitectura_ruta ON public.mapa_arquitectura (ruta);

-- Búsqueda por subcadena ULTRA-rápida sobre nombres de archivo/función/resumen (ej. "login").
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_mapa_arquitectura_busqueda
  ON public.mapa_arquitectura USING gin (busqueda gin_trgm_ops);

-- "¿Qué archivo toca la tabla X?" en O(log n).
CREATE INDEX IF NOT EXISTS idx_mapa_arquitectura_tablas
  ON public.mapa_arquitectura USING gin (tablas);

-- Defensa en profundidad: BD compartida con el cliente anon de ialimp → nunca visible por REST.
REVOKE ALL ON public.mapa_arquitectura FROM anon, authenticated;
