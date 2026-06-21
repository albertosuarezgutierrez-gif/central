
-- Ampliar chat_config con permisos de visibilidad para el propietario
-- ver_checklist: el propietario puede ver el checklist completado
-- ver_fotos: el propietario puede ver las fotos de la limpieza
UPDATE clientes
SET chat_config = chat_config || '{"ver_checklist": false, "ver_fotos": false}'::jsonb
WHERE chat_config IS NOT NULL
  AND NOT (chat_config ? 'ver_checklist');

-- Para los que aún no tienen chat_config
UPDATE clientes
SET chat_config = '{"default_visible_limpiadora": false, "limpiadora_puede_responder": false, "ver_checklist": false, "ver_fotos": false}'::jsonb
WHERE chat_config IS NULL;
