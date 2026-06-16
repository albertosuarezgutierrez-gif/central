-- Resultado del agente "especialista en convenios": datos clave del convenio (días de permisos,
-- jornada, vacaciones, fuente) extraídos por IA, ORIENTATIVOS. Reutilizable por cualquier empresa.
alter table rrhh.empresas add column if not exists convenio_datos jsonb;
alter table rrhh.empresas add column if not exists convenio_actualizado_at timestamptz;
