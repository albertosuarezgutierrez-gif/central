-- Documentos APORTADOS A MANO a una subasta (botón «📥 Aportar documentos» de
-- la ficha de /subastas). El caso de uso: las fichas cuyo muro documental el
-- cron no puede cruzar (el Portal exige sesión y el login automático no es
-- viable — 2FA + captcha, PRs #1548→#1560). Alberto baja los PDFs con su
-- sesión y los sube; el lector registral los lee y las cargas van al corpus
-- (`subastas.cargas_*`) con la misma semántica que el cron.
--
-- Esta tabla es el HISTÓRICO de lo aportado: qué documento, qué salió de él
-- (cuadro de cargas + señales del edicto) y si fue legible. No se pisa nunca.
-- `cuadro` va a NULL cuando el lector no sacó nada (`legible = false`): un
-- cuadro vacío guardado se leería mañana como «sin cargas», que es el error
-- caro de siempre.
--
-- Las señales del edicto viven aquí (columna `notas`) y NO en
-- `subastas.notas_edicto`: esa columna la pisa el cron incondicionalmente en
-- cada pasada y se llevaría por delante lo aportado.
CREATE TABLE IF NOT EXISTS subastas_docs_aportados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL,
  dedupe_key  text NOT NULL,
  titulo      text NOT NULL,
  -- Cómo se leyó ('texto' | 'vision'), para poder auditar de dónde salió cada cifra.
  via         text,
  paginas     int,
  legible     boolean NOT NULL,
  cuadro      jsonb,
  notas       jsonb NOT NULL DEFAULT '[]'::jsonb,
  creada_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subastas_docs_aportados
  ON subastas_docs_aportados (cuenta_id, dedupe_key, creada_en DESC);

-- Solo la app (rol con BYPASSRLS) toca esta tabla, como el resto de `subastas_*`.
REVOKE ALL ON TABLE subastas_docs_aportados FROM anon, authenticated;

COMMENT ON TABLE subastas_docs_aportados IS
  'Documentos de una subasta subidos a mano (fichas con muro documental del Portal), con el cuadro de cargas leído por el lector registral. Histórico: no se pisa. Ver apps/plataforma/lib/subastas/docs-aportados.ts';
