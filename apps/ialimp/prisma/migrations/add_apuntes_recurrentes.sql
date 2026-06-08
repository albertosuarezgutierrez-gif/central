-- Migration: add_apuntes_recurrentes
-- Plantillas de apuntes contables recurrentes (gasto o ingreso) a nivel empresa.
-- Un cron (app/api/admin/contabilidad/generar-recurrentes) materializa el apunte
-- real de cada periodo en documentos_contables / ingresos_manuales.
CREATE TABLE IF NOT EXISTS apuntes_recurrentes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'gasto',   -- 'gasto' | 'ingreso'
  propiedad_id    UUID REFERENCES propiedades(id) ON DELETE SET NULL,
  proveedor       TEXT,
  concepto        TEXT NOT NULL,
  categoria       TEXT DEFAULT 'otros',
  base_imponible  NUMERIC(10,2) NOT NULL,
  porcentaje_iva  NUMERIC(5,2)  DEFAULT 21,
  periodicidad    TEXT NOT NULL DEFAULT 'mensual', -- 'mensual' | 'trimestral' | 'anual'
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE,
  activo          BOOLEAN DEFAULT true,
  ultima_generada DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apunte_rec_empresa ON apuntes_recurrentes(empresa_id);

-- Vincula cada apunte materializado con su plantilla recurrente (dedupe en el cron)
ALTER TABLE documentos_contables ADD COLUMN IF NOT EXISTS recurrente_origen UUID;
ALTER TABLE ingresos_manuales    ADD COLUMN IF NOT EXISTS recurrente_origen UUID;
CREATE INDEX IF NOT EXISTS idx_doc_cont_rec_origen ON documentos_contables(recurrente_origen);
CREATE INDEX IF NOT EXISTS idx_ing_man_rec_origen  ON ingresos_manuales(recurrente_origen);
