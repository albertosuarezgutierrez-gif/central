-- Topes APRENDIDOS del historial del seguro anterior — apps/asegura (29/09/2026)
-- ============================================================================
-- Alberto: el historial (años asegurado, en la compañía, sin siniestros) se declara al MÁXIMO y
-- la compañía aplica el bonus real contrastando el nº de póliza con SINCO. Si el vendor rechaza
-- un valor por alto (400 de validación, que NO se cobra), el tope se guarda aquí y todas las
-- cotizaciones siguientes lo respetan: el error sale una vez y no vuelve.
--
-- Una fila por campo del vendor (`risk.previousInsurance.<campo>`). Global y no por correduría:
-- es una regla del vendor, igual para todos.

create table if not exists seguros.codeoscopic_topes_historial (
  campo         text        primary key
                check (campo in ('totalYearsInsured', 'yearsInPreviousCompany', 'yearsWithoutAccidents')),
  maximo        integer     not null check (maximo between 1 and 99),
  -- El texto del vendor que lo enseñó: sin él, un tope es un número que nadie sabe de dónde salió.
  mensaje       text        not null,
  aprendido_at  timestamptz not null default now()
);

grant select, insert, update on seguros.codeoscopic_topes_historial to prisma_seguros;

comment on table seguros.codeoscopic_topes_historial is
  'Topes del historial del seguro anterior aprendidos de los 400 de Codeoscopic. Se aplican antes '
  'de cada cotización de motor; se bajan, nunca se suben solos.';
