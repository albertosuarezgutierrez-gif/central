-- 2026-11-05c — RENOVACIÓN CON ALTERNATIVAS: QUIÉN ELIGE (Alberto, 05/11/2026). Va DESPUÉS de 2026-11-05b (la necesita).
-- Código: apps/asegura/lib/renovacion-alternativas.ts (`elegirRenovacion` escribe; `migracionQuienElige` comprueba) +
-- renovacion-alternativas-reglas.ts (PURO) + packages/module-seguros-portal/src/renovacion-eleccion.ts (la regla única de
-- quién elige y de quién es la elección); en el portal, lib/presupuesto.ts (`leerRenovacion`, lectura fail-closed).
--
-- Decisión: además del TOMADOR (su cuenta del portal o el ENLACE del WhatsApp), elige también quien él AUTORIZA con Gestión
-- o Total (`portal_autorizacion` vigente). Vale la PRIMERA elección: la otra persona ve «ya elegida por <nombre de pila>».
-- El portal NO puede leer `presupuesto_evento.detalle` (sin GRANT a propósito), así que quién eligió va en columnas que sí
-- lee, una a una:
--   · `eleccion_por_papel`        'tomador' | 'autorizado'. NULL con elección hecha = anterior a esta migración (= tomador).
--   · `eleccion_por_identidad_id` la identidad del portal que eligió (NULL = el tomador por el enlace, sin cuenta). Sin FK a
--                                 propósito (la identidad se puede suprimir; el rastro completo está en el evento).
--   · `eleccion_por_nombre`       SOLO el nombre de pila (≤ 60). Nunca DNI, IBAN ni dirección.
--   · `eleccion_via`              'app' | 'enlace_whatsapp'.
-- Se escriben con la PRIMERA elección y no cambian después (quien eligió puede cambiar de opinión; nadie más).
--
-- 🚨 Fail-closed: sin estas columnas la elección del portal da 503 `sin_migracion` (no escribe nada) y el portal no ofrece
--    elegir ni aceptar/firmar en una renovación (no puede saber quién eligió). Nunca «se finge».
--
-- ✅ APLICADA en producción el 05/11/2026 (en transacción; comprobación OK). Se deshace con el bloque ROLLBACK del final.

BEGIN;

SET search_path = seguros, public;

ALTER TABLE seguros.presupuesto
  ADD COLUMN IF NOT EXISTS eleccion_por_papel text,
  ADD COLUMN IF NOT EXISTS eleccion_por_identidad_id uuid,
  ADD COLUMN IF NOT EXISTS eleccion_por_nombre text,
  ADD COLUMN IF NOT EXISTS eleccion_via text;

ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_eleccion_por_valido;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_eleccion_por_valido CHECK (
  (eleccion_por_papel IS NULL OR eleccion_por_papel IN ('tomador', 'autorizado'))
  AND (eleccion_via IS NULL OR eleccion_via IN ('app', 'enlace_whatsapp'))
  -- Un autorizado es SIEMPRE una identidad del portal (por el enlace solo elige el tomador).
  AND (eleccion_por_papel IS DISTINCT FROM 'autorizado' OR (eleccion_por_identidad_id IS NOT NULL AND eleccion_via = 'app'))
  AND (eleccion_por_nombre IS NULL OR char_length(eleccion_por_nombre) <= 60)
  -- Quién eligió solo existe si hay elección.
  AND (eleccion_por_papel IS NULL OR eleccion_cliente IS NOT NULL)
);

-- El portal LEE (columna a columna, como el resto de `presupuesto`); no escribe ninguna.
GRANT SELECT (eleccion_por_papel, eleccion_por_identidad_id, eleccion_por_nombre, eleccion_via) ON seguros.presupuesto TO prisma_asegura_portal;

COMMIT;

-- ─── Comprobación tras aplicar ────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema = 'seguros' and table_name = 'presupuesto' and column_name like 'eleccion_%';     -- 8 filas (4 de 05b + 4)
--   select conname from pg_constraint where conrelid = 'seguros.presupuesto'::regclass
--      and conname = 'presupuesto_eleccion_por_valido';                                                    -- 1 fila
--   select column_name from information_schema.column_privileges
--    where table_schema = 'seguros' and table_name = 'presupuesto' and grantee = 'prisma_asegura_portal'
--      and column_name in ('eleccion_por_papel', 'eleccion_por_identidad_id', 'eleccion_por_nombre', 'eleccion_via'); -- SELECT
--
-- ─── ROLLBACK (se pierde quién eligió; la elección en sí queda) ─────────────────
--   BEGIN;
--   REVOKE SELECT (eleccion_por_papel, eleccion_por_identidad_id, eleccion_por_nombre, eleccion_via) ON seguros.presupuesto FROM prisma_asegura_portal;
--   ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_eleccion_por_valido;
--   ALTER TABLE seguros.presupuesto DROP COLUMN IF EXISTS eleccion_via, DROP COLUMN IF EXISTS eleccion_por_nombre,
--     DROP COLUMN IF EXISTS eleccion_por_identidad_id, DROP COLUMN IF EXISTS eleccion_por_papel;
--   COMMIT;
