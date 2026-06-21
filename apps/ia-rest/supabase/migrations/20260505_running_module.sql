-- ============================================================
-- ia.rest · Módulo #15 · Running + Notificaciones configurables
-- Mayo 2026
-- ============================================================

-- ── 1. Añadir rol 'running' ───────────────────────────────────
ALTER TABLE camareros DROP CONSTRAINT IF EXISTS camareros_rol_check;
ALTER TABLE camareros ADD CONSTRAINT camareros_rol_check
  CHECK (rol IN ('super_admin','owner','jefe_sala','camarero','cocina','running'));

-- ── 2. Tabla running_zonas ────────────────────────────────────
-- Mapea qué zonas cubre cada running en su turno activo
CREATE TABLE IF NOT EXISTS running_zonas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  camarero_id    uuid        NOT NULL REFERENCES camareros(id)    ON DELETE CASCADE,
  zona_id        uuid        NOT NULL REFERENCES zonas(id)        ON DELETE CASCADE,
  turno_id       uuid                 REFERENCES turnos(id)       ON DELETE SET NULL,
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  activo         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (camarero_id, zona_id)
);

CREATE INDEX IF NOT EXISTS idx_running_zonas_camarero ON running_zonas(camarero_id);
CREATE INDEX IF NOT EXISTS idx_running_zonas_zona     ON running_zonas(zona_id);
CREATE INDEX IF NOT EXISTS idx_running_zonas_activo   ON running_zonas(restaurante_id, activo);

ALTER TABLE running_zonas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_running_zonas" ON running_zonas
  TO service_role USING (true) WITH CHECK (true);

-- Los camareros/owners pueden leer las zonas de su restaurante
CREATE POLICY "tenant_read_running_zonas" ON running_zonas
  FOR SELECT
  USING (
    restaurante_id IN (
      SELECT restaurante_id FROM camareros WHERE id = auth.uid()
      UNION
      SELECT id FROM restaurantes WHERE owner_id = auth.uid()
    )
  );

-- ── 3. Tabla marchar_log ──────────────────────────────────────
-- Registro de cada MARCHAR para realtime en /running
CREATE TABLE IF NOT EXISTS marchar_log (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id     uuid        NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  mesa_codigo    text        NOT NULL,
  zona_id        uuid                 REFERENCES zonas(id) ON DELETE SET NULL,
  zona_nombre    text,
  receptor_id    uuid        NOT NULL,   -- running_id o camarero_id
  camarero_id    uuid,                   -- camarero original (para notif secundaria)
  items_resumen  text        NOT NULL,   -- "2× Entrecot · 1× Patatas"
  items_detalle  jsonb       NOT NULL DEFAULT '[]',
  recogido       boolean     NOT NULL DEFAULT false,
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marchar_log_receptor ON marchar_log(receptor_id, recogido, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marchar_log_rest     ON marchar_log(restaurante_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marchar_log_comanda  ON marchar_log(comanda_id);

ALTER TABLE marchar_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_marchar_log" ON marchar_log
  TO service_role USING (true) WITH CHECK (true);

-- ── 4. notif_config en restaurantes ──────────────────────────
-- Configuración de notificaciones por MARCHAR (completamente configurable por owner)
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS notif_config jsonb NOT NULL DEFAULT '{
    "marchar": {
      "running_canal": "push_audio_completo",
      "camarero_con_running": "solo_visual",
      "camarero_sin_running": "push_audio_completo",
      "canal_audio": "tts"
    }
  }'::jsonb;

-- ── 5. RPC buscar_receptor_marchar ───────────────────────────
-- Dada una comanda, devuelve receptor (running o camarero) + config de notif
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
  SELECT m.zona_id, c.restaurante_id, c.camarero_id, cam.nombre
  INTO   v_zona_id, v_restaurante_id, v_camarero_id, v_camarero_nombre
  FROM   comandas c
  JOIN   mesas m ON m.id = c.mesa_id
  JOIN   camareros cam ON cam.id = c.camarero_id
  WHERE  c.id = p_comanda_id;

  IF v_zona_id IS NOT NULL THEN
    SELECT z.nombre INTO v_zona_nombre FROM zonas z WHERE z.id = v_zona_id;

    -- Running activo que cubre esta zona
    SELECT rz.camarero_id, cam2.nombre
    INTO   v_running_id, v_running_nombre
    FROM   running_zonas rz
    JOIN   camareros cam2 ON cam2.id = rz.camarero_id
    WHERE  rz.zona_id        = v_zona_id
      AND  rz.restaurante_id = v_restaurante_id
      AND  rz.activo         = true
      AND  cam2.activo       = true
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

-- ── 6. Demo running ───────────────────────────────────────────
DO $$
DECLARE v_rid uuid;
BEGIN
  SELECT id INTO v_rid FROM restaurantes WHERE codigo = 'DEMO' LIMIT 1;
  IF v_rid IS NOT NULL THEN
    INSERT INTO camareros (nombre, pin, rol, activo, restaurante_id)
    SELECT 'Running', '3333', 'running', true, v_rid
    WHERE NOT EXISTS (
      SELECT 1 FROM camareros WHERE pin = '3333' AND restaurante_id = v_rid
    );
  END IF;
END $$;

-- ── 7. Test básico ────────────────────────────────────────────
DO $$
BEGIN
  -- Verificar constraint actualizado
  ASSERT (SELECT COUNT(*) FROM information_schema.check_constraints
    WHERE constraint_name = 'camareros_rol_check'
    AND check_clause LIKE '%running%') > 0,
    'ERROR: constraint camareros_rol_check no incluye running';

  -- Verificar tablas creadas
  ASSERT (SELECT to_regclass('public.running_zonas') IS NOT NULL),
    'ERROR: tabla running_zonas no existe';
  ASSERT (SELECT to_regclass('public.marchar_log') IS NOT NULL),
    'ERROR: tabla marchar_log no existe';

  -- Verificar columna notif_config
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'restaurantes' AND column_name = 'notif_config') > 0,
    'ERROR: columna notif_config no existe en restaurantes';

  -- Verificar RPC
  ASSERT (SELECT COUNT(*) FROM pg_proc WHERE proname = 'buscar_receptor_marchar') > 0,
    'ERROR: RPC buscar_receptor_marchar no existe';

  RAISE NOTICE '✅ Módulo #15 Running: todos los tests pasaron';
END $$;
