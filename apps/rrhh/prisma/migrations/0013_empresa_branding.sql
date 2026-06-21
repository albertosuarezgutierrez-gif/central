-- Marca blanca por empresa (white-label): color corporativo + logo.
-- El gestor los define en "Mi cuenta"; el Portal del Empleado se tiñe con ellos.
ALTER TABLE rrhh.empresas
  ADD COLUMN IF NOT EXISTS color_primario text,   -- hex #rrggbb (null = marca de la casa)
  ADD COLUMN IF NOT EXISTS logo_path text;        -- path en el bucket privado rrhh-documentos (branding/<empresa>/...)
