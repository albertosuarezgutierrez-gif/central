-- 2026-09-23 — Para qué RAMOS vale el WhatsApp de siniestros de una compañía.
--
-- Mapfre publica un WhatsApp (+34 920 750 075, L-V 8:00-20:00) que solo sirve para
-- «partes de hogar» y «autorizaciones médicas» (captura de mapfre.es aportada por
-- Alberto el 23/09/2026). En `whatsapp_siniestros` a secas se lo enseñaríamos a los
-- clientes de auto, y un parte mandado a una línea que no le corresponde no falla:
-- se queda sin contestar. Vacío = vale para todos los ramos.
--
-- Códigos = los de `polizas.tipo` (auto, hogar, moto, responsabilidad_civil…).
-- ADITIVA. Reversible: ALTER TABLE seguros.companias_dgs DROP COLUMN whatsapp_siniestros_ramos.

ALTER TABLE seguros.companias_dgs
  ADD COLUMN IF NOT EXISTS whatsapp_siniestros_ramos text[] NOT NULL DEFAULT '{}';

-- Vacío = todos los ramos (NOT NULL porque Prisma no admite listas opcionales). Un ramo sin
-- WhatsApp no significa nada.
ALTER TABLE seguros.companias_dgs DROP CONSTRAINT IF EXISTS companias_dgs_whatsapp_ramos_coherente;
ALTER TABLE seguros.companias_dgs ADD CONSTRAINT companias_dgs_whatsapp_ramos_coherente
  CHECK (cardinality(whatsapp_siniestros_ramos) = 0 OR whatsapp_siniestros IS NOT NULL);

GRANT SELECT (whatsapp_siniestros_ramos) ON seguros.companias_dgs TO prisma_asegura_portal;

COMMENT ON COLUMN seguros.companias_dgs.whatsapp_siniestros_ramos IS
  'Ramos (codigos de polizas.tipo) para los que vale whatsapp_siniestros. Vacio = todos. Mapfre: solo hogar.';
