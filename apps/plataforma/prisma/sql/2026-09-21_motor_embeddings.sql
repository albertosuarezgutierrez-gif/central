-- Motor de embeddings de la MEMORIA SEMÁNTICA (21/09/2026).
--
-- Sustituye a `2026-09-12_grafo_semantico.sql`, borrado en el mismo PR que retiró el grafo de
-- código propio (tablas `grafo_nodos`/`grafo_aristas`/`grafo_embeddings` y todas sus funciones de
-- consulta). Aquel fichero provisionaba las dos cosas a la vez, así que dejarlo habría dejado un
-- script que ABORTA al reprovisionar (`relation "grafo_nodos" does not exist`) y que, de paso,
-- recrearía la tabla de embeddings que se acaba de retirar. Aquí queda SOLO el motor, que la
-- memoria sigue usando: `memoria_embed_lote` y `memoria_buscar` (2026-09-12_memoria_semantica.sql)
-- llaman a `grafo_embed_textos()`.
--
-- ⚠️ LOS NOMBRES SIGUEN SIENDO `grafo_*` A PROPÓSITO: así se llaman las funciones VIVAS en la BD y
-- así las invoca `memoria_semantica`. Renombrarlas aquí haría que este fichero creara gemelas y
-- dejara huérfanas a las que de verdad se usan. No son un resto del grafo: son el motor.
--
-- BD COMPARTIDA multi-tenant. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- Artefacto GLOBAL del operador: sin cuenta_id, sin RLS, NUNCA por REST/anon.
-- ⚠️ Quien pueda ejecutar SQL como postgres puede leer la clave de Vault: usa una key de OpenRouter
--    DEDICADA (env GRAFO_OPENROUTER_API_KEY) con límite de gasto propio, no la principal.

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- La clave de OpenRouter la guarda la app (desde su env) en Vault; nunca viaja en el repo ni en CI.
-- El ÚNICO escritor es /api/internal/memoria/embeddings: lo era /api/internal/grafo-codigo/embeddings
-- hasta el 21/09/2026, y al borrar esa ruta con el grafo la clave se quedó sin forma de reponerse
-- (la memoria solo la LEE). Si Vault la pierde, `memoria_buscar` muere en 503 sin camino de vuelta.
--
-- RETURNS boolean, no void: Prisma ($queryRaw, node-postgres) no sabe deserializar una columna
-- de tipo `void` — probado en runtime (auditoria.yml, 12/09/2026): `Failed to deserialize column
-- of type 'void'`. El MCP de Supabase (driver distinto) no lo detectó al probarlo a mano.
CREATE OR REPLACE FUNCTION public.grafo_guardar_clave(clave text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE sid uuid;
BEGIN
  IF clave IS NULL OR length(clave) < 10 THEN RAISE EXCEPTION 'grafo_guardar_clave: clave vacía'; END IF;
  SELECT id INTO sid FROM vault.secrets WHERE name = 'grafo_openrouter_api_key';
  IF sid IS NULL THEN
    PERFORM vault.create_secret(clave, 'grafo_openrouter_api_key', 'OpenRouter (embeddings de la memoria semántica); la escribe /api/internal/memoria/embeddings');
  ELSE
    PERFORM vault.update_secret(sid, clave);
  END IF;
  RETURN true;
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
    RAISE EXCEPTION 'grafo_embed_textos: no hay clave en Vault (grafo_openrouter_api_key). La guarda /api/internal/memoria/embeddings al correr la auditoría.';
  END IF;
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '90000');
  resp := extensions.http((
    'POST',
    'https://openrouter.ai/api/v1/embeddings',
    ARRAY[extensions.http_header('Authorization', 'Bearer ' || clave),
          extensions.http_header('X-Title', 'central memoria-semantica')],
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
