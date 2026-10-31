-- 2026-10-31_fiscal_compras_previstas.sql — «Compras previstas» del panel fiscal (/finanzas/fiscal).
--
-- Lista donde Alberto apunta una compra que piensa hacer (importe, piso y tipo) y el motor
-- (`lib/simulador-irpf.ts`) dice cuánto baja la cuota si se hace antes del 31/12 frente a 2027.
--
-- Reglas:
--   · Aislamiento por cuenta: `cuenta_id` obligatorio; toda query de la app filtra por él.
--   · `tipo` NULL = «sin clasificar»: el motor NO la cuenta (nunca se clasifica en silencio).
--   · `fecha_prevista` NULL = «no se sabe»; el panel evalúa «antes del 31/12» (15/12) sin inventarla.
--   · Sin FK a `properties` (tabla de sivra): la coherencia del id la vigila la app (`prop_*`).
--   · Convención de la BD compartida (como `cierres_mes`, `subastas_descartes`): RLS activada sin políticas
--     (deniega anon/authenticated), REVOKE explícito y GRANT al rol de plataforma.
--
-- Idempotente. NO aplicado a la BD real desde la sesión que lo escribió: lo aplica la sesión principal
-- tras revisarlo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fiscal_compras_previstas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id      uuid NOT NULL REFERENCES public.cuentas(id) ON DELETE CASCADE,
  descripcion    text NOT NULL DEFAULT '' CHECK (length(descripcion) <= 200),
  importe        numeric(12,2) NOT NULL CHECK (importe > 0),
  property_id    text NOT NULL CHECK (property_id ~ '^prop_[a-z0-9_]+$'),
  -- reparacion | escaso_valor (<300€) | mobiliario | mejora  (consumible: reservado al motor). NULL = sin clasificar.
  tipo           text CHECK (tipo IS NULL OR tipo IN ('reparacion', 'consumible', 'escaso_valor', 'mobiliario', 'mejora')),
  fecha_prevista date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_compras_previstas_cuenta_idx ON public.fiscal_compras_previstas (cuenta_id);

COMMENT ON TABLE public.fiscal_compras_previstas IS
  'Compras previstas para el simulador fiscal (ahorro de cuota antes del 31/12 vs 2027). tipo NULL = sin clasificar (no cuenta). Ver lib/fiscal-compras.ts.';

ALTER TABLE public.fiscal_compras_previstas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_compras_previstas FROM anon, authenticated;
GRANT ALL ON public.fiscal_compras_previstas TO prisma_plataforma;

COMMIT;

-- Verificación tras aplicar:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.fiscal_compras_previstas'::regclass;
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fiscal_compras_previstas'::regclass;   -- true
