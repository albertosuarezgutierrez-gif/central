-- Parte de siniestro del portal: campos por RAMO y tipos para todos los ramos (03/10/2026).
--
-- ADITIVA. No toca filas existentes:
--   1. `datos_ramo jsonb` NULLABLE: las respuestas por ramo del cliente
--      (`parte-ramo.ts` de `@central/module-seguros-portal`). NULL = no contestó
--      nada (o ramo desconocido). Claves ausentes dentro = «no lo sé». La culpa
--      que cuenta el cliente va como `culpaPropiaDeclarada` (DECLARACIÓN): nunca
--      pisa la posición de la compañía (`siniestros.posicion_cima`).
--   2. El CHECK de `tipo_siniestro` se AMPLÍA a la nueva lista cerrada. Las diez
--      claves del 26/09/2026 siguen dentro, así que las filas ya guardadas pasan.
--      La lista es la MISMA que `TIPOS_SINIESTRO` (la vigila
--      `packages/module-seguros-portal/src/tipo-siniestro.test.ts`).
--
-- GRANT: el rol del portal tiene `SELECT, INSERT` a nivel de TABLA
-- (`2026-09-03_portal_parte_siniestro.sql`), que cubre la columna nueva; el
-- corredor (`prisma_seguros`) tiene `SELECT, UPDATE`. No hace falta GRANT nuevo.
--
-- 🚨 Aplicar ANTES (o en el mismo paso) que el despliegue de asegura-portal y de
-- asegura: los dos `schema` de Prisma ya leen/escriben `datos_ramo`, y sin la
-- columna fallan con 42703.
ALTER TABLE seguros.portal_parte_siniestro
  ADD COLUMN IF NOT EXISTS datos_ramo jsonb;

ALTER TABLE seguros.portal_parte_siniestro
  DROP CONSTRAINT IF EXISTS portal_parte_datos_ramo_objeto_check;
ALTER TABLE seguros.portal_parte_siniestro
  ADD CONSTRAINT portal_parte_datos_ramo_objeto_check CHECK (
    datos_ramo IS NULL OR jsonb_typeof(datos_ramo) = 'object'
  );

ALTER TABLE seguros.portal_parte_siniestro
  DROP CONSTRAINT IF EXISTS portal_parte_tipo_siniestro_check;
ALTER TABLE seguros.portal_parte_siniestro
  ADD CONSTRAINT portal_parte_tipo_siniestro_check CHECK (
    tipo_siniestro IS NULL OR tipo_siniestro IN ('colision', 'lunas', 'robo', 'averia', 'agua', 'incendio', 'cristales', 'electrico', 'danos_terceros', 'otro', 'atropello', 'animal', 'choque_objeto', 'danos_aparcado', 'atasco', 'filtraciones', 'explosion', 'vandalismo', 'atmosferico', 'asistencia', 'averia_equipos', 'mercancias', 'reclamacion', 'defensa_juridica', 'reembolso_salud', 'asistencia_sanitaria', 'subsidio', 'fallecimiento', 'invalidez', 'rescate', 'accidente_deportivo', 'accidente_domestico', 'accidente_laboral', 'caida', 'accidente_otro', 'danos_materiales')
  );
