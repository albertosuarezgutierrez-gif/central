-- Imagen del bot del tarificador RPA desde la BD (27/10/2026). Reglas puras en apps/asegura/lib/tarificador-imagen-reglas.ts;
-- BD en apps/asegura/lib/tarificador-imagen.ts.
--
--   1. `tarificador_imagen` (UNA fila, clave 'produccion'): la imagen con la que se lanzan las máquinas de Fly. MANDA sobre la
--      env `TARIFICADOR_FLY_IMAGE` de Vercel (central-asegura), que queda de RESPALDO (sin fila, sin tabla o valor raro → env).
--      La escribe SOLO el workflow `tarificador-rpa-imagen.yml` lanzado sobre `main`, por el puerto de operador
--      (`POST /api/operador/tarificador/imagen`, Bearer ASEGURA_OPERADOR_SECRET). Nunca SQL desde Actions. El endpoint rechaza
--      una imagen de un commit ANTERIOR al de la vigente salvo `forzar: true` («No poner una imagen anterior»).
--      `permitir_imagen_prueba` (false por defecto): interruptor de Alberto para que `probar` acepte una imagen `rama-*`.
--   2. `tarificacion_trabajos.imagen_prueba` (la pidió `probar`, solo para ese trabajo) e `imagen_bot` (con la que se lanzó
--      su última máquina: se ve en la bandeja).
--
-- Código ANTES que el SQL: sin esta migración asegura usa la env como hasta hoy y `probar` con `imagen` responde 403.
-- Idempotente. Sin PII (solo referencias de imagen y el actor).
--
-- Se deshace con:
--   DROP TABLE seguros.tarificador_imagen;
--   ALTER TABLE seguros.tarificacion_trabajos DROP COLUMN imagen_prueba, DROP COLUMN imagen_bot;
BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.tarificador_imagen (
  clave                  text PRIMARY KEY CHECK (clave = 'produccion'),
  imagen                 text NOT NULL
                         CHECK (imagen ~ '^registry\.fly\.io/asegura-tarificador:[a-z0-9][a-z0-9._-]{0,63}$' AND imagen !~ ':rama-'),
  -- Fecha del commit construido: ordena las imágenes (NULL = no se sabe; no bloquea la siguiente).
  commit_at              timestamptz,
  -- La vigente justo antes (vuelta atrás: publicarla otra vez con `forzar: true`).
  imagen_anterior        text,
  permitir_imagen_prueba boolean NOT NULL DEFAULT false,
  actualizada_at         timestamptz NOT NULL DEFAULT now(),
  actualizada_por        text NOT NULL
);

COMMENT ON TABLE seguros.tarificador_imagen IS
  'Imagen de producción del bot del tarificador RPA (manda sobre la env TARIFICADOR_FLY_IMAGE, que queda de respaldo). '
  'La escribe el workflow tarificador-rpa-imagen.yml desde main por el puerto de operador. No poner una imagen anterior.';
COMMENT ON COLUMN seguros.tarificador_imagen.permitir_imagen_prueba IS
  'Interruptor de Alberto: con true, POST /api/operador/tarificador/probar acepta { imagen: rama-* } para UN trabajo.';

-- Fila inicial: la imagen de producción vigente (main-c5e69e6, commit del 27/10/2026 18:06:46 +01:00), interruptor apagado.
INSERT INTO seguros.tarificador_imagen (clave, imagen, commit_at, permitir_imagen_prueba, actualizada_por)
VALUES ('produccion', 'registry.fly.io/asegura-tarificador:main-c5e69e6', '2026-10-27T18:06:46+01:00', false, 'sql:2026-10-27_tarificador_imagen')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE seguros.tarificacion_trabajos ADD COLUMN IF NOT EXISTS imagen_prueba text;
ALTER TABLE seguros.tarificacion_trabajos ADD COLUMN IF NOT EXISTS imagen_bot text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarificacion_trabajos_imagen_prueba_check') THEN
    ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_imagen_prueba_check
      CHECK (imagen_prueba IS NULL OR imagen_prueba ~ '^registry\.fly\.io/asegura-tarificador:rama-[a-z0-9._-]{1,59}$');
  END IF;
END $$;

COMMENT ON COLUMN seguros.tarificacion_trabajos.imagen_prueba IS
  'Imagen de rama (rama-*) pedida por probar SOLO para este trabajo (requiere tarificador_imagen.permitir_imagen_prueba).';
COMMENT ON COLUMN seguros.tarificacion_trabajos.imagen_bot IS
  'Imagen con la que se lanzó la última máquina de Fly de este trabajo (NULL = anterior al 27/10/2026 o sin lanzar).';

-- Permisos (solo la app). Sin DELETE: la fila es configuración con rastro.
ALTER TABLE seguros.tarificador_imagen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_imagen FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_imagen TO prisma_seguros;
REVOKE DELETE ON seguros.tarificador_imagen FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select clave, imagen, commit_at, permitir_imagen_prueba, actualizada_por from seguros.tarificador_imagen;  -- 1 fila, false
--   select column_name from information_schema.columns
--    where table_schema = 'seguros' and table_name = 'tarificacion_trabajos' and column_name in ('imagen_prueba', 'imagen_bot');  -- 2
-- Encender el interruptor (Alberto):
--   update seguros.tarificador_imagen set permitir_imagen_prueba = true, actualizada_at = now(), actualizada_por = 'alberto'
--    where clave = 'produccion';
-- ════════════════════════════════════════════════════════════════════════════
