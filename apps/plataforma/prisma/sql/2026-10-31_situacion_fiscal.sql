-- «Mi situación fiscal» (finanzas/fiscal): meses de cuota de autónomos exonerados de Pilar (prestación por nacimiento).
-- ADITIVO e idempotente. NULL = sin dato (nunca 0). NO aplicado en producción: lo aplica Alberto.
-- La app lo lee con SELECT * y lo escribe por PATCH /api/finanzas/situacion-fiscal; sin la columna, el dato sale «sin dato».
ALTER TABLE fiscal_perfil
  ADD COLUMN IF NOT EXISTS conyuge_meses_exonerados SMALLINT
  CHECK (conyuge_meses_exonerados IS NULL OR conyuge_meses_exonerados BETWEEN 0 AND 12);

COMMENT ON COLUMN fiscal_perfil.conyuge_meses_exonerados IS
  'Meses del ejercicio en que Pilar no pagó cuota de autónomos (exoneración por nacimiento). NULL = sin dato.';
