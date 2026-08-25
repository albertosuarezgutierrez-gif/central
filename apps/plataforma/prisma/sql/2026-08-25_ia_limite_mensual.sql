-- Override en BD del límite MENSUAL de la pasarela de IA (nº de llamadas OK/mes).
-- Por qué en BD y no solo env: el 24/08/2026 se agotó `AI_GATEWAY_LIMITE_MENSUAL` y los /api/ai/*
-- pasaron a 429 hasta el día 1; Alberto pidió subirlo («hazlo tú»), pero las sesiones de Claude no
-- pueden escribir envs de Vercel (el conector no lo permite) — mismo motivo que `empresas_acceso_token`
-- y `trading_acceso_token`. Fila única (id=1): si existe y `limite_mensual` NOT NULL, MANDA sobre la
-- env (0 = sin límite); sin fila, la env sigue mandando. Lo lee lib/ai-gateway.ts::limiteMensual().
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon.
CREATE TABLE IF NOT EXISTS public.ia_limite_mensual (
  id             int PRIMARY KEY DEFAULT 1,
  limite_mensual int,
  nota           text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_limite_mensual_single CHECK (id = 1)
);
REVOKE ALL ON public.ia_limite_mensual FROM anon, authenticated;

-- Valor inicial: 12.000 llamadas OK/mes (~2x el ritmo real de agosto/2026: 5.120 en 24 días).
-- El control de GASTO sigue siendo el presupuesto diario en € (AI_GATEWAY_LIMITE_DIARIO_EUR +
-- ia_presupuestos); este contador queda como freno anti-descontrol, no como grifo.
INSERT INTO public.ia_limite_mensual (id, limite_mensual, nota)
  VALUES (1, 12000, 'Subido de la env agotada el 24/08/2026 (decisión Alberto 25/08). 0 = sin límite; borrar la fila = vuelve a mandar la env.')
  ON CONFLICT (id) DO NOTHING;
