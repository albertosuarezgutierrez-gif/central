-- Ficha editable del empleado: datos contacto, personales y laborales
ALTER TABLE rrhh.empleados
  ADD COLUMN IF NOT EXISTS domicilio        TEXT,
  ADD COLUMN IF NOT EXISTS localidad        TEXT,
  ADD COLUMN IF NOT EXISTS provincia        TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS estado_civil     TEXT,
  ADD COLUMN IF NOT EXISTS tipo_contrato    TEXT,
  ADD COLUMN IF NOT EXISTS centro_trabajo   TEXT,
  ADD COLUMN IF NOT EXISTS cuenta_cotizacion TEXT,
  ADD COLUMN IF NOT EXISTS categoria        TEXT,
  ADD COLUMN IF NOT EXISTS grupo_cotizacion TEXT,
  ADD COLUMN IF NOT EXISTS tipo_jornada     TEXT;
