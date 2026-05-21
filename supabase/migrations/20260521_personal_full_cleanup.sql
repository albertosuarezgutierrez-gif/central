-- ══════════════════════════════════════════════════════════════════════════════
-- T2 COMPLETO: camareros → personal (21/05/2026)
-- ──────────────────────────────────────────────────────────────────────────────
-- Esta migración es ACUMULATIVA — consolida todo lo de 20260520 + actualiza
-- RPCs que hacen JOIN/SELECT FROM camareros directamente en PL/pgSQL.
--
-- ORDEN DE EJECUCIÓN (idempotente, IF EXISTS en todo):
--   1. Rename tabla camareros → personal (si no se ha hecho ya)
--   2. Recrear VIEW camareros para retrocompat código antiguo
--   3. Actualizar RPC buscar_receptor_marchar (JOIN camareros → JOIN personal)
--   4. Actualizar funciones fichar_entrada / fichar_salida
--   5. Actualizar RLS policy de running_zonas
--   6. Smoke tests
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Guard: si personal ya existe, saltamos el rename ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'personal'
  ) THEN
    -- 1a. Drop + re-ADD constraint incluyendo gestor
    ALTER TABLE camareros
      DROP CONSTRAINT IF EXISTS camareros_rol_check;

    ALTER TABLE camareros
      ADD CONSTRAINT camareros_rol_check
      CHECK (rol IN ('super_admin','owner','jefe_sala','camarero','cocina','running','gestor'));

    -- 1b. Rename tabla
    ALTER TABLE camareros RENAME TO personal;

    -- 1c. Renombrar constraint
    ALTER TABLE personal RENAME CONSTRAINT camareros_rol_check TO personal_rol_check;

    -- 1d. Renombrar índices (IF EXISTS implícito en DO block — usamos EXCEPTION)
    BEGIN
      ALTER INDEX camareros_pkey RENAME TO personal_pkey;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER INDEX idx_camareros_modulos RENAME TO idx_personal_modulos;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER INDEX camareros_restaurante_id_idx RENAME TO personal_restaurante_id_idx;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER INDEX camareros_pin_restaurante_id_key RENAME TO personal_pin_restaurante_id_key;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;

    RAISE NOTICE 'Tabla camareros renombrada a personal';
  ELSE
    RAISE NOTICE 'Tabla personal ya existe — saltando rename';
  END IF;
END;
$$;

-- ── 2. Asegurar constraint gestor en personal (por si ya existía la tabla) ────
DO $$
BEGIN
  -- Drop viejo si existe sin gestor
  ALTER TABLE personal DROP CONSTRAINT IF EXISTS personal_rol_check;
  ALTER TABLE personal
    ADD CONSTRAINT personal_rol_check
    CHECK (rol IN ('super_admin','owner','jefe_sala','camarero','cocina','running','gestor'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Constraint personal_rol_check ya actualizado';
END;
$$;

-- ── 3. VIEW camareros (retrocompat total — queries .from('camareros') siguen ok)
DROP VIEW IF EXISTS camareros CASCADE;
CREATE OR REPLACE VIEW camareros WITH (security_invoker = true) AS
  SELECT * FROM personal;

GRANT SELECT ON camareros TO anon, authenticated, service_role;

-- ── 4. RPC buscar_receptor_marchar — actualizar JOINs a personal ──────────────
CREATE OR REPLACE FUNCTION buscar_receptor_marchar(p_comanda_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_zona_id        uuid;
  v_restaurante_id uuid;
  v_camarero_id    uuid;
  v_running_id     uuid;
  v_running_nombre text;
  v_camarero_nombre text;
  v_zona_nombre    text;
  v_notif_config   jsonb;
BEGIN
  -- Datos de la comanda + mesa + zona
  SELECT m.zona_id, c.restaurante_id, c.camarero_id, p.nombre
  INTO   v_zona_id, v_restaurante_id, v_camarero_id, v_camarero_nombre
  FROM   comandas c
  JOIN   mesas m   ON m.id = c.mesa_id
  JOIN   personal p ON p.id = c.camarero_id   -- ← antes: JOIN camareros cam
  WHERE  c.id = p_comanda_id;

  IF v_zona_id IS NOT NULL THEN
    SELECT z.nombre INTO v_zona_nombre FROM zonas z WHERE z.id = v_zona_id;

    -- Running activo que cubre esta zona
    SELECT rz.camarero_id, p2.nombre
    INTO   v_running_id, v_running_nombre
    FROM   running_zonas rz
    JOIN   personal p2 ON p2.id = rz.camarero_id  -- ← antes: JOIN camareros cam2
    WHERE  rz.zona_id        = v_zona_id
      AND  rz.restaurante_id = v_restaurante_id
      AND  rz.activo         = true
      AND  p2.activo         = true
    ORDER BY rz.created_at
    LIMIT 1;
  END IF;

  -- Config de notificaciones del restaurante
  SELECT notif_config INTO v_notif_config
  FROM   restaurantes
  WHERE  id = v_restaurante_id;

  RETURN jsonb_build_object(
    'hay_running',      (v_running_id IS NOT NULL),
    'running_id',       v_running_id,
    'running_nombre',   v_running_nombre,
    'camarero_id',      v_camarero_id,
    'camarero_nombre',  v_camarero_nombre,
    'zona_id',          v_zona_id,
    'zona_nombre',      v_zona_nombre,
    'restaurante_id',   v_restaurante_id,
    'notif_config',     COALESCE(v_notif_config, '{"marchar":{"running_canal":"push_audio_completo","camarero_con_running":"solo_visual","camarero_sin_running":"push_audio_completo","canal_audio":"tts"}}'::jsonb)
  );
END;
$$;

-- ── 5. RPC fichar_entrada — SELECT FROM personal ──────────────────────────────
CREATE OR REPLACE FUNCTION fichar_entrada(
  p_camarero_id  UUID,
  p_restaurante_id UUID,
  p_ip           TEXT DEFAULT NULL
)
RETURNS TABLE(turno_id UUID, ya_fichado BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing UUID;
  v_new_id   UUID;
BEGIN
  -- Comprobar si ya tiene turno activo hoy
  SELECT id INTO v_existing
  FROM turnos
  WHERE camarero_id = p_camarero_id
    AND restaurante_id = p_restaurante_id
    AND estado = 'activo'
    AND fecha = CURRENT_DATE
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, TRUE;
    RETURN;
  END IF;

  -- Crear nuevo fichaje de entrada
  INSERT INTO turnos (
    restaurante_id, camarero_id, nombre,
    fecha, estado, entrada_at, ip_entrada
  ) VALUES (
    p_restaurante_id, p_camarero_id,
    (SELECT nombre FROM personal WHERE id = p_camarero_id),  -- ← antes: FROM camareros
    CURRENT_DATE, 'activo', now(), p_ip
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, FALSE;
END;
$$;

-- ── 6. RPC fichar_salida — sin referencia a tabla, no necesita cambio ─────────
-- (ya no hace SELECT FROM camareros, solo FROM turnos — se mantiene igual)

-- ── 7. RLS policy running_zonas — referencia a camareros en USING ─────────────
-- Política original referenciaba camareros. Con la VIEW sigue funcionando,
-- pero la actualizamos explícitamente a personal para claridad.
DROP POLICY IF EXISTS "personal_running_zonas" ON running_zonas;
DROP POLICY IF EXISTS "camareros_running_zonas" ON running_zonas;

CREATE POLICY "personal_running_zonas" ON running_zonas
  FOR SELECT USING (
    restaurante_id IN (
      SELECT restaurante_id FROM personal WHERE id = auth.uid()
    )
  );

-- ── 8. Índice adicional en personal si no existe ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_personal_rol_restaurante
  ON personal(restaurante_id, rol)
  WHERE activo = true;

-- ── 9. Comentarios de documentación ──────────────────────────────────────────
COMMENT ON TABLE personal IS
  'Personal del restaurante. Renombrada desde camareros el 21/05/2026. '
  'Rol gestor = solo portal backoffice /portal. '
  'VIEW camareros activa para retrocompat temporal del código.';

COMMENT ON VIEW camareros IS
  'VIEW de retrocompatibilidad — apunta a tabla personal. '
  'Eliminar cuando todo el código use personal directamente.';

-- ── 10. Smoke tests ───────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Test 1: tabla personal existe
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'personal'
  ), 'FAIL: tabla personal no existe';

  -- Test 2: VIEW camareros existe
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'camareros'
  ), 'FAIL: VIEW camareros no existe';

  -- Test 3: RPC buscar_receptor_marchar existe
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'buscar_receptor_marchar'
  ), 'FAIL: RPC buscar_receptor_marchar no existe';

  -- Test 4: RPC fichar_entrada existe
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fichar_entrada'
  ), 'FAIL: RPC fichar_entrada no existe';

  -- Test 5: constraint incluye gestor
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'personal_rol_check'
      AND consrc LIKE '%gestor%'
  ), 'FAIL: personal_rol_check no incluye gestor';

  RAISE NOTICE '✅ T2 personal_full_cleanup: todos los smoke tests OK';
END;
$$;
