-- ============================================================
-- ia.rest cobro — Módulo de pagos integrado
-- cobro_config: configuración por restaurante
-- resumen_cobros_mensual: agregado financiero para panel Alberto
-- ============================================================

-- ── 1. cobro_config ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cobro_config (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id        uuid REFERENCES restaurantes(id) ON DELETE CASCADE UNIQUE NOT NULL,
  -- Modo de cobro QR
  modo_cobro            text DEFAULT 'cuenta_abierta'
                        CHECK (modo_cobro IN ('por_ronda', 'pre_auth', 'cuenta_abierta')),
  -- Minutos sin actividad antes de alertar al camarero
  timer_inactividad_min integer DEFAULT 45 CHECK (timer_inactividad_min IN (30, 45, 60, 90)),
  -- ia.rest cobro activo (Stripe Connect habilitado para este restaurante)
  ia_cobro_activo       boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

COMMENT ON TABLE cobro_config IS 'Configuración del módulo ia.rest cobro por restaurante';
COMMENT ON COLUMN cobro_config.modo_cobro IS 'por_ronda=paga cada pedido al momento; pre_auth=captura tarjeta al abrir sesión; cuenta_abierta=sin pre-auth, paga al final';
COMMENT ON COLUMN cobro_config.timer_inactividad_min IS 'Minutos de inactividad QR antes de push al camarero';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_cobro_config_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_cobro_config_updated_at
  BEFORE UPDATE ON cobro_config
  FOR EACH ROW EXECUTE FUNCTION update_cobro_config_updated_at();

-- ── 2. resumen_cobros_mensual ────────────────────────────────

CREATE TABLE IF NOT EXISTS resumen_cobros_mensual (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id        uuid REFERENCES restaurantes(id) ON DELETE CASCADE NOT NULL,
  mes                   date NOT NULL, -- primer día del mes: 2026-05-01
  volumen_eur           numeric(12,2) DEFAULT 0 CHECK (volumen_eur >= 0),
  comision_eur          numeric(10,2) DEFAULT 0 CHECK (comision_eur >= 0),
  num_transacciones     integer DEFAULT 0 CHECK (num_transacciones >= 0),
  descuento_cuota_eur   numeric(8,2) DEFAULT 0 CHECK (descuento_cuota_eur >= 0),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, mes)
);

COMMENT ON TABLE resumen_cobros_mensual IS 'Agregado mensual de cobros QR por restaurante — panel financiero Alberto';
COMMENT ON COLUMN resumen_cobros_mensual.mes IS 'Primer día del mes (ej: 2026-05-01)';
COMMENT ON COLUMN resumen_cobros_mensual.comision_eur IS '0.5% de volumen_eur — ingreso de ia.rest';
COMMENT ON COLUMN resumen_cobros_mensual.descuento_cuota_eur IS 'Descuento aplicado en cuota mensual según tramos';

CREATE TRIGGER trg_resumen_cobros_updated_at
  BEFORE UPDATE ON resumen_cobros_mensual
  FOR EACH ROW EXECUTE FUNCTION update_cobro_config_updated_at();

-- ── 3. Función: calcular descuento según volumen ─────────────

CREATE OR REPLACE FUNCTION calcular_descuento_cobro(p_volumen_eur numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_volumen_eur >= 20000 THEN 59   -- cuota base completa gratis
    WHEN p_volumen_eur >= 10000 THEN 50
    WHEN p_volumen_eur >=  5000 THEN 30
    WHEN p_volumen_eur >=  2000 THEN 15
    ELSE 0
  END::numeric;
$$;

COMMENT ON FUNCTION calcular_descuento_cobro IS 'Tramos descuento: 2k=15€, 5k=30€, 10k=50€, 20k+=59€ (cuota gratis)';

-- ── 4. Función: registrar pago QR en resumen ─────────────────

CREATE OR REPLACE FUNCTION registrar_pago_cobro(
  p_restaurante_id uuid,
  p_importe_eur    numeric,  -- importe total del pago
  p_comision_eur   numeric   -- comisión capturada por ia.rest (0.5%)
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_mes date := date_trunc('month', now())::date;
  v_nuevo_volumen numeric;
BEGIN
  -- Upsert: crear o acumular el resumen del mes actual
  INSERT INTO resumen_cobros_mensual (restaurante_id, mes, volumen_eur, comision_eur, num_transacciones)
  VALUES (p_restaurante_id, v_mes, p_importe_eur, p_comision_eur, 1)
  ON CONFLICT (restaurante_id, mes) DO UPDATE SET
    volumen_eur       = resumen_cobros_mensual.volumen_eur + EXCLUDED.volumen_eur,
    comision_eur      = resumen_cobros_mensual.comision_eur + EXCLUDED.comision_eur,
    num_transacciones = resumen_cobros_mensual.num_transacciones + 1,
    updated_at        = now()
  RETURNING volumen_eur INTO v_nuevo_volumen;

  -- Recalcular descuento con el nuevo volumen acumulado
  UPDATE resumen_cobros_mensual
  SET descuento_cuota_eur = calcular_descuento_cobro(v_nuevo_volumen)
  WHERE restaurante_id = p_restaurante_id AND mes = v_mes;
END;
$$;

-- ── 5. Vista: panel financiero super admin ───────────────────

CREATE OR REPLACE VIEW v_cobro_resumen_super AS
SELECT
  r.id              AS restaurante_id,
  r.nombre          AS restaurante_nombre,
  r.codigo_acceso,
  r.ciudad,
  -- Mes actual
  COALESCE(mes_actual.volumen_eur, 0)         AS volumen_mes_actual,
  COALESCE(mes_actual.comision_eur, 0)        AS comision_mes_actual,
  COALESCE(mes_actual.num_transacciones, 0)   AS txn_mes_actual,
  COALESCE(mes_actual.descuento_cuota_eur, 0) AS descuento_mes_actual,
  -- Mes anterior
  COALESCE(mes_ant.volumen_eur, 0)            AS volumen_mes_anterior,
  COALESCE(mes_ant.comision_eur, 0)           AS comision_mes_anterior,
  -- Acumulado año en curso
  COALESCE(anio.volumen_total, 0)             AS volumen_anio,
  COALESCE(anio.comision_total, 0)            AS comision_anio,
  -- Config cobro
  COALESCE(cc.ia_cobro_activo, false)         AS ia_cobro_activo,
  COALESCE(cc.modo_cobro, 'cuenta_abierta')   AS modo_cobro
FROM restaurantes r
LEFT JOIN cobro_config cc ON cc.restaurante_id = r.id
LEFT JOIN resumen_cobros_mensual mes_actual
  ON mes_actual.restaurante_id = r.id
  AND mes_actual.mes = date_trunc('month', now())::date
LEFT JOIN resumen_cobros_mensual mes_ant
  ON mes_ant.restaurante_id = r.id
  AND mes_ant.mes = date_trunc('month', now() - interval '1 month')::date
LEFT JOIN (
  SELECT
    restaurante_id,
    SUM(volumen_eur)   AS volumen_total,
    SUM(comision_eur)  AS comision_total
  FROM resumen_cobros_mensual
  WHERE mes >= date_trunc('year', now())::date
  GROUP BY restaurante_id
) anio ON anio.restaurante_id = r.id
WHERE r.activo = true
ORDER BY COALESCE(mes_actual.volumen_eur, 0) DESC;

-- ── 6. RLS ───────────────────────────────────────────────────

ALTER TABLE cobro_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumen_cobros_mensual ENABLE ROW LEVEL SECURITY;

-- cobro_config: solo service_role (gestión desde EFs y API routes con service role)
CREATE POLICY "service_role_all_cobro_config"
  ON cobro_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- resumen_cobros_mensual: solo service_role
CREATE POLICY "service_role_all_resumen_cobros"
  ON resumen_cobros_mensual FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 7. Inicializar cobro_config para restaurantes existentes ─

INSERT INTO cobro_config (restaurante_id)
SELECT id FROM restaurantes
ON CONFLICT (restaurante_id) DO NOTHING;
