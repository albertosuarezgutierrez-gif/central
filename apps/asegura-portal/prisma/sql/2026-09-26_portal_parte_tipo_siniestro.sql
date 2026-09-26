-- Tipo de siniestro que el cliente marca en el portal (26/09/2026).
--
-- Opcional: NULL = no lo ha contestado (no es «otro»). La lista es la MISMA que
-- `TIPOS_SINIESTRO` de `@central/module-seguros-portal` (la vigila su test).
-- Aditiva y nullable: no toca filas existentes.
ALTER TABLE seguros.portal_parte_siniestro
  ADD COLUMN IF NOT EXISTS tipo_siniestro text;

ALTER TABLE seguros.portal_parte_siniestro
  DROP CONSTRAINT IF EXISTS portal_parte_tipo_siniestro_check;
ALTER TABLE seguros.portal_parte_siniestro
  ADD CONSTRAINT portal_parte_tipo_siniestro_check CHECK (
    tipo_siniestro IS NULL OR tipo_siniestro IN ('colision', 'lunas', 'robo', 'averia', 'agua', 'incendio', 'cristales', 'electrico', 'danos_terceros', 'otro')
  );
