-- 2026-10-25 — El enlace de datos (`/datos/<token>`) para TODOS los ramos de oportunidad, no solo moto/auto.
-- Alberto: el lead web de cualquier ramo abre oportunidad + enlace, igual que coche/moto. La definición de qué se
-- pide por ramo vive en `@central/module-seguros` (`camposSolicitud`); aquí solo se abre el CHECK de `ramo`.
--
-- CÓDIGO ANTES QUE SQL: sin esto, una solicitud de un ramo nuevo falla con 23514 y el lead web se degrada a «sin
-- enlace» (puerto 503 `sin_migracion`), como antes del 25/10. Auto y moto siguen funcionando igual.
--
-- La lista es `RAMOS_OPORTUNIDAD` (= `RAMOS_SOLICITUD`); la vigila `apps/asegura/lib/lead-web-solicitud.test.ts`.
-- El CHECK original era anónimo (inline en el CREATE TABLE de 2026-09-24k): se borra cualquier CHECK de la tabla
-- que mencione `ramo`, sea cual sea su nombre, y se crea uno con nombre fijo.
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
  'mascotas', 'impago_alquiler', 'viaje', 'caucion', 'otros'
));

COMMIT;
