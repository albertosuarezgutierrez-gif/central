CREATE TABLE IF NOT EXISTS rrhh.contratos_laborales (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id        UUID NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  salario_base       NUMERIC(10,2) NOT NULL CHECK (salario_base >= 0),
  grupo_cotizacion   SMALLINT NOT NULL CHECK (grupo_cotizacion BETWEEN 1 AND 11),
  tipo_contrato      TEXT NOT NULL CHECK (tipo_contrato IN ('indefinido','temporal','parcial')),
  jornada_pct        NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (jornada_pct > 0 AND jornada_pct <= 100),
  irpf_retencion_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (irpf_retencion_pct >= 0),
  categoria_convenio TEXT,
  conceptos_fijos    JSONB NOT NULL DEFAULT '[]',
  vigente_desde      DATE NOT NULL,
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  creada_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contratos_empresa_idx ON rrhh.contratos_laborales(empresa_id);
CREATE INDEX IF NOT EXISTS contratos_empleado_idx ON rrhh.contratos_laborales(empleado_id);
