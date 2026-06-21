-- Agente de concursos (ialimp) — "Mis concursos": licitaciones que la empresa
-- SIGUE, con su estado y un snapshot del anuncio (sobrevive aunque el anuncio
-- salga del corpus `concursos_licitaciones`). Tabla ADITIVA. RLS ON sin policies
-- (la usa el rol de Prisma; la anon key de sivra queda bloqueada), mismo patrón
-- que recordatorios_impagos / concursos_radar_anuncios.
CREATE TABLE IF NOT EXISTS concursos_seguidos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL,
  dedupe_key             text NOT NULL,            -- identidad estable del anuncio (PLACSP)
  licitacion             jsonb NOT NULL,           -- snapshot {titulo,organo,provincia,cpv,presupuesto,fin_presentacion,url}
  estado                 text NOT NULL DEFAULT 'interesado', -- interesado|preparando|presentado|adjudicado|perdido
  notas                  text,
  fin_presentacion       date,                     -- denormalizado (lo usa el cron de cierre)
  recordatorio_cierre_at timestamptz,              -- cuándo se avisó del cierre (idempotencia del cron)
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now()
);

-- Un seguimiento por (empresa, anuncio) → "Seguir" es idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS ux_concursos_seguidos_empresa_key
  ON concursos_seguidos (empresa_id, dedupe_key);

CREATE INDEX IF NOT EXISTS ix_concursos_seguidos_empresa
  ON concursos_seguidos (empresa_id, fin_presentacion);

ALTER TABLE concursos_seguidos ENABLE ROW LEVEL SECURITY;
