-- ============================================================
-- 20260607_rename_tenant_expand_fase1.sql
-- EXPAND (Fase 1) del rename restaurante_id -> local_id (expand-contract, zero-downtime).
-- ============================================================
-- Añade local_id en paralelo a restaurante_id en TODAS las BASE TABLE que tienen
-- restaurante_id, lo rellena (backfill) y mantiene ambas columnas sincronizadas con
-- un trigger BEFORE INSERT OR UPDATE. Así el código actual (restaurante_id) sigue
-- funcionando y el código nuevo puede ir migrando a local_id sin romper nada.
-- FASES siguientes:
--   2) MIGRATE: cambiar el código (352 ficheros) de restaurante_id -> local_id por lotes.
--      OJO: el objeto de sesión firmado (HMAC) usa la clave restaurante_id → migrar con
--      compatibilidad en lib/session.ts y login (no romper sesiones en curso).
--   3) CONTRACT: cuando ningún código use restaurante_id, eliminar la columna + triggers.
-- Idempotente. Aplicada al remoto el 2026-06-07.

create or replace function sync_local_restaurante_id() returns trigger language plpgsql as $$
begin
  if NEW.local_id is null and NEW.restaurante_id is not null then
    NEW.local_id := NEW.restaurante_id;
  end if;
  if NEW.restaurante_id is null and NEW.local_id is not null then
    NEW.restaurante_id := NEW.local_id;
  end if;
  return NEW;
end $$;

do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'restaurante_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I add column if not exists local_id uuid', r.table_name);
    execute format('update public.%I set local_id = restaurante_id where local_id is null and restaurante_id is not null', r.table_name);
    execute format('drop trigger if exists trg_sync_local_id on public.%I', r.table_name);
    execute format('create trigger trg_sync_local_id before insert or update on public.%I for each row execute function sync_local_restaurante_id()', r.table_name);
  end loop;
end $$;
