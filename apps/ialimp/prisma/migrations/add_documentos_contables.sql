-- Migration: add_documentos_contables
-- Tabla principal de documentos escaneados
CREATE TABLE IF NOT EXISTS documentos_contables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  cliente_id      UUID NOT NULL,
  propiedad_id    UUID REFERENCES propiedades(id) ON DELETE SET NULL,

  -- Tipo detectado por IA
  tipo_doc        TEXT NOT NULL DEFAULT 'otro',     -- factura | albaran | ticket | otro
  proveedor       TEXT,
  fecha_doc       DATE,
  numero_doc      TEXT,

  -- Importes
  base_imponible  NUMERIC(10,2),
  porcentaje_iva  NUMERIC(5,2),
  cuota_iva       NUMERIC(10,2),
  total           NUMERIC(10,2),

  -- Contabilidad PGC
  cuenta_gasto    TEXT,                -- ej: 623000
  categoria       TEXT DEFAULT 'otros',

  descripcion     TEXT,
  notas           TEXT,

  -- Apunte JSON completo
  apunte_json     JSONB,

  -- Líneas JSON (para stock)
  lineas_json     JSONB,

  -- Estado
  procesado_stock BOOLEAN DEFAULT false,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_cont_cliente    ON documentos_contables(cliente_id);
CREATE INDEX IF NOT EXISTS idx_doc_cont_empresa    ON documentos_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_doc_cont_fecha      ON documentos_contables(fecha_doc DESC);
