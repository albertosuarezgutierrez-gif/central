-- Trading-analista (IBKR) · Fase 1 — 6 tablas nuevas y AISLADAS.
-- Generado con `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
-- y recortado a las tablas `trading_*` (no toca tablas/RLS/GRANTs de otras verticales).
-- ⚠️ NO aplicado por la sesión Claude: Alberto lo lanza a mano contra la Supabase compartida.

-- CreateTable
CREATE TABLE "trading_watchlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simbolo" TEXT NOT NULL,
    "capa" TEXT NOT NULL,
    "horizonte" INTEGER NOT NULL DEFAULT 10,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "promocionado_en" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_tesis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simbolo" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estrategia" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "confianza" INTEGER NOT NULL,
    "horizonte_dias" INTEGER NOT NULL,
    "precio_ref" DOUBLE PRECISION NOT NULL,
    "indicadores" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_tesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_tesis_resultado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tesis_id" UUID NOT NULL,
    "precio_despues" DOUBLE PRECISION NOT NULL,
    "ventana_dias" INTEGER NOT NULL,
    "retorno" DOUBLE PRECISION NOT NULL,
    "acierto" BOOLEAN NOT NULL,
    "puntuado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_tesis_resultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_paper_orden" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simbolo" TEXT NOT NULL,
    "lado" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_paper_orden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_paper_posicion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simbolo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_entrada" DOUBLE PRECISION NOT NULL,
    "stop" DOUBLE PRECISION NOT NULL,
    "abierta_en" DATE NOT NULL,

    CONSTRAINT "trading_paper_posicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trading_estrategia_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "estrategia" TEXT NOT NULL,
    "regimen" TEXT NOT NULL,
    "hit_rate" DOUBLE PRECISION NOT NULL,
    "retorno_medio" DOUBLE PRECISION NOT NULL,
    "n" INTEGER NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trading_estrategia_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trading_watchlist_simbolo_key" ON "trading_watchlist"("simbolo");

-- CreateIndex
CREATE INDEX "trading_tesis_simbolo_fecha_idx" ON "trading_tesis"("simbolo", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "trading_tesis_resultado_tesis_id_key" ON "trading_tesis_resultado"("tesis_id");

-- CreateIndex
CREATE UNIQUE INDEX "trading_paper_posicion_simbolo_key" ON "trading_paper_posicion"("simbolo");

-- CreateIndex
CREATE UNIQUE INDEX "trading_estrategia_stats_estrategia_regimen_key" ON "trading_estrategia_stats"("estrategia", "regimen");

-- AddForeignKey
ALTER TABLE "trading_tesis_resultado" ADD CONSTRAINT "trading_tesis_resultado_tesis_id_fkey" FOREIGN KEY ("tesis_id") REFERENCES "trading_tesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
