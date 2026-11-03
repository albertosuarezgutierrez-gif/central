-- Patrimonio en el portal del cliente — «Hipoteca» como recordatorio PROPIO del inmueble (27/10/2026, Alberto).
-- Amplía el catálogo de `seguros.portal_patrimonio_obligacion.categoria` con `hipoteca` (cuota o vencimiento).
-- ⏳ SIN APLICAR: lo aplica Alberto. Requiere `2026-10-25_portal_patrimonio_obligacion_propia.sql` ya aplicado.
--
-- 🚨 Aplícalo desde el EDITOR SQL de Supabase, NO por el MCP: un CHECK no se puede ampliar sin quitar el viejo, y el
-- MCP se cuelga con esa sentencia. Es la ÚNICA de este fichero y solo quita la restricción del catálogo viejo.
--
-- ADITIVO en datos: el catálogo nuevo es el viejo + `hipoteca` (toda fila que hoy cumple, cumple el nuevo). No toca
-- columnas, GRANT ni filas. IDEMPOTENTE: el CHECK nuevo se crea solo si no existe y se crea ANTES de quitar el viejo,
-- dentro de la misma transacción (la tabla nunca se queda sin catálogo).
--
-- Código ANTES que el SQL: sin aplicar, guardar un recordatorio de hipoteca lo rechaza el CHECK viejo y el portal
-- responde 409 `categoria_no_disponible` con un texto claro («elige “Otro”»), nunca un 500. El resto sigue igual.
SET search_path = seguros, public;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_obligacion_categoria_catalogo_v2') THEN
    ALTER TABLE seguros.portal_patrimonio_obligacion
      ADD CONSTRAINT portal_patrimonio_obligacion_categoria_catalogo_v2
        CHECK (categoria IS NULL OR categoria IN ('ibi', 'comunidad', 'caldera', 'ite', 'fin_seguro', 'basuras', 'hipoteca', 'otro'));
  END IF;
END $$;

ALTER TABLE seguros.portal_patrimonio_obligacion DROP CONSTRAINT IF EXISTS portal_patrimonio_obligacion_categoria_catalogo;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'seguros.portal_patrimonio_obligacion'::regclass AND conname LIKE '%categoria_catalogo%';
--   → una sola fila, `..._v2`, con 'hipoteca' en la lista
