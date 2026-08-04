-- Tokens de RUTINA validados contra BD — vía alternativa a la env `ALERTA_TOKEN` de Vercel.
--
-- POR QUÉ (incidente 26-27/07/2026): `ALERTA_TOKEN` vive como env del proyecto Vercel `plataforma` y,
-- duplicado a mano, en el entorno (o el prompt) de CADA rutina de Claude Code. Cuando esas copias
-- derivan, la rutina recibe 401 y —peor— el canal que se rompe ES el canal de aviso, así que el fallo
-- es mudo. Y una sesión de Claude NO puede escribir envs de Vercel (el conector no lo expone), así que
-- ni siquiera puede repararlo: depende de que un humano lo haga a mano en dos sitios.
-- Mismo razonamiento y mismo patrón que `empresas_acceso_token` (2026-07-17) y `trading_acceso_token`
-- (2026-07-20), que ya viven en BD exactamente por esto: rotar/revocar sin redeploy y sin entrar a Vercel.
--
-- DIFERENCIA A PROPÓSITO con esas dos: aquí se guarda **solo el SHA-256** del token, nunca el valor en
-- claro. Si esta tabla se filtra, no entrega ningún token usable. El valor real solo existe en el
-- entorno/prompt de la rutina.
--
-- ALCANCE (deliberadamente MÁS ESTRECHO que el de la env): un token de esta tabla abre ÚNICAMENTE
-- `/api/internal/alerta`, es decir, mandar un Telegram a Alberto. NO abre `/api/trading/*` ni el
-- pricing (esos siguen exigiendo `ALERTA_TOKEN`/`CRON_SECRET`). Lo vigila el guardián
-- `test/regression-rutina-tokens.test.ts`, que falla si alguien amplía su uso a otro endpoint.
--
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon.
CREATE TABLE IF NOT EXISTS public.rutina_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Qué rutina lo usa ('buscador-ia', 'agentes-entrenador'…). UNO POR RUTINA: así se revoca la que
  -- se filtre sin dejar mudas a las demás (lo contrario del token único compartido de hoy).
  rutina         text NOT NULL,
  -- SHA-256 en hex del token. El token es aleatorio de alta entropía, así que un hash simple basta
  -- (no hace falta bcrypt: no hay diccionario que atacar).
  token_sha256   text NOT NULL UNIQUE,
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  -- Telemetría: cuándo avisó por última vez esa rutina. Tapa parcialmente el "sin telemetría" de
  -- lib/agentes-salud.ts para las rutinas Claude (hasta ahora no dejaban rastro al avisar).
  ultimo_uso_en  timestamptz,
  nota           text
);

-- Búsqueda por hash, solo entre los activos (es el camino caliente de cada aviso).
CREATE INDEX IF NOT EXISTS rutina_tokens_hash_activo_idx
  ON public.rutina_tokens (token_sha256) WHERE activo;

REVOKE ALL ON public.rutina_tokens FROM anon, authenticated;

-- El hash se inserta por Supabase MCP (el token en claro NUNCA se versiona aquí):
-- INSERT INTO public.rutina_tokens (rutina, token_sha256, nota)
--   VALUES ('<rutina>', '<sha256-hex>', '<para qué>');
-- Revocar:  UPDATE public.rutina_tokens SET activo = false WHERE rutina = '<rutina>';
