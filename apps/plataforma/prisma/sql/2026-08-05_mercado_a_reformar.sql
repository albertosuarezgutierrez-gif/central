-- El PROPIO anuncio declara que hay obra («a reformar»). Lo trae la API
-- oficial de Idealista (status='renew'); las alertas de correo no lo dicen.
-- Tres estados: true / false / NULL («no se sabe») — no colapsar NULL a false.
ALTER TABLE mercado_comparables ADD COLUMN IF NOT EXISTS a_reformar boolean;
