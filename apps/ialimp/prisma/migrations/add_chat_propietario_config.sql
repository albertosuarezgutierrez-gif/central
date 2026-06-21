-- =====================================================================
-- Migración: chat propietario configurable
-- visible_limpiadora por mensaje + config default por cliente
-- =====================================================================

-- 1. Campo visible_limpiadora en chat_mensajes
ALTER TABLE chat_mensajes
  ADD COLUMN IF NOT EXISTS visible_limpiadora BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leido_propietario  BOOLEAN NOT NULL DEFAULT false;

-- 2. Config de chat por cliente (propietario)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS chat_config JSONB NOT NULL DEFAULT '{
    "default_visible_limpiadora": false,
    "limpiadora_puede_responder": false
  }'::jsonb;

-- 3. Índice para buscar mensajes de una sesión visibles a limpiadora
CREATE INDEX IF NOT EXISTS idx_chat_sesion_visible
  ON chat_mensajes(sesion_id, visible_limpiadora)
  WHERE sesion_id IS NOT NULL;

COMMENT ON COLUMN chat_mensajes.visible_limpiadora IS
  'Si true, la limpiadora asignada a esa sesión puede leer el mensaje';
COMMENT ON COLUMN clientes.chat_config IS
  'Configuración por defecto del chat: visible_limpiadora, limpiadora_puede_responder';
