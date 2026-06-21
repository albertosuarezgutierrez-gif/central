-- Convenio colectivo de aplicación de la empresa (código REGCON + nombre). Determina, según
-- el convenio, los días de permisos, tablas salariales, etc. Editable desde «Mi cuenta».
alter table rrhh.empresas add column if not exists convenio_codigo text;
alter table rrhh.empresas add column if not exists convenio_nombre text;
