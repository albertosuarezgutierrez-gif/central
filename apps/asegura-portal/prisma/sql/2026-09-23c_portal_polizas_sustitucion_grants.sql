-- El portal esconde la póliza sustituida (cliente que se cambia de compañía: caso José Suárez,
-- 23/09/2026) y dice en la nueva a quién sustituye. Para eso lee dos columnas NUESTRAS de
-- `polizas` (CIMA no las escribe). Sin GRANT de columna, la consulta entera de la cartera fallaría.
grant select (sustituida_at, poliza_origen_id) on seguros.polizas to prisma_asegura_portal;
