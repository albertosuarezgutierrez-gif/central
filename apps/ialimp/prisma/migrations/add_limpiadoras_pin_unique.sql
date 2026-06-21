-- Defensa en profundidad: el PIN debe ser único por empresa en `limpiadoras`
-- (el admin ya lo valida en app; esto lo blinda a nivel de BD).
-- `usuarios_empresa` ya tiene uq_ue_pin_empresa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_limpiadoras_pin_empresa
  ON limpiadoras (empresa_id, pin_hash)
  WHERE pin_hash IS NOT NULL;
