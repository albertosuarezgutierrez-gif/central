-- Eliminar CHECK constraint hardcodeado en mesas.zona
-- El constraint original solo permitía: 'salon', 'terraza', 'barra'
-- Ahora las zonas son dinámicas (tabla zonas) y pueden tener cualquier tipo
-- La integridad se mantiene vía zona_id (FK a zonas.id) + lógica de aplicación
--
-- Aplicado en producción: 12 mayo 2026
ALTER TABLE mesas DROP CONSTRAINT IF EXISTS mesas_zona_check;
