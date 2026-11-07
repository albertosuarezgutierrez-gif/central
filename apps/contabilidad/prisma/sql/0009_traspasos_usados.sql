-- Traspaso desde «Mi empresa» (empresa.grupoasegura.es): jti CONSUMIDOS (un solo uso). Spec 2026-11-07-mi-empresa-herramientas §5.
-- ⛔ NO APLICADA. Aplicar como postgres. Idempotente.
-- El token no autoriza nada: tras consumir el jti, la ruta exige el `usuario_empresas` de contabilidad para esa empresa.
BEGIN;
CREATE TABLE IF NOT EXISTS contabilidad.traspasos_usados (
  jti      uuid PRIMARY KEY,
  exp      timestamptz NOT NULL,
  usado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE contabilidad.traspasos_usados ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.traspasos_usados FORCE ROW LEVEL SECURITY;
REVOKE ALL ON contabilidad.traspasos_usados FROM PUBLIC;
REVOKE ALL ON contabilidad.traspasos_usados FROM prisma_contabilidad;

-- true SOLO la primera vez (PK). Repetido o caducado → false (la ruta responde 401).
CREATE OR REPLACE FUNCTION contabilidad.consumir_traspaso(p_jti uuid, p_exp timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
BEGIN
  IF p_exp <= now() THEN RETURN false; END IF;
  INSERT INTO contabilidad.traspasos_usados (jti, exp) VALUES (p_jti, p_exp) ON CONFLICT (jti) DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION contabilidad.consumir_traspaso(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contabilidad.consumir_traspaso(uuid, timestamptz) TO prisma_contabilidad;
COMMIT;
