-- ✅ APLICADA en prod (central · schema seguros) el 12/10/2026. Se aplicaba ANTES de desplegar el código que concede
-- «Gestión»: sin ella, conceder/ampliar a `gestion` falla con 23514 (CHECK) —
-- ruidoso, no silencioso—. Es aditiva: el código viejo nunca escribe `gestion`
-- y los lectores viejos lo ignoran (`esAlcance` → no abre nada, fail-closed).
--
-- ── QUÉ CAMBIA (12/10/2026, decisión de Alberto) ─────────────────────────────
-- Tres niveles de acceso compartido como presets: Consulta (`ver_economico`),
-- Gestión (`gestion`, NUEVO) y Total (`total`). Gestión = Consulta + dar partes
-- + documentos de la póliza; sin DNI/IBAN de una persona física, sin tocar sus
-- pólizas añadidas a mano, sin reautorizar. Reglas en
-- `packages/module-seguros-portal/src/autorizacion.ts` y `capacidades.ts`.
--
-- 🚨 No se reutilizan `partes`/`documentos`: el CHECK
-- `portal_autorizacion_apoderamiento_con_titulo` les exige título (solo
-- sociedades), y una fila `partes` de una persona física escrita por otro
-- camino NO abre nada. Reinterpretarlas como Gestión daría poder sin el texto
-- de consentimiento que lo dice (`v1-2026-10-12-gestion`).
--
-- `gestion` NO exige `titulo_representacion` en BD (en una persona física no se
-- representa a nadie); en una sociedad lo exige el código, como con `total`.
-- La vía del corredor (`apps/asegura`) NO concede `gestion` (no tiene texto
-- para ella) y la rechaza con 422.

SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_alcance_check;
ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_alcance_check
  CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos', 'gestion', 'total', 'flota'));

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'portal_autorizacion_alcance_check';
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- Solo si no hay filas `gestion` vivas (si las hay, se REVOCAN antes; borrarlas
-- es perder la prueba de quién concedió qué):
--   ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_alcance_check;
--   ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_alcance_check
--     CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos', 'total', 'flota'));
