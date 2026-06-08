-- Migration: add_ingresos_manuales
-- Ingresos manuales a nivel EMPRESA (otros ingresos no facturados: comisiones,
-- extras, etc.). Se gestionan desde la pestaña «💶 Ingresos» de /admin/contabilidad.
-- Empresa-scoped (multi-tenant); NO se replica el legacy cliente_id NOT NULL.
CREATE TABLE IF NOT EXISTS ingresos_manuales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  propiedad_id    UUID REFERENCES propiedades(id) ON DELETE SET NULL,

  concepto        TEXT NOT NULL,
  categoria       TEXT DEFAULT 'otros',
  fecha           DATE NOT NULL,

  base_imponible  NUMERIC(10,2) NOT NULL,
  porcentaje_iva  NUMERIC(5,2)  DEFAULT 21,
  cuota_iva       NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL,

  cobrado         BOOLEAN DEFAULT false,
  fecha_cobro     DATE,
  notas           TEXT,

  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ing_man_empresa ON ingresos_manuales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ing_man_fecha   ON ingresos_manuales(fecha DESC);

-- Extiende v_contab_ingresos para que los ingresos manuales fluyan a
-- v_contab_pyg (Resultado), v_contab_iva (IVA) y v_contab_tesoreria (Tesorería).
-- IMPORTANTE: la rama nueva debe emitir EXACTAMENTE las mismas 15 columnas
-- (nombre/tipo/orden) que la rama de facturas_clientes para que CREATE OR REPLACE
-- no rompa las vistas dependientes. NUNCA usar DROP VIEW (haría CASCADE).
CREATE OR REPLACE VIEW v_contab_ingresos AS
SELECT
  fc.empresa_id,
  fc.id AS factura_id,
  fc.numero_factura,
  fc.cliente_id,
  fc.fecha_emision AS fecha,
  (EXTRACT(year    FROM fc.fecha_emision))::integer AS anio,
  (EXTRACT(month   FROM fc.fecha_emision))::integer AS mes,
  (EXTRACT(quarter FROM fc.fecha_emision))::integer AS trimestre,
  fc.base_imponible,
  fc.iva_importe,
  fc.total,
  fc.estado,
  fc.fecha_vencimiento,
  fc.fecha_cobro,
  (fc.fecha_cobro IS NOT NULL) AS cobrado
FROM facturas_clientes fc
UNION ALL
SELECT
  im.empresa_id,
  im.id AS factura_id,
  NULL::text AS numero_factura,
  NULL::uuid AS cliente_id,
  im.fecha,
  (EXTRACT(year    FROM im.fecha))::integer AS anio,
  (EXTRACT(month   FROM im.fecha))::integer AS mes,
  (EXTRACT(quarter FROM im.fecha))::integer AS trimestre,
  im.base_imponible,
  im.cuota_iva AS iva_importe,
  im.total,
  'manual'::text AS estado,
  NULL::date AS fecha_vencimiento,
  im.fecha_cobro,
  im.cobrado
FROM ingresos_manuales im
WHERE im.activo IS TRUE;
