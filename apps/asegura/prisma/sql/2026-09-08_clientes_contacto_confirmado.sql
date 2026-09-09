-- 2026-09-08 — `clientes.contacto_confirmado_at`: cuándo confirmó el CLIENTE sus datos de contacto
--
-- ── Por qué ─────────────────────────────────────────────────────────────────
-- El portal (`apps/asegura-portal`) le enseña al cliente sus datos de contacto
-- ENMASCARADOS y le pide «¿siguen igual?». Tanto si dice que sí como si corrige
-- dirección o teléfono, asegura sella aquí el momento (puerto `/api/portal/*`,
-- `lib/contacto-portal.ts`). Con eso el portal sabe si volver a preguntar
-- (`confirmacionContactoVigente()` de `@central/module-seguros-portal`: 365 días).
--
-- ── Tres estados, no dos ────────────────────────────────────────────────────
-- NULL = NUNCA confirmado desde el portal (así nacen las 32.600 fichas del
-- volcado: no se sabe si el dato está bien). NO es «caducado»: caducado es un
-- sello de hace más de un año. Ningún código colapsa NULL con «confirmado».
--
-- Idempotente. Aplicar en preview → prod. NO se aplica desde el repo.

ALTER TABLE seguros.clientes
  ADD COLUMN IF NOT EXISTS contacto_confirmado_at timestamptz NULL;

COMMENT ON COLUMN seguros.clientes.contacto_confirmado_at IS
  'Última vez que el propio cliente confirmó (o corrigió) sus datos de contacto desde el portal. NULL = nunca confirmado desde el volcado; se sella al confirmar «siguen igual» o al corregir dirección/teléfono.';
