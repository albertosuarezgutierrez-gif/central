-- ============================================================
-- ia.rest · Métodos de pago configurables por restaurante
-- Crea la tabla metodos_pago (si no existe) y siembra los
-- 6 métodos estándar en todos los restaurantes activos.
-- ============================================================

-- ── 1. Tabla ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS metodos_pago (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id uuid REFERENCES restaurantes(id) ON DELETE CASCADE NOT NULL,
  nombre         text NOT NULL,
  tipo           text NOT NULL
                 CHECK (tipo IN ('efectivo','tarjeta','bizum','invitacion','cuenta_corriente','stripe')),
  icono          text NOT NULL DEFAULT '💳',
  color          text NOT NULL DEFAULT '#2B6A6E',
  activo         boolean NOT NULL DEFAULT true,
  orden          integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, tipo)
);

COMMENT ON TABLE  metodos_pago IS 'Métodos de pago por restaurante. El owner activa/desactiva cada uno.';
COMMENT ON COLUMN metodos_pago.tipo IS 'efectivo|tarjeta|bizum|invitacion|cuenta_corriente|stripe';
COMMENT ON COLUMN metodos_pago.activo IS 'Visible en CobrarSheet cuando true';

-- ── 2. RLS ───────────────────────────────────────────────────

ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;

-- Solo service_role gestiona la tabla desde API routes
CREATE POLICY "service_role_all_metodos_pago"
  ON metodos_pago FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lectura anon (necesaria para /api/metodos-pago sin auth completa)
CREATE POLICY "anon_select_metodos_pago_activos"
  ON metodos_pago FOR SELECT TO anon USING (activo = true);

-- ── 3. Seed: 6 métodos por restaurante ──────────────────────
-- ON CONFLICT (restaurante_id, tipo) DO NOTHING → idempotente

INSERT INTO metodos_pago (restaurante_id, nombre, tipo, icono, color, activo, orden)
SELECT
  r.id,
  m.nombre,
  m.tipo,
  m.icono,
  m.color,
  m.activo,
  m.orden
FROM restaurantes r
CROSS JOIN (VALUES
  ('Efectivo',        'efectivo',         '💵', '#3F7D44', true,  0),
  ('Tarjeta',         'tarjeta',          '💳', '#2B6A6E', true,  1),
  ('Bizum',           'bizum',            '📱', '#1A3A5C', true,  2),
  ('Invitación',      'invitacion',       '🎁', '#9A3B1E', true,  3),
  ('Cuenta corriente','cuenta_corriente', '🏢', '#4A4038', true,  4),
  ('Tarjeta (Stripe)','stripe',           '💳', '#635BFF', false, 5)
) AS m(nombre, tipo, icono, color, activo, orden)
ON CONFLICT (restaurante_id, tipo) DO NOTHING;
