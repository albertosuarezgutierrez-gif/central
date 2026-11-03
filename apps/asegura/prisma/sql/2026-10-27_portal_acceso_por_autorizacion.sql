-- ✅ APLICADO en producción el 28/10/2026 (migración portal_acceso_por_autorizacion) — Acceso a los módulos del portal = AUTORIZACIÓN de la correduría (decisión de Alberto).
--
-- Qué hace: amplía el CHECK `portal_vinculo_origen_check` con un origen NUEVO, `autorizacion_corredor`: el vínculo
-- `gestionar` que crea asegura cuando Alberto activa un módulo a una persona del portal SIN ficha (se le crea una ficha de
-- PROSPECTO: lead, sin póliza, fuente portal). Ese vínculo es de una PERSONA (opera como `email_hash`/`manual`), no la
-- vista TEMPORAL del corredor (`corredor`, que sigue fuera de todo recuento). El trigger de cambio de correo solo borra
-- `email_hash`: este vínculo no lo retira nadie más que el corredor.
--
-- Qué NO hace: no crea tablas (ni `portal_patrimonio_*`, así que no hay REVOKE que añadir), no toca ninguna fila, no borra
-- nada. Los permisos que usa la escritura ya existen: INSERT en `clientes`/`portal_vinculo`/`historial_interno` del rol
-- `prisma_seguros` (los usa ya `poliza-de-documento.ts`) y UPDATE (estado, activado_en) de `portal_modulo`
-- (`2026-10-24_portal_modulos_operador.sql`).
--
-- Orden: el CÓDIGO puede ir antes que este SQL. Sin él, «Activar» de una petición sin ficha contesta 503 `sin_migracion`
-- («falta aplicar …») y la transacción entera vuelve atrás: no queda ficha de prospecto huérfana. Lo demás (activar sin
-- póliza a una ficha con identidad) no depende de este fichero.
--
-- Idempotente: se puede correr dos veces. La lista es espejo EXACTO de `ORIGENES_VINCULO` de
-- `@central/module-seguros-portal` (`src/modulos.ts`); lo vigila `apps/asegura/lib/portal-modulos-operador.test.ts`.
BEGIN;

ALTER TABLE seguros.portal_vinculo DROP CONSTRAINT IF EXISTS portal_vinculo_origen_check;
ALTER TABLE seguros.portal_vinculo
  ADD CONSTRAINT portal_vinculo_origen_check
  CHECK (origen = ANY (ARRAY['email_hash'::text, 'manual'::text, 'corredor'::text, 'autorizacion_corredor'::text]));

COMMIT;

-- Verificación:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'portal_vinculo_origen_check';
-- Marcha atrás (solo si no hay ya vínculos con el origen nuevo; si los hay, el ADD falla y no se pierde nada):
--   ALTER TABLE seguros.portal_vinculo DROP CONSTRAINT IF EXISTS portal_vinculo_origen_check;
--   ALTER TABLE seguros.portal_vinculo ADD CONSTRAINT portal_vinculo_origen_check
--     CHECK (origen = ANY (ARRAY['email_hash'::text, 'manual'::text, 'corredor'::text]));
