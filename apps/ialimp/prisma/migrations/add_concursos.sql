-- Concursos públicos (módulo @iarest/module-concursos) — tabla propiedad de la app.
-- El módulo es lógica pura; ialimp persiste aquí la ficha y el checklist que
-- devuelve el agente. Multi-tenant: SIEMPRE scopeado por empresa_id.
-- BD compartida Supabase wswbehlcuxqxyinousql. Gestión por SQL crudo.

CREATE TABLE IF NOT EXISTS concursos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  titulo      text NOT NULL,                 -- objeto del contrato (resumen)
  expediente  text,                          -- nº de expediente si se detecta
  estado      text NOT NULL DEFAULT 'analizado',  -- analizado | preparando | presentado | descartado
  ficha       jsonb NOT NULL,                -- FichaConcurso (salida del agente)
  checklist   jsonb NOT NULL DEFAULT '[]',   -- ItemChecklist[] derivado
  go_no_go    jsonb,                         -- EvaluacionGoNoGo (semáforo + banderas)
  garantias   jsonb,                         -- GarantiasCalculadas (€)
  texto_origen text,                         -- texto del pliego analizado (auditoría)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concursos_empresa ON concursos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_concursos_empresa_created ON concursos(empresa_id, created_at DESC);
