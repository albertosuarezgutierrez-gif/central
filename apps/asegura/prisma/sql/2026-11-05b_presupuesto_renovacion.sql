-- 2026-11-05b — RENOVACIÓN CON ALTERNATIVAS en la app del cliente (Alberto, 04/11/2026).
-- Código: apps/asegura/lib/renovacion-alternativas.ts (BD) + renovacion-alternativas-reglas.ts (PURO, con test),
-- rutas /api/operador/renovacion/{preparar,enviar} y la acción `elegir_renovacion` del puente /api/portal/presupuesto;
-- en el portal, lib/presupuesto-renovacion.ts (lectura fail-closed) y el bloque ElegirRenovacion.
--
-- Qué añade a `seguros.presupuesto` (ni una tabla nueva):
--   · `modo`               NULL = el presupuesto de siempre; 'renovacion' = «tu renovación actual vs. alternativas» de una
--                          póliza NUESTRA en vigor (el portal enseña «Me quedo con mi renovación» y NO el «llévamelo yo»).
--   · `eleccion_cliente`   lo que el cliente ELIGIÓ en la app SIN firmar: 'opcion' (una alternativa) | 'renovacion'
--                          (se queda con la suya). NULL = no consta que haya elegido. Elegir NO emite ni firma nada:
--                          avisa a Alberto, que confirma con la compañía y prepara la emisión.
--   · `eleccion_opcion_id` la opción elegida (solo con 'opcion'). Sin FK a propósito (las opciones son snapshot y el código
--                          comprueba que es de ESTE presupuesto dentro de la transacción).
--   · `eleccion_at`        cuándo.
--   · `canal_aviso` admite 'app': publicado en la app (campana + correo de aviso de acceso de `avisos-intranet`, que nunca
--                          lleva el título del aviso). `enviado_at` se sella al publicar: no hay proveedor que confirme.
--
-- 🚨 Fail-closed: sin estas columnas «Preparar renovación» devuelve 503 `sin_migracion` (no crea nada), el ✅ de Telegram no
--    publica, la elección del portal da 503 y el portal pinta el presupuesto de siempre (sin elegir). Nunca «se finge».
-- El portal (rol `prisma_asegura_portal`, SIN BYPASSRLS) solo LEE estas cuatro columnas: la elección la escribe asegura por
-- el puente, con la ficha resuelta por `portal_vinculo` (nunca un clienteId del cliente).
--
-- ⚠️ NO APLICADA. En transacción. Se deshace con el bloque ROLLBACK del final.

BEGIN;

SET search_path = seguros, public;

ALTER TABLE seguros.presupuesto
  ADD COLUMN IF NOT EXISTS modo text,
  ADD COLUMN IF NOT EXISTS eleccion_cliente text,
  ADD COLUMN IF NOT EXISTS eleccion_opcion_id uuid,
  ADD COLUMN IF NOT EXISTS eleccion_at timestamptz;

ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_modo_valido;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_modo_valido
  CHECK (modo IS NULL OR modo = 'renovacion');

-- Una renovación compara contra una póliza: sin `poliza_id` no hay «tu renovación actual».
ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_renovacion_con_poliza;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_renovacion_con_poliza
  CHECK (modo IS DISTINCT FROM 'renovacion' OR poliza_id IS NOT NULL);

ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_eleccion_coherente;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_eleccion_coherente CHECK (
  (eleccion_cliente IS NULL AND eleccion_opcion_id IS NULL AND eleccion_at IS NULL)
  OR (eleccion_cliente = 'renovacion' AND eleccion_opcion_id IS NULL AND eleccion_at IS NOT NULL AND modo = 'renovacion')
  OR (eleccion_cliente = 'opcion' AND eleccion_opcion_id IS NOT NULL AND eleccion_at IS NOT NULL AND modo = 'renovacion')
);

-- El CHECK original de 2026-09-21_presupuesto.sql es anónimo (`presupuesto_canal_aviso_check`): se rehace con 'app'.
ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_canal_aviso_check;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_canal_aviso_check
  CHECK (canal_aviso IN ('email', 'whatsapp_enlace', 'app'));

-- Publicar en la app solo una RENOVACIÓN (el resto de presupuestos siguen saliendo por correo o WhatsApp).
ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_app_solo_renovacion;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_app_solo_renovacion
  CHECK (canal_aviso IS DISTINCT FROM 'app' OR modo = 'renovacion');

-- El portal LEE (columna a columna, como el resto de `presupuesto`); no escribe ninguna.
GRANT SELECT (modo, eleccion_cliente, eleccion_opcion_id, eleccion_at) ON seguros.presupuesto TO prisma_asegura_portal;

COMMIT;

-- ─── Comprobación tras aplicar ────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema = 'seguros' and table_name = 'presupuesto'
--      and column_name in ('modo', 'eleccion_cliente', 'eleccion_opcion_id', 'eleccion_at');          -- 4 filas
--   select conname from pg_constraint where conrelid = 'seguros.presupuesto'::regclass
--      and conname in ('presupuesto_modo_valido', 'presupuesto_renovacion_con_poliza', 'presupuesto_eleccion_coherente',
--                      'presupuesto_canal_aviso_check', 'presupuesto_app_solo_renovacion');               -- 5 filas
--   select column_name from information_schema.column_privileges
--    where table_schema = 'seguros' and table_name = 'presupuesto' and grantee = 'prisma_asegura_portal'
--      and column_name like 'eleccion%' or column_name = 'modo';                                          -- SELECT
--
-- ─── ROLLBACK (se pierde qué eligió cada cliente; los presupuestos publicados por 'app' vuelven a no tener canal) ───
--   BEGIN;
--   REVOKE SELECT (modo, eleccion_cliente, eleccion_opcion_id, eleccion_at) ON seguros.presupuesto FROM prisma_asegura_portal;
--   ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_app_solo_renovacion;
--   UPDATE seguros.presupuesto SET canal_aviso = NULL WHERE canal_aviso = 'app';
--   ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_canal_aviso_check;
--   ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_canal_aviso_check CHECK (canal_aviso IN ('email', 'whatsapp_enlace'));
--   ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_eleccion_coherente;
--   ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_renovacion_con_poliza;
--   ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_modo_valido;
--   ALTER TABLE seguros.presupuesto DROP COLUMN IF EXISTS eleccion_at, DROP COLUMN IF EXISTS eleccion_opcion_id,
--     DROP COLUMN IF EXISTS eleccion_cliente, DROP COLUMN IF EXISTS modo;
--   COMMIT;
