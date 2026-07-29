-- Radar del universo EEUU (Fase 1) · caché incremental + snapshots semanales del ranking.
-- Tablas nuevas y AISLADAS (patrón trading_*). Aplicada por Supabase MCP (wswbehlcuxqxyinousql)
-- el 19/07/2026. RLS habilitada sin políticas (deniega anon/authenticated; Prisma bypassa).
CREATE TABLE IF NOT EXISTS "trading_universo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simbolo" TEXT NOT NULL,
    "cik" TEXT,
    "nombre" TEXT,
    "piotroski" INTEGER,
    "roic" DOUBLE PRECISION,
    "earnings_yield" DOUBLE PRECISION,
    "momentum" DOUBLE PRECISION,
    "precio" DOUBLE PRECISION,
    "mkt_cap" DOUBLE PRECISION,
    "datos" JSONB,
    "fuente_fy" INTEGER,
    "error" TEXT,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_universo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trading_universo_simbolo_key" ON "trading_universo"("simbolo");
CREATE INDEX IF NOT EXISTS "trading_universo_actualizado_en_idx" ON "trading_universo"("actualizado_en");

CREATE TABLE IF NOT EXISTS "trading_ranking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha" DATE NOT NULL,
    "entries" JSONB NOT NULL,
    "track_record" JSONB,
    "salud" JSONB,
    "universo_total" INTEGER NOT NULL,
    "con_datos" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_ranking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trading_ranking_fecha_key" ON "trading_ranking"("fecha");

ALTER TABLE "trading_universo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trading_ranking" ENABLE ROW LEVEL SECURITY;
