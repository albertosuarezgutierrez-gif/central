-- 2026-11-05a — HUELLA del riesgo de los trabajos de TARIFICAR: sin trabajos duplicados vivos + caché de 24 h.
-- Código: apps/asegura/lib/tarificador-huella.ts (puro) y encolarTrabajo en apps/asegura/lib/tarificador.ts.
-- Revisión de arquitectura del 04/11/2026, punto 4 (idempotencia del bot y caché).
--
-- Qué es: `riesgo_huella` = HMAC-SHA256 (secreto TARIFICADOR_WORKER_SECRET, como la caché de matrículas) del encargo COMPLETO
-- (correduría, cliente, oportunidad, póliza, compañía, ramo, modo y riesgo guardado en JSON canónico). NO hay datos personales
-- en claro: sin el secreto no se puede tantear. Solo `modo = 'tarificar'` y nunca hogar (el código la deja NULL).
--   1. Índice único parcial de VIVOS (pendiente, en_curso, error_reintentable): dos pulsaciones a la vez no crean dos trabajos
--      (el INSERT lleva `on conflict do nothing` y devuelve el que ya había). `atascado` NO entra: su bloqueo caduca a las 24 h
--      en el código (bloqueaDuplicado) y un índice lo haría eterno si el barrido no llegara.
--   2. Índice de apoyo para la caché: un `ok` con precio de < 24 h con la misma huella se devuelve en vez de lanzar otro bot.
--
-- ⚠️ NO APLICADA. El código es fail-safe sin ella (`hayRiesgoHuella()` = false → sin huella, sin índice ni caché; el duplicado
-- por igualdad jsonb y la ventana de 10 min siguen como siempre). Rotar TARIFICADOR_WORKER_SECRET invalida las huellas (como
-- mucho se pierde la caché del día). Transaccional.
--
-- Comprobación previa (debe dar 0 filas; con la columna recién creada siempre es así):
--   select correduria_id, riesgo_huella, count(*) from seguros.tarificacion_trabajos
--    where riesgo_huella is not null and estado in ('pendiente','en_curso','error_reintentable') group by 1,2 having count(*) > 1;
--
-- Rollback: bloque ROLLBACK comentado al final.

BEGIN;

SET search_path = seguros, public;

ALTER TABLE seguros.tarificacion_trabajos ADD COLUMN IF NOT EXISTS riesgo_huella text;

ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_huella_valida;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_huella_valida
  CHECK (riesgo_huella IS NULL OR (riesgo_huella ~ '^[0-9a-f]{64}$' AND coalesce(modo, 'tarificar') = 'tarificar' AND ramo <> 'hogar'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_tarificar_huella_vivo
  ON seguros.tarificacion_trabajos (correduria_id, riesgo_huella)
  WHERE riesgo_huella IS NOT NULL AND estado IN ('pendiente', 'en_curso', 'error_reintentable');

CREATE INDEX IF NOT EXISTS idx_trabajo_tarificar_huella_ok
  ON seguros.tarificacion_trabajos (correduria_id, riesgo_huella, terminado_at DESC)
  WHERE riesgo_huella IS NOT NULL AND estado = 'ok';

COMMENT ON COLUMN seguros.tarificacion_trabajos.riesgo_huella IS
  'HMAC-SHA256 (TARIFICADOR_WORKER_SECRET) del encargo de tarificar completo (sin datos en claro). Índice único de vivos + caché 24 h. NULL = sin huella (hogar, otro modo, sin secreto).';

COMMIT;

-- ROLLBACK (seguro en cualquier momento: el código vuelve solo al camino sin huella):
-- BEGIN;
-- DROP INDEX IF EXISTS seguros.idx_trabajo_tarificar_huella_ok;
-- DROP INDEX IF EXISTS seguros.idx_trabajo_tarificar_huella_vivo;
-- ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_huella_valida;
-- ALTER TABLE seguros.tarificacion_trabajos DROP COLUMN IF EXISTS riesgo_huella;
-- COMMIT;
