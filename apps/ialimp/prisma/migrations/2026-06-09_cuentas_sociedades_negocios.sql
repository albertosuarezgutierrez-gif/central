-- Jerarquía de cuenta: Cuenta → Sociedad → Negocio
-- Usada por apps/plataforma (cuadro de mando consolidado).
-- La BD es compartida (sivra + ialimp + plataforma).

CREATE TABLE IF NOT EXISTS cuentas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT,
  session_jti   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cuentas_email ON cuentas (lower(email));

CREATE TABLE IF NOT EXISTS sociedades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id  UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  cif        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sociedades_cuenta ON sociedades(cuenta_id);

-- sector: texto libre, enchufable (hosteleria, limpieza, inmobiliario, transporte…)
-- ref_ext: ID de la unidad en la app vertical (empresa_id, local_id, etc.)
-- app: vertical gestora ('ia-rest', 'ialimp', 'sivra', …)
CREATE TABLE IF NOT EXISTS negocios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sociedad_id UUID NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  sector      TEXT NOT NULL,
  ref_ext     TEXT,
  app         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_negocios_sociedad ON negocios(sociedad_id);
