-- 2026-09-23 — 🚨 Aplicar SOLO DESPUÉS de desplegar el portal que lee `whatsapp_siniestros_ramos`.
-- Con el portal anterior, el WhatsApp de hogar de Mapfre se enseñaría también a los clientes de
-- auto (se probó a aplicar antes y se revirtió el mismo día por eso).
-- Mapfre C0058: su WhatsApp de partes, solo hogar. No tiene teléfono de voz para dar parte,
-- así que el horario de la línea de siniestros ES el del WhatsApp.
UPDATE seguros.companias_dgs
   SET whatsapp_siniestros = '+34920750075',
       whatsapp_siniestros_ramos = ARRAY['hogar'],
       horario_siniestros = coalesce(horario_siniestros, 'de lunes a viernes, de 8:00 a 20:00'),
       telefono_verificado_en = '2026-09-23',
       updated_at = now()
 WHERE codigo_dgs = 'C0058' AND whatsapp_siniestros IS NULL;
