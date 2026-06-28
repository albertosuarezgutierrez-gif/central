CREATE TABLE IF NOT EXISTS rrhh.nominas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id   UUID NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  periodo       TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'borrador'
                  CHECK (estado IN ('borrador','confirmada','enviada')),
  datos_calculo JSONB NOT NULL DEFAULT '{}',
  pdf_path      TEXT,
  generada_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmada_at TIMESTAMPTZ,
  enviada_at    TIMESTAMPTZ,
  creada_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, empleado_id, periodo)
);
CREATE INDEX IF NOT EXISTS nominas_empresa_periodo_idx ON rrhh.nominas(empresa_id, periodo);

CREATE TABLE IF NOT EXISTS rrhh.incidencias_mes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  nomina_id  UUID NOT NULL REFERENCES rrhh.nominas(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL
               CHECK (tipo IN ('horas_extra','ausencia_injustificada','plus_puntual','descuento','baja_it','vacaciones')),
  concepto   TEXT NOT NULL,
  importe    NUMERIC(10,2),
  horas      NUMERIC(6,2),
  dias       INTEGER,
  creada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS incidencias_nomina_idx ON rrhh.incidencias_mes(nomina_id);
