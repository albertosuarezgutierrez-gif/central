-- Fichaje desde el taller: la empresa debe HABILITAR a ese taller (05/11/2026). Aditiva e idempotente. NO aplicada a la BD real desde el código.
-- Antes bastaba un `empresa_id` cualquiera en el cuerpo para fichar contra CUALQUIER empresa de rrhh (el dueño del taller podía fijarlo en Ajustes).
-- Ahora `POST /api/operador/fichajes` recibe también `taller_id` y solo ficha si `empresas.fichaje_taller_id` es ese taller. NULL = «sin habilitar»
-- (nadie ficha). Solo lo fija el operador (`PUT /api/operador/empresas/fichaje-taller`, RRHH_OPERADOR_SECRET). Sin FK: el taller vive en otro schema.
-- 🚨 Aplicar ANTES de desplegar el endpoint nuevo; después habilitar cada taller (PUT) o el fichaje desde el taller dejará de funcionar.
ALTER TABLE rrhh.empresas ADD COLUMN IF NOT EXISTS fichaje_taller_id uuid;
CREATE INDEX IF NOT EXISTS idx_empresas_fichaje_taller ON rrhh.empresas (fichaje_taller_id) WHERE fichaje_taller_id IS NOT NULL;
