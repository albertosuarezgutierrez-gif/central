-- CONTABILIDAD — 0008: (a) retira `contabilidad.empresas_de_gestor()` (0006), que ningún código llama (el portal usa `empresas_de_usuario`);
-- (b) la revisión pasa a ser única por (objeto, ROL): una revisión del dueño ya no impide ni sustituye la del gestor.
-- ADITIVA e IDEMPOTENTE; NO edita 0006 (ya aplicada). Requiere 0006. Se aplica a mano como `postgres` tras OK de Alberto.
-- La app inserta con `ON CONFLICT DO NOTHING` (sin objetivo): funciona antes y después de esta migración; antes de aplicarla, una revisión
-- del dueño seguiría ocupando el hueco del gestor (comportamiento previo), después no.
BEGIN;

DROP FUNCTION IF EXISTS contabilidad.empresas_de_gestor(uuid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_revisiones_asiento_rol  ON contabilidad.revisiones (empresa_id, asiento_id, rol) WHERE asiento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_revisiones_factura_rol ON contabilidad.revisiones (empresa_id, factura_recibida_id, rol) WHERE factura_recibida_id IS NOT NULL;
DROP INDEX IF EXISTS contabilidad.uq_revisiones_asiento;
DROP INDEX IF EXISTS contabilidad.uq_revisiones_factura;

COMMIT;

-- Verificación (solo lectura): SELECT to_regprocedure('contabilidad.empresas_de_gestor(uuid)');  → NULL
--   SELECT indexname FROM pg_indexes WHERE schemaname='contabilidad' AND tablename='revisiones';  → *_rol, sin los antiguos
