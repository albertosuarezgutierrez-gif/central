-- Auditoría post-rename: el trigger que garantizaba el tenant se eliminó en el DROP.
-- 1) Restaurar local_id NOT NULL en tablas base sin nulls (try/catch por tabla).
-- 2) config_tienda perdió su PK (estaba sobre restaurante_id) -> PRIMARY KEY (local_id).
-- (Aplicada al remoto 2026-06-08 vía MCP; ver historial de migraciones de Supabase para el DO-block.)
do $$
declare r record; nulls bigint;
begin
  for r in select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public' and c.column_name='local_id' and c.is_nullable='YES' and t.table_type='BASE TABLE'
  loop
    begin
      execute format('select count(*) from public.%I where local_id is null', r.table_name) into nulls;
      if nulls = 0 then execute format('alter table public.%I alter column local_id set not null', r.table_name); end if;
    exception when others then raise notice 'skip %: %', r.table_name, SQLERRM;
    end;
  end loop;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint con join pg_class cl on cl.oid=con.conrelid join pg_namespace nn on nn.oid=cl.relnamespace where nn.nspname='public' and cl.relname='config_tienda' and con.contype='p') then
    begin execute 'alter table public.config_tienda alter column local_id set not null'; exception when others then null; end;
    execute 'alter table public.config_tienda add primary key (local_id)';
  end if;
end $$;
