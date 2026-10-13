-- ⏳ SIN APLICAR. Portal de Grupo ASegura — avisos, fase B (13/10/2026).
--
-- Tres avisos nuevos por el cron `GET /api/cron/avisos-cima` (reglas en
-- `packages/module-seguros-portal/src/avisos-ampliados.ts`):
--   · `vencimiento_aportada`   una póliza APORTADA vence (ventana fija 45→30 días): «¿comparativa?».
--   · `subida_prima`           el precio sube más del umbral del cliente (5/10/15/20 %, por defecto 10).
--   · `vencimiento_autorizado` vence una póliza de quien te dio Gestión o Total sobre ella.
--
-- Se aplica ANTES de desplegar el código que la usa (mismo paso). Requiere aplicada
-- `2026-10-13_configuracion_avisos.sql` (la tabla `portal_preferencias_avisos`). Sin esta:
--   · el cron sella con un tipo que el CHECK no admite → 23514 DESPUÉS de enviar (se repetiría cada día);
--   · `/configuracion` no puede guardar las casillas nuevas ni el umbral (error, ruidoso).
-- Es ADITIVA: amplía dos CHECK, añade una columna nullable y una tabla nueva.
SET search_path = seguros, public;

BEGIN;

-- 1) Los tipos nuevos en el sello y en el interruptor. Lista = `TIPOS_AVISO_CIMA` (+ `base` en el sello);
--    `test/regression-portal-avisos-cima.test.ts` la compara contra `2026-09-25_c_portal_avisos_cima.sql`.
ALTER TABLE seguros.portal_aviso_cima DROP CONSTRAINT IF EXISTS portal_aviso_cima_tipo_check;
ALTER TABLE seguros.portal_aviso_cima ADD CONSTRAINT portal_aviso_cima_tipo_check
  CHECK (tipo IN ('base', 'recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada',
                  'vencimiento_aportada', 'subida_prima', 'vencimiento_autorizado'));

ALTER TABLE seguros.portal_aviso_silenciado DROP CONSTRAINT IF EXISTS portal_aviso_silenciado_tipo_check;
ALTER TABLE seguros.portal_aviso_silenciado ADD CONSTRAINT portal_aviso_silenciado_tipo_check
  CHECK (tipo IN ('recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada',
                  'vencimiento_aportada', 'subida_prima', 'vencimiento_autorizado'));

-- 2) Umbral de subida de precio. 🚨 NULL = «no lo ha configurado» (= 10 %), nunca «no quiere».
--    La columna hereda los GRANT de tabla (SELECT, INSERT, UPDATE) de `2026-10-13_configuracion_avisos.sql`.
ALTER TABLE seguros.portal_preferencias_avisos
  ADD COLUMN IF NOT EXISTS umbral_subida_prima smallint
  CONSTRAINT portal_preferencias_avisos_umbral_check CHECK (umbral_subida_prima IN (5, 10, 15, 20));

-- 3) La última prima VISTA de cada póliza, por identidad: contra qué se compara la de hoy, y la subida
--    pendiente de avisar (valor anterior y nuevo). Una fila por (identidad, origen, póliza).
--      origen   'cartera' (ref_id = polizas.id) | 'aportada' (ref_id = portal_poliza_declarada.id).
--               Sin FK a propósito: el rol no escribe en `polizas` y una FK ataría su borrado.
--      unidad   QUÉ importe es («cartera-bruta-anual|mensual», «declarada-anual|-»…). Dos importes solo se
--               comparan con la misma unidad; si cambia, se re-siembra sin avisar.
--      subida_* la subida detectada y aún pendiente (las cuatro o ninguna). El aviso se deriva de aquí,
--               así que un push fallido se reintenta; se borran si el precio vuelve a cambiar.
CREATE TABLE IF NOT EXISTS seguros.portal_prima_observada (
  identidad_id      uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  origen            text NOT NULL CHECK (origen IN ('cartera', 'aportada')),
  ref_id            uuid NOT NULL,
  importe           numeric(10, 2) NOT NULL CHECK (importe > 0),
  unidad            text NOT NULL CHECK (length(unidad) <= 80),
  observado_en      timestamptz NOT NULL DEFAULT now(),
  subida_desde      numeric(10, 2),
  subida_hasta      numeric(10, 2),
  subida_porcentaje numeric(7, 2),
  subida_en         timestamptz,
  PRIMARY KEY (identidad_id, origen, ref_id),
  CONSTRAINT portal_prima_observada_subida_completa CHECK (
    num_nonnulls(subida_desde, subida_hasta, subida_porcentaje, subida_en) IN (0, 4)
  ),
  CONSTRAINT portal_prima_observada_subida_sube CHECK (subida_desde IS NULL OR subida_hasta > subida_desde)
);

-- Como el resto de `portal_*`: el aislamiento lo da el CÓDIGO (el cron escribe con el `identidadId`
-- de cada pasada), no RLS. Explícito para que un activado automático no deje al rol leyendo vacío.
ALTER TABLE seguros.portal_prima_observada DISABLE ROW LEVEL SECURITY;

-- Sin DELETE: la fila muere con la identidad (ON DELETE CASCADE, supresión incluida).
GRANT SELECT, INSERT, UPDATE ON seguros.portal_prima_observada TO prisma_asegura_portal;

-- Los privilegios por defecto del schema dan DML a `crm_seguros` en cada tabla nueva: se le quitan
-- (landmine de `apps/asegura-portal/CLAUDE.md`, 24/09/2026; `test/regression-portal-sin-crm.test.ts`).
REVOKE ALL ON seguros.portal_prima_observada FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname IN ('portal_aviso_cima_tipo_check', 'portal_aviso_silenciado_tipo_check', 'portal_preferencias_avisos_umbral_check');
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_prima_observada' ORDER BY 1, 2;
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'seguros.portal_prima_observada'::regclass;
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- Antes, revertir el código (el cron y `/configuracion` lo usan). Los CHECK viejos fallan si ya hay filas
-- con los tipos nuevos: se borran primero (se pierden sus sellos y silencios; nada más depende de ellas).
--   DELETE FROM seguros.portal_aviso_cima WHERE tipo IN ('vencimiento_aportada', 'subida_prima', 'vencimiento_autorizado');
--   DELETE FROM seguros.portal_aviso_silenciado WHERE tipo IN ('vencimiento_aportada', 'subida_prima', 'vencimiento_autorizado');
--   ALTER TABLE seguros.portal_aviso_cima DROP CONSTRAINT IF EXISTS portal_aviso_cima_tipo_check;
--   ALTER TABLE seguros.portal_aviso_cima ADD CONSTRAINT portal_aviso_cima_tipo_check
--     CHECK (tipo IN ('base', 'recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada'));
--   ALTER TABLE seguros.portal_aviso_silenciado DROP CONSTRAINT IF EXISTS portal_aviso_silenciado_tipo_check;
--   ALTER TABLE seguros.portal_aviso_silenciado ADD CONSTRAINT portal_aviso_silenciado_tipo_check
--     CHECK (tipo IN ('recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada'));
--   ALTER TABLE seguros.portal_preferencias_avisos DROP COLUMN IF EXISTS umbral_subida_prima;
--   DROP TABLE IF EXISTS seguros.portal_prima_observada;
