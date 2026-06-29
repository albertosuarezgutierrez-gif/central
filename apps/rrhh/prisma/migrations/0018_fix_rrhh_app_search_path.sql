-- Establece search_path por defecto para rrhh_app a nivel de rol.
-- Previene errores "relation does not exist" cuando el DATABASE_URL no lleva ?schema=rrhh
-- o cuando el pooler (Supavisor transaction mode) descarta el SET SESSION search_path.
ALTER ROLE rrhh_app SET search_path = rrhh, public;
