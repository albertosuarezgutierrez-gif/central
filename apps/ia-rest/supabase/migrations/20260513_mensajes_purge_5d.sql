-- Retención de mensajes_turno: 5 días
-- Purge automático vía pg_cron + política RLS para owner
-- Mayo 2026

-- Índice adicional en created_at para acelerar el purge y las queries del owner
CREATE INDEX IF NOT EXISTS idx_mensajes_created_at
  ON mensajes_turno(created_at DESC);

-- Job pg_cron: cada día a las 3:00 AM UTC borra mensajes con más de 5 días
-- (se añade al pg_cron existente del proyecto)
SELECT cron.schedule(
  'purge-mensajes-turno-5d',
  '0 3 * * *',
  $$
    DELETE FROM mensajes_turno
    WHERE created_at < now() - interval '5 days';
  $$
);

-- Política RLS para que el owner pueda leer todos los mensajes de su restaurante
-- (los otros roles solo leen los mensajes del turno activo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mensajes_turno'
    AND policyname = 'owner_read_mensajes'
  ) THEN
    CREATE POLICY "owner_read_mensajes" ON mensajes_turno
      FOR SELECT
      USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);
  END IF;
END$$;
