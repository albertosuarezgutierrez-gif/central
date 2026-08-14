-- Dedupe de avisos recurrentes del motor de pricing.
--
-- POR QUÉ (13/08/2026, caso Bienal — decisión Fable delegada por Alberto). La guarda «evento a
-- ciegas» congela la bajada de una noche de evento confirmado sin mercado fiable, y esa condición
-- persiste días. El motor corre 3 veces al día: sin dedupe, cada fecha congelada serían ~21
-- Telegram/semana y el canal acabaría ignorado (la lección del guardián del 19/07). Una fila por
-- clave de aviso; la purga (>7 días) la hace el propio motor antes de insertar, así una
-- congelación larga se recuerda una vez por semana.
CREATE TABLE IF NOT EXISTS pricing_avisos (
  clave text PRIMARY KEY,
  enviado_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pricing_avisos IS
  'Dedupe de avisos Telegram recurrentes del motor (clave p.ej. congelada:<piso>:<fecha>). El motor purga las filas de >7 días antes de insertar: clave nueva o caducada = se avisa, clave viva = silencio.';

-- Misma política de acceso que el resto de tablas del motor: solo el rol de la app.
REVOKE ALL ON pricing_avisos FROM anon, authenticated;
