-- Dedupe del vigía de cobertura de los mensajes programados a huéspedes.
--
-- El cron pasa 48 veces al día (7,37 * * * *). Sin esta tabla, «Mafalda llega hoy sin sus códigos»
-- sonaría 48 veces y Alberto dejaría de leerlo — que es cómo un aviso correcto se vuelve inútil.
-- Una fila por hallazgo y día: la clave la compone `claveAviso()` de `mensajes-prog/cobertura.ts`.
--
-- Sin `id`: la clave natural ES la clave de dedupe, así que no hay secuencia que otorgar.
CREATE TABLE IF NOT EXISTS mensajes_prog_avisos (
  clave      text PRIMARY KEY,
  avisado_at timestamptz NOT NULL DEFAULT now()
);

-- Una tabla nueva en `public` nace abierta a anon/authenticated por los privilegios por defecto del
-- schema, y esta BD la comparten sivra + ialimp + plataforma (regla del CLAUDE.md de la raíz).
REVOKE ALL ON mensajes_prog_avisos FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON mensajes_prog_avisos TO prisma_plataforma;
