-- ══════════════════════════════════════════════════════════════
-- T2: camareros → personal + rol gestor (20/05/2026)
-- ──────────────────────────────────────────────────────────────
-- 1. Añade 'gestor' al CHECK constraint de rol
-- 2. Renombra tabla camareros → personal
-- 3. Crea VIEW camareros para retrocompatibilidad del código
-- ══════════════════════════════════════════════════════════════

-- 1. DROP + re-ADD constraint con gestor incluido
ALTER TABLE camareros
  DROP CONSTRAINT IF EXISTS camareros_rol_check;

ALTER TABLE camareros
  ADD CONSTRAINT camareros_rol_check
  CHECK (rol IN ('super_admin','owner','jefe_sala','camarero','cocina','running','gestor'));

-- 2. Renombrar tabla
ALTER TABLE camareros RENAME TO personal;

-- 3. Renombrar constraint y índices para que reflejen el nuevo nombre
ALTER TABLE personal RENAME CONSTRAINT camareros_rol_check TO personal_rol_check;
ALTER INDEX IF EXISTS camareros_pkey RENAME TO personal_pkey;
ALTER INDEX IF EXISTS idx_camareros_modulos RENAME TO idx_personal_modulos;
ALTER INDEX IF EXISTS camareros_restaurante_id_idx RENAME TO personal_restaurante_id_idx;
ALTER INDEX IF EXISTS camareros_pin_restaurante_id_key RENAME TO personal_pin_restaurante_id_key;

-- 4. VIEW de retrocompatibilidad (security_invoker = RLS de personal se aplica)
CREATE OR REPLACE VIEW camareros WITH (security_invoker = true) AS
  SELECT * FROM personal;

GRANT SELECT ON camareros TO anon, authenticated, service_role;

-- 5. Comentario en tabla
COMMENT ON TABLE personal IS
  'Personal del restaurante. Antes: camareros. Rol gestor = solo portal backoffice.';
COMMENT ON COLUMN personal.rol IS
  'Roles: camarero→/edge, jefe_sala→/jefe, cocina→/kds, running→/running, gestor→/portal, owner→/owner';
COMMENT ON COLUMN personal.modulos_gestion IS
  'Array módulos backoffice en /portal. Para gestor son obligatorios. Para otros, opcionales.';
