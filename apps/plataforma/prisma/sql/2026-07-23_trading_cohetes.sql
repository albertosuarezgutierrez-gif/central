-- 🚀 Cartera cohetes (paper, rotatoria). Bolsillo simulado independiente del núcleo. SOLO estudio.
-- Libro de rebalanceos INMUTABLE (una fila por lunes) + curva diaria. Data global del laboratorio
-- (como trading_ranking): sin RLS, revocado a anon/authenticated.

CREATE TABLE IF NOT EXISTS trading_cohetes_rebalanceo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha        date NOT NULL UNIQUE,          -- día del rebalanceo (lunes)
  capital_eur  double precision NOT NULL,     -- valor vivo arrastrado (30.000€ en el inicio)
  cesta        jsonb NOT NULL,                -- Tenencia[] { simbolo, unidades, precioEntrada, esIpo, mesesCotizando }
  spy_precio   double precision,              -- cierre SPY ese día (referencia)
  spy_unidades double precision,              -- unidades SPY del benchmark buy&hold (solo la fila de INICIO)
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trading_cohetes_track (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         date NOT NULL UNIQUE,         -- día de la valoración
  valor_eur     double precision NOT NULL,    -- valor de la cartera cohetes
  spy_eur       double precision,             -- valor del benchmark SPY buy&hold (mismo capital inicial)
  pl_pct        double precision,             -- P&L de la cartera desde el rebalanceo vigente
  alpha_pct     double precision,             -- cartera vs SPY (ambas desde inicio)
  ipo_valor_eur double precision,             -- sub-cesta de recién cotizados
  ipo_pl_pct    double precision,
  n_ipo         integer,
  detalle       jsonb,                        -- P&L por nombre (ValoracionNombre[])
  creado_en     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trading_cohetes_rebalanceo DISABLE ROW LEVEL SECURITY;
ALTER TABLE trading_cohetes_track      DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON trading_cohetes_rebalanceo FROM anon, authenticated;
REVOKE ALL ON trading_cohetes_track      FROM anon, authenticated;
