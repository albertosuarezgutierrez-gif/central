-- ⏳ SIN APLICAR. Portal de Grupo ASegura — interruptores «avisarme cuando vaya a caducar mi carné» y «avisarme de la
-- ITV de mi vehículo» (21/10/2026). Un solo fichero y un solo CHECK para los dos tipos nuevos (`vencimiento_carnet`,
-- `vencimiento_itv`): donde abajo se dice «el valor nuevo» o «el aviso» vale para ambos.
--
-- El tipo `vencimiento_carnet` se guarda en `seguros.portal_aviso_silenciado` (sin fila = ENCENDIDO; apagarlo
-- inserta una fila), como el resto de interruptores. Esa tabla tiene un CHECK de `tipo` que NO admite el valor
-- nuevo: sin este fichero, APAGAR el aviso da 23514 (la ruta responde 503 `no_guardado` y la casilla vuelve a
-- «encendido»; encenderlo —borrar la fila— funciona siempre). Mientras no se aplique, el aviso sigue ENCENDIDO
-- para todos: es el fallo seguro.
--
-- Solo se amplía el CHECK del INTERRUPTOR. `portal_aviso_cima` (el sello del cron `avisos-cima`) NO se toca: el
-- carné no pasa por ese cron (`TIPOS_AVISO_CIMA` no lo incluye a propósito).
-- Aditiva y sin cambio de GRANT (`portal_aviso_silenciado` ya da SELECT, INSERT, DELETE a `prisma_asegura_portal`
-- y `apps/asegura` la lee con `prisma_seguros` por los privilegios por defecto del schema).
-- Se puede aplicar antes o después del despliegue; lo ideal, en el mismo paso.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_aviso_silenciado DROP CONSTRAINT IF EXISTS portal_aviso_silenciado_tipo_check;
ALTER TABLE seguros.portal_aviso_silenciado ADD CONSTRAINT portal_aviso_silenciado_tipo_check
  CHECK (tipo IN ('recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada',
                  'vencimiento_aportada', 'subida_prima', 'vencimiento_autorizado', 'vencimiento_carnet',
                  'vencimiento_itv'));

COMMIT;

-- ── Verificación (solo lectura) ──────────────────────────────────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'portal_aviso_silenciado_tipo_check';
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
--   DELETE FROM seguros.portal_aviso_silenciado WHERE tipo IN ('vencimiento_carnet', 'vencimiento_itv');
--   ALTER TABLE seguros.portal_aviso_silenciado DROP CONSTRAINT IF EXISTS portal_aviso_silenciado_tipo_check;
--   ALTER TABLE seguros.portal_aviso_silenciado ADD CONSTRAINT portal_aviso_silenciado_tipo_check
--     CHECK (tipo IN ('recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada',
--                     'vencimiento_aportada', 'subida_prima', 'vencimiento_autorizado'));
