-- Avisos del último sync PSD2, persistidos por conexión para que el panel /banca pueda
-- decir POR QUÉ el feed está roto (fallo /transactions, ventana vacía…), no solo que lo está.
-- Tres estados en ultimo_avisos (jsonb array de strings):
--   NULL  = el sync aún no reporta (fila anterior al cambio) — «no se sabe», no «limpio»;
--   []    = el último sync terminó SIN avisos (limpio, escrito explícitamente);
--   [...] = avisos del último sync (avisos_at = cuándo).
ALTER TABLE conexiones_banco
  ADD COLUMN IF NOT EXISTS ultimo_avisos jsonb,
  ADD COLUMN IF NOT EXISTS avisos_at timestamptz;
