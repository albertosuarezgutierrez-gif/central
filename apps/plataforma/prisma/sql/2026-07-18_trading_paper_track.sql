-- Forward paper (Fase B) · snapshot SEMANAL de cada cohorte congelada vs el SPY, con métricas de riesgo
-- (idea 3: drawdown/vol/tracking error) y atribución del filtro de calidad (idea 4: cesta gurús-solo).
-- Tabla nueva y AISLADA (no toca tablas/RLS/GRANTs de otras verticales). La escribe el cron `paper-tracker`
-- de forma idempotente (upsert por cohorte+fecha). Solo medición — cero órdenes reales.
-- ⚠️ Aplicar a mano contra la Supabase compartida (rol DATABASE_URL, bypassa RLS), como el resto de trading_*.

-- CreateTable
CREATE TABLE IF NOT EXISTS "trading_paper_track" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cohorte" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "n" INTEGER NOT NULL,
    "retorno_cesta" DOUBLE PRECISION NOT NULL,
    "retorno_mediana" DOUBLE PRECISION,
    "retorno_bench" DOUBLE PRECISION NOT NULL,
    "alpha" DOUBLE PRECISION NOT NULL,
    "alpha_mediana" DOUBLE PRECISION,
    "baten" INTEGER NOT NULL,
    -- Riesgo (idea 3): batir con más riesgo no es batir.
    "max_drawdown" DOUBLE PRECISION,
    "max_drawdown_bench" DOUBLE PRECISION,
    "vol_anual" DOUBLE PRECISION,
    "tracking_error" DOUBLE PRECISION,
    -- Atribución (idea 4): rendimiento de la cesta gurús-solo (2º benchmark) para aislar el aporte del filtro.
    "retorno_base" DOUBLE PRECISION,
    "mediana_base" DOUBLE PRECISION,
    "n_base" INTEGER,
    "benchmark" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_paper_track_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — 1 snapshot por cohorte y día (el cron es idempotente si corre dos veces).
CREATE UNIQUE INDEX IF NOT EXISTS "trading_paper_track_cohorte_fecha_key" ON "trading_paper_track"("cohorte", "fecha");
CREATE INDEX IF NOT EXISTS "trading_paper_track_cohorte_idx" ON "trading_paper_track"("cohorte");

-- EnableRLS — convención de esta BD compartida: RLS activada sin políticas (deniega anon/authenticated;
-- Prisma con DATABASE_URL bypassa RLS y sigue leyendo/escribiendo). Espeja las demás tablas trading_*.
ALTER TABLE "trading_paper_track" ENABLE ROW LEVEL SECURITY;
