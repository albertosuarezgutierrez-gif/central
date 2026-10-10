-- El presupuesto congela TODAS las opciones, no solo las de portada (29/09/2026).
--
-- Plan: docs/superpowers/plans/2026-09-28-presupuesto-filtro-garantias.md (entrega 2).
-- Caso: la moto de Manuel trajo 31 precios de 5 compañías y el presupuesto llevó 2, los dos de
-- Allianz. Desde aquí se congelan todos: portada = `papeles <> '{}'` (como ya decía el diseño) y el
-- resto va debajo, en la lista que el cliente filtra por garantías.
--
-- ✅ APLICADA el 29/09/2026 (migración `seguros_presupuesto_opcion_todas`).
-- Tres columnas NUEVAS y nullable + un CHECK que ninguna fila existente puede violar (todas nacen
-- con `oculta_at` NULL). No toca un dato. Se deshace con tres `drop column`.
SET search_path = seguros, public;

-- La fila de `tarificacion_precios` de la que sale. SIN FK a propósito: esa tabla se reescribe en
-- cada pasada y esto es un snapshot. Sirve para que la parrilla del corredor diga «oculta esta».
ALTER TABLE seguros.presupuesto_opcion ADD COLUMN IF NOT EXISTS precio_id uuid;

-- Las garantías clasificadas (`clasificarCoberturas` de @central/module-seguros), congeladas con la
-- opción. NULL = no se clasificó (sin coberturas leídas): el filtro la trata como «no consta».
ALTER TABLE seguros.presupuesto_opcion ADD COLUMN IF NOT EXISTS garantias jsonb;

-- El corredor la quitó antes de enviar. Se CONGELA igual (trazabilidad IDD: lo que se decidió no
-- enseñar también se puede reconstruir) pero el cliente no la ve, la IA no la lee y no se acepta.
ALTER TABLE seguros.presupuesto_opcion ADD COLUMN IF NOT EXISTS oculta_at timestamptz;

-- Una recomendada no se puede ocultar: la portada es lo que se le pone delante al cliente.
ALTER TABLE seguros.presupuesto_opcion DROP CONSTRAINT IF EXISTS portada_no_oculta;
ALTER TABLE seguros.presupuesto_opcion
  ADD CONSTRAINT portada_no_oculta CHECK (oculta_at IS NULL OR papeles = '{}'::text[]);

COMMENT ON COLUMN seguros.presupuesto_opcion.oculta_at IS
  'El corredor la quitó antes de enviar. Congelada pero invisible: todo lector de opciones filtra '
  '`oculta_at IS NULL` (lo vigila apps/asegura/lib/presupuesto-opcion-oculta.test.ts).';

-- El portal lee por COLUMNAS (2026-09-21_portal_presupuesto_grants.sql): sin esto su SELECT de las
-- opciones fallaría entero. `precio_id` NO se concede: es un id interno de la tarificación.
-- ✅ Aplicado el 29/09/2026 como migración `seguros_presupuesto_opcion_todas_grant_portal`.
GRANT SELECT (garantias, oculta_at) ON seguros.presupuesto_opcion TO prisma_asegura_portal;
