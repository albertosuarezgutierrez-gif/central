-- Fix chat mensajes_turno — Mayo 2026
-- 1. RPC marcar_mensaje_leido (faltaba → PATCH no escribía en BD)
-- 2. Policy anon SELECT (faltaba → Realtime bloqueado, solo polling 10s)

-- ── 1. RPC marcar_mensaje_leido ───────────────────────────────────────────────
-- Añade p_camarero_id al array leido_por, idempotente (no duplica)
CREATE OR REPLACE FUNCTION marcar_mensaje_leido(
  p_mensaje_id     UUID,
  p_camarero_id    UUID,
  p_restaurante_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE mensajes_turno
  SET leido_por = array_append(COALESCE(leido_por, '{}'), p_camarero_id)
  WHERE id              = p_mensaje_id
    AND restaurante_id  = p_restaurante_id
    AND NOT (COALESCE(leido_por, '{}') @> ARRAY[p_camarero_id]);
END;
$$;

GRANT EXECUTE ON FUNCTION marcar_mensaje_leido(UUID, UUID, UUID) TO service_role;

-- ── 2. RLS SELECT para anon key (necesario para Realtime postgres_changes) ────
-- Sin esta policy el canal supabase.channel() no recibe eventos INSERT.
-- El API usa service_role y no se ve afectado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'mensajes_turno'
    AND   policyname = 'anon_select_mensajes_turno'
  ) THEN
    CREATE POLICY "anon_select_mensajes_turno" ON mensajes_turno
      FOR SELECT TO anon USING (true);
  END IF;
END$$;
