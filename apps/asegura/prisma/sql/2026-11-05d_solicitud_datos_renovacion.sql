-- 2026-11-05d — SOLICITUD DE DATOS DE LA RENOVACIÓN POR LA APP (Alberto, 05/11/2026). Va DESPUÉS de 2026-10-25 (ramos) y
-- 2026-10-26 (borrador) de `solicitud_datos`.
-- Código: apps/asegura/lib/solicitud-renovacion.ts (preparar · publicar · puente del portal; `migracionSolicitudRenovacion` lo
-- comprueba) + solicitud-renovacion-reglas.ts (PURO) + solicitud-renovacion-lectura.ts (cron de avisos) +
-- packages/module-seguros-portal/src/datos-renovacion.ts (regla única de quién la ve y la contesta); en el portal,
-- apps/asegura-portal/lib/datos-renovacion.ts (campana, lectura fail-closed) y app/(portal)/boveda/datos-renovacion/[id].
--
-- ⚠️ NO APLICADA. La aplica Alberto. Sin ella el código no escribe nada: el puerto contesta 503 `sin_migracion` y la campana
--    del portal no tiene ninguna (`[]`, la columna no existe).
--
-- Decisión: columnas en `solicitud_datos` y NO tabla nueva (a diferencia de la regularización de RC, 2026-11-03b): esta solicitud
-- SÍ va atada a una OPORTUNIDAD (la de la póliza, `abrirRiesgoDePoliza`) y reutiliza entero el formulario, la validación, el
-- cifrado, el Catastro y la escritura sin pisar del enlace de datos de hogar. Lo nuevo:
--   · `motivo`                     'renovacion_poliza' (NULL = el enlace de siempre, por token).
--   · `poliza_id`                  la póliza que se renueva (obligatoria con motivo; sin motivo, NULL).
--   · `publicada_at`/`publicada_por` el ✅ de Alberto. Sin él, el portal NO la ve ni la acepta: nada sale sin su OK.
--   · `revision_mensaje_id`        el último Telegram de revisión: solo ESE ✅ vale (rehacerla deja viejo el anterior).
--   · `respondida_por_papel`       'tomador' | 'autorizado'; `respondida_por_identidad_id` (sin FK a propósito: la identidad se
--                                  puede suprimir; el rastro está en el historial); `respondida_por_nombre` SOLO nombre de pila.
-- El token del enlace público de una solicitud de renovación se ROTA a uno que nadie conoce al crearla: solo se abre con sesión.
--
-- Portal (`prisma_asegura_portal`, SIN BYPASSRLS): SELECT columna a columna, solo lo que la campana necesita para decir «hay una»
-- (ni `campos`, ni `respuestas`, ni `borrador`, ni `token_hash`). Contestar va por el PUENTE (asegura cifra y valida).
-- Transaccional e idempotente. Se deshace con el bloque ROLLBACK del final.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE seguros.solicitud_datos
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS poliza_id uuid REFERENCES seguros.polizas(id),
  ADD COLUMN IF NOT EXISTS publicada_at timestamptz,
  ADD COLUMN IF NOT EXISTS publicada_por text,
  ADD COLUMN IF NOT EXISTS revision_mensaje_id bigint,
  ADD COLUMN IF NOT EXISTS respondida_por_papel text,
  ADD COLUMN IF NOT EXISTS respondida_por_identidad_id uuid,
  ADD COLUMN IF NOT EXISTS respondida_por_nombre text;

ALTER TABLE seguros.solicitud_datos DROP CONSTRAINT IF EXISTS solicitud_datos_renovacion_valida;
ALTER TABLE seguros.solicitud_datos ADD CONSTRAINT solicitud_datos_renovacion_valida CHECK (
  (motivo IS NULL OR motivo = 'renovacion_poliza')
  -- La póliza va con el motivo, y solo con él.
  AND ((motivo IS NULL) = (poliza_id IS NULL))
  -- Publicar y «quién contestó» solo existen en una de renovación.
  AND (motivo IS NOT NULL OR (publicada_at IS NULL AND respondida_por_papel IS NULL AND revision_mensaje_id IS NULL))
  -- Una de renovación solo se completa PUBLICADA (nadie la ve antes del ✅).
  AND (motivo IS NULL OR estado <> 'completada' OR publicada_at IS NOT NULL)
  AND (respondida_por_papel IS NULL OR respondida_por_papel IN ('tomador', 'autorizado'))
  AND (respondida_por_papel IS DISTINCT FROM 'autorizado' OR respondida_por_identidad_id IS NOT NULL)
  AND (respondida_por_papel IS NULL OR estado = 'completada')
  AND (respondida_por_nombre IS NULL OR char_length(respondida_por_nombre) <= 60)
  AND (publicada_por IS NULL OR char_length(publicada_por) <= 120)
);

CREATE INDEX IF NOT EXISTS solicitud_datos_renovacion_publicada
  ON seguros.solicitud_datos (correduria_id, cliente_id) WHERE motivo IS NOT NULL AND publicada_at IS NOT NULL AND estado = 'pendiente';

COMMENT ON COLUMN seguros.solicitud_datos.motivo IS
  'renovacion_poliza (2026-11-05d): datos pedidos por la app del portal para tarificar la renovación con los bots; NULL = enlace por token.';

-- El portal LEE solo esto (la campana). No escribe ninguna columna.
GRANT SELECT (id, correduria_id, cliente_id, poliza_id, ramo, motivo, estado, caduca_at, publicada_at) ON seguros.solicitud_datos TO prisma_asegura_portal;

COMMIT;

-- ─── Comprobación tras aplicar ────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema = 'seguros' and table_name = 'solicitud_datos'
--      and column_name in ('motivo','poliza_id','publicada_at','publicada_por','revision_mensaje_id',
--                          'respondida_por_papel','respondida_por_identidad_id','respondida_por_nombre');       -- 8 filas
--   select conname from pg_constraint where conrelid = 'seguros.solicitud_datos'::regclass
--      and conname = 'solicitud_datos_renovacion_valida';                                                    -- 1 fila
--   select column_name from information_schema.column_privileges
--    where table_schema = 'seguros' and table_name = 'solicitud_datos' and grantee = 'prisma_asegura_portal'
--    order by 1;                                    -- caduca_at, cliente_id, correduria_id, estado, id, motivo, poliza_id, publicada_at, ramo
--   select has_column_privilege('prisma_asegura_portal', 'seguros.solicitud_datos', 'respuestas', 'SELECT'); -- f
--   select has_column_privilege('prisma_asegura_portal', 'seguros.solicitud_datos', 'campos', 'SELECT');     -- f
--
-- ─── ROLLBACK (se pierden las solicitudes de renovación como tales; las de siempre quedan igual) ─────────────
--   BEGIN;
--   REVOKE SELECT (id, correduria_id, cliente_id, poliza_id, ramo, motivo, estado, caduca_at, publicada_at) ON seguros.solicitud_datos FROM prisma_asegura_portal;
--   UPDATE seguros.solicitud_datos SET estado = 'anulada' WHERE motivo IS NOT NULL AND estado = 'pendiente';
--   DROP INDEX IF EXISTS seguros.solicitud_datos_renovacion_publicada;
--   ALTER TABLE seguros.solicitud_datos DROP CONSTRAINT IF EXISTS solicitud_datos_renovacion_valida;
--   ALTER TABLE seguros.solicitud_datos DROP COLUMN IF EXISTS respondida_por_nombre, DROP COLUMN IF EXISTS respondida_por_identidad_id,
--     DROP COLUMN IF EXISTS respondida_por_papel, DROP COLUMN IF EXISTS revision_mensaje_id, DROP COLUMN IF EXISTS publicada_por,
--     DROP COLUMN IF EXISTS publicada_at, DROP COLUMN IF EXISTS poliza_id, DROP COLUMN IF EXISTS motivo;
--   COMMIT;
