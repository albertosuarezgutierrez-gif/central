-- 2026-10-28 — Ramo propio de PATINETE ELÉCTRICO / VMP (decisión de Alberto, 28/10/2026).
-- Hasta hoy el lead web `patinete-electrico` caía en «otros». Desde ahora es `patinete` en todo el CRM
-- (`RAMOS_OPORTUNIDAD` de `@central/module-seguros`). No tarifica (ni Avant2 ni bot activo): sus datos del riesgo
-- van en `info_riesgo.datosRiesgoLibre` con campos propios (marca, modelo, inscripción DGT, certificado…).
--
-- CÓDIGO ANTES QUE SQL: sin esto, escribir una oportunidad `patinete` falla con 22P02 («invalid input value for
-- enum tipo_seguro») y el puerto contesta 503 `sin_migracion` (alta a mano) o el lead web sale «sin enlace» (la
-- ficha del lead se registra igual). Ningún otro ramo cambia.
--
-- ⚠️ Se aplica A MANO, en DOS PASOS (no lo ejecuta ningún despliegue):
--   PASO 1: `ALTER TYPE ... ADD VALUE` no puede ir dentro de un BEGIN/COMMIT junto a sentencias que USEN el valor
--           nuevo; va sola. Es IRREVERSIBLE (un valor de enum no se puede quitar). Idempotente (IF NOT EXISTS).
--   PASO 2: el CHECK de `solicitud_datos.ramo` (el enlace `/datos/<token>`), en su transacción. Idempotente: borra
--           cualquier CHECK de la tabla que mencione `ramo` y crea el de nombre fijo con la lista completa.
-- La lista del PASO 2 es `RAMOS_OPORTUNIDAD`; la vigila `apps/asegura/lib/lead-web-solicitud.test.ts`.
--
-- NO se amplía `borradores_presupuesto.ramo` (2026-10-05, solo auto/moto/hogar/salud/vida/decesos): son los ramos
-- con cotizador; el patinete no tarifica y no genera borrador de presupuesto.
--
-- Verificación tras aplicarlo:
--   SELECT enum_range(NULL::seguros.tipo_seguro);   -- … 'caucion', 'patinete', 'otros'
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'solicitud_datos_ramo_check';

-- ── PASO 1 (sola, fuera de transacción) ─────────────────────────────────────
ALTER TYPE seguros.tipo_seguro ADD VALUE IF NOT EXISTS 'patinete' BEFORE 'otros';

-- ── PASO 2 ──────────────────────────────────────────────────────────────────
BEGIN;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'seguros.solicitud_datos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%ramo%'
  LOOP
    EXECUTE format('ALTER TABLE seguros.solicitud_datos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE seguros.solicitud_datos ADD CONSTRAINT solicitud_datos_ramo_check CHECK (ramo IN (
  'auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'accidentes',
  'empresas', 'rc_profesional', 'dyo', 'flotas', 'transporte_mercancias', 'ciberriesgos', 'decenal', 'embarcaciones',
  'mascotas', 'impago_alquiler', 'viaje', 'caucion', 'patinete', 'otros'
));

COMMIT;
