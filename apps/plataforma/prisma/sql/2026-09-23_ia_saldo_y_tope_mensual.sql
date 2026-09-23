-- Control del gasto de IA (pieza 1-6 de ASegura OS, 23/09/2026).
--
-- 1) `ia_saldo_diario`: foto DIARIA del saldo de OpenRouter (/api/v1/credits). Hasta hoy el saldo
--    se miraba solo los lunes contra un umbral fijo en $; con la foto diaria se calcula el gasto
--    medio real y los DÍAS de saldo que quedan, que es lo que decide cuándo recargar.
--    `total_usage` de OpenRouter es acumulado y monótono (una recarga sube `total_credits`, no
--    toca el uso), así que el gasto de un tramo es la RESTA de dos fotos.
--    `gasto_registrado_eur` = lo que la pasarela anotó en `ai_usos` para OpenRouter desde la foto
--    anterior; comparado con la resta de fotos dice cuánto gasto NO pasa por la pasarela (llamadas directas).
--    NULL = no se pudo sumar, no «0 €».
-- 2) `ia_presupuestos.limite_mensual_eur`: tope MENSUAL por vertical/cliente, además del diario.
--    NULL o 0 = sin tope mensual para ese ámbito.
CREATE TABLE IF NOT EXISTS ia_saldo_diario (
  fecha                date PRIMARY KEY,
  total_usd            numeric NOT NULL,
  usado_usd            numeric NOT NULL,
  restante_usd         numeric NOT NULL,
  gasto_registrado_eur numeric,
  leido_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ia_saldo_diario ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ia_saldo_diario FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_saldo_diario TO prisma_plataforma;

ALTER TABLE ia_presupuestos ADD COLUMN IF NOT EXISTS limite_mensual_eur numeric;

-- Tope inicial de la correduría: 5 €/mes (su gasto real hasta hoy: 0,02 € en 30 días). Solo se
-- aplica a lo que pasa por la pasarela; al llegar al 100 % asegura sigue con la cadena gratis.
-- `limite_diario_eur` 0 = sin tope diario propio (el global de la env sigue mandando).
INSERT INTO ia_presupuestos (ambito, ref, limite_diario_eur, limite_mensual_eur)
  VALUES ('app', 'asegura', 0, 5)
  ON CONFLICT (ambito, ref) DO UPDATE SET limite_mensual_eur = EXCLUDED.limite_mensual_eur;
