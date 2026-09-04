-- Foto del plan del backfill del blind index de DNI (APLICADO el 04/09/2026).
--
-- Por qué existe: el plan EN SECO (`GET /api/operador/backfill-dni`) es lo único que sabe
-- qué fichas comparten el MISMO DNI —el criterio fuerte de fusión— porque descifra con
-- `PII_ENCRYPTION_KEY`, que solo tiene la app. Pero el resultado se quedaba en la respuesta
-- HTTP: `/correduria/mantenimiento` pinta los recuentos y los grupos (la lista de fusiones)
-- se perdían al cerrar la pestaña. El lote SQL de fusión se escribe desde la BD, así que
-- la app deja aquí la foto cada vez que calcula el plan (GET o POST).
--
-- Qué guarda: UNA fila (id = 1, se sobreescribe). `resumen` son los recuentos y `choques`
-- los grupos como listas de uuid de `seguros.clientes` + `hay_preexistente`. **Sin PII**:
-- ni DNI, ni hash, ni nombre — solo ids.
--
-- Quién lee: la sesión que prepara el lote de fusión (`prisma/sql/*_fusion_*.sql`), con los
-- nombres delante de Alberto. Esta tabla no fusiona nada.

create table if not exists seguros.backfill_dni_plan (
  id            smallint primary key default 1 check (id = 1),
  calculado_en  timestamptz not null default now(),
  seco          boolean not null,
  correduria_id uuid not null,
  resumen       jsonb not null,
  choques       jsonb not null
);

comment on table seguros.backfill_dni_plan is
  'Foto (una fila) del último plan del backfill del blind index de DNI: recuentos + grupos de fichas con el mismo DNI (solo uuids). La escribe apps/asegura en GET/POST /api/operador/backfill-dni.';

grant select, insert, update, delete on seguros.backfill_dni_plan to prisma_seguros;
grant select, insert, update, delete on seguros.backfill_dni_plan to crm_seguros;
