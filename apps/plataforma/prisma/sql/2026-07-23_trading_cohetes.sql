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

-- Acceso: SOLO roles de servicio. Se cierra por las dos vías a la vez.
--
-- (1) REVOKE a anon/authenticated: es lo que de verdad impide que PostgREST sirva estas
--     tablas. Sin privilegio no hay lectura, con RLS o sin ella.
-- (2) ENABLE RLS: aquí no cierra ninguna fuga —los cinco roles que sí tienen privilegio
--     (app_user, postgres, prisma_plataforma, prisma_sivra, service_role) llevan BYPASSRLS,
--     así que no cambia nada operativo. Lo que hace es fijar el suelo: si algún día alguien
--     concede un GRANT a anon «para una gráfica», deny-by-default lo detiene en vez de
--     publicar la cartera entera. Es además el estado del resto del esquema: tras esto,
--     CERO tablas de `public` quedan sin RLS (antes eran estas dos, las últimas).
--
-- 🚨 Estaba al revés hasta el 12/08/2026 (`DISABLE ROW LEVEL SECURITY`), que es lo que
-- levantaba el aviso de seguridad de Supabase. Se corrigió en la BD por migración
-- `rls_trading_cohetes`; esta línea se cambia para que reejecutar el fichero NO lo deshaga.
-- Sin políticas a propósito: escribir una sin saber quién la necesita sería inventarse el
-- criterio de acceso.
ALTER TABLE trading_cohetes_rebalanceo ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_cohetes_track      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trading_cohetes_rebalanceo FROM anon, authenticated;
REVOKE ALL ON trading_cohetes_track      FROM anon, authenticated;
