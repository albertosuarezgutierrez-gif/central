-- Agente Director (router de modelos OpenRouter de la pasarela /api/ai/*).
-- Guarda el system prompt del Director + el catálogo de modelos permitidos (allowlist con
-- precios) que regenera cada semana el cron /api/cron/ia-director-refresh leyendo el
-- endpoint público de OpenRouter (/api/v1/models). Histórico por versión: se lee la última.
CREATE TABLE IF NOT EXISTS public.ia_director_prompt (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version    integer     NOT NULL,                     -- monotónica; se lee MAX(version)
  prompt     text        NOT NULL,                     -- system prompt del Director (estricto)
  catalogo   jsonb       NOT NULL,                     -- { modelos: [{id, precio_in, precio_out, contexto, tags[], eu}], suplentes: [id,...] }
  origen     text        NOT NULL DEFAULT 'cron',      -- 'semilla' | 'cron' | 'manual'
  creada_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_director_prompt_version ON public.ia_director_prompt(version DESC);

-- Semilla conservadora (versión 1) escrita a mano: la primera pasada del cron la sustituye
-- por el catálogo vivo. precio_in/precio_out en USD por MILLÓN de tokens.
INSERT INTO public.ia_director_prompt (version, prompt, catalogo, origen)
SELECT 1,
$director$Eres el DIRECTOR de una pasarela de IA. Tu ÚNICA tarea: leer la petición del usuario y elegir el modelo ideal del catálogo. Responde SOLO con JSON {"modelo": "<slug>"}.

Criterios:
- Lógica, datos, cifras, clasificación, SQL → deepseek/deepseek-chat
- Redacción humana cuidada (emails a clientes, textos comerciales) → anthropic/claude-3.5-sonnet
- Contexto masivo (documentos largos) o multimodal → google/gemini-2.0-flash-001
- Todo lo demás (chat corto, resúmenes, extracción simple) → meta-llama/llama-3.3-70b-instruct

Catálogo permitido: deepseek/deepseek-chat, anthropic/claude-3.5-sonnet, google/gemini-2.0-flash-001, meta-llama/llama-3.3-70b-instruct$director$,
$catalogo${
  "modelos": [
    { "id": "deepseek/deepseek-chat",              "precio_in": 0.25, "precio_out": 0.85, "contexto": 64000,   "tags": ["logica", "datos", "barato"] },
    { "id": "anthropic/claude-3.5-sonnet",          "precio_in": 3.0,  "precio_out": 15.0, "contexto": 200000,  "tags": ["redaccion", "vision"] },
    { "id": "google/gemini-2.0-flash-001",          "precio_in": 0.10, "precio_out": 0.40, "contexto": 1000000, "tags": ["contexto", "vision", "barato"] },
    { "id": "meta-llama/llama-3.3-70b-instruct",    "precio_in": 0.10, "precio_out": 0.25, "contexto": 131072,  "tags": ["general", "barato"] }
  ],
  "suplentes": ["meta-llama/llama-3.3-70b-instruct:free", "google/gemini-2.0-flash-001"]
}$catalogo$::jsonb,
'semilla'
WHERE NOT EXISTS (SELECT 1 FROM public.ia_director_prompt);
