-- Huella anti-duplicado de la cotización — apps/asegura (08/10/2026)
-- ============================================================================
-- Codeoscopic cobra 0,50 € por cada POST /insurances con 200, también si es la misma petición repetida.
-- `cotizar()` calcula sha256(cuerpo canónico + ramo + correduría) y, bajo pg_advisory_xact_lock, no llama
-- si ya hay una fila con esa huella reservada o facturable en los últimos 15 min. Solo se guarda la
-- huella: nunca el cuerpo ni datos personales.
--
-- Nullable a propósito: las filas anteriores y las de emisión/límites/importadas no tienen huella
-- («no se sabe»), y no deben tratarse como duplicadas de nada. Los grants de la tabla no cambian
-- (`prisma_seguros` ya tiene select/insert/update sobre ella; una columna nueva los hereda).
-- Idempotente. Aplicar ANTES de desplegar el código: sin la columna, reservar() falla y NO se cotiza.
alter table seguros.codeoscopic_consumo add column if not exists huella text;

create index if not exists codeoscopic_consumo_huella_idx
  on seguros.codeoscopic_consumo (correduria_id, huella, creado_at desc)
  where huella is not null;

comment on column seguros.codeoscopic_consumo.huella is
  'sha256 hex de cuerpo canónico + ramo + correduría. Anti-duplicado 15 min. NULL = sin huella (no se sabe).';
