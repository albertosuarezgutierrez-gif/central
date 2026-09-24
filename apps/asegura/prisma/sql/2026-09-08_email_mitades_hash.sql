-- 2026-09-08 — Búsqueda PARCIAL por email: hash del dominio y hash del usuario
--
-- ── Por qué ─────────────────────────────────────────────────────────────────
-- El email va cifrado y el buscador de /correduria solo lo encuentra por su
-- índice ciego (`email_lookup_hash`), que casa con la dirección ENTERA. Teclear
-- «alberto.suarez» o «@gmail.com» devolvía «nadie coincide». Dos hashes más,
-- uno por mitad, permiten esas dos búsquedas sin descifrar nada. No es un LIKE:
-- «suarez» a secas sigue sin poderse.
--
-- Sin índice único a propósito: un dominio lo comparten miles de fichas y un
-- usuario («info», «casa») también puede repetirse. El hash lleva prefijo
-- (`dom:`/`usr:`) dentro del HMAC, así que nunca coincide con el del email entero.
--
-- Las columnas nacen a NULL en todo el corpus (~4.500 fichas y ~4.500 hijas con
-- email); las rellena el backfill de contacto (`POST /api/operador/backfill-contacto`)
-- desde /correduria/mantenimiento. NULL = «todavía no calculado», no «sin email».
--
-- Idempotente: IF NOT EXISTS en todo.

alter table seguros.clientes
  add column if not exists email_dominio_hash text,
  add column if not exists email_usuario_hash text;

alter table seguros.cliente_emails
  add column if not exists email_dominio_hash text,
  add column if not exists email_usuario_hash text;

create index if not exists idx_clientes_email_dominio_hash
  on seguros.clientes (email_dominio_hash) where email_dominio_hash is not null;
create index if not exists idx_clientes_email_usuario_hash
  on seguros.clientes (email_usuario_hash) where email_usuario_hash is not null;
create index if not exists idx_cliente_emails_dominio_hash
  on seguros.cliente_emails (email_dominio_hash) where email_dominio_hash is not null;
create index if not exists idx_cliente_emails_usuario_hash
  on seguros.cliente_emails (email_usuario_hash) where email_usuario_hash is not null;
