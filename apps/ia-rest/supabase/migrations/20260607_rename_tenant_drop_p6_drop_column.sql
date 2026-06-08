-- Fase 3 DROP paso 6 (CONTRACT final): eliminar la columna restaurante_id de todas las tablas base.
-- Data-safe (local_id es copia idéntica). CASCADE elimina FKs/índices/uniques/PK viejos sobre restaurante_id.
do $$ declare r record; begin
  for r in select t.table_name from information_schema.tables t
    where t.table_schema='public' and t.table_type='BASE TABLE'
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name and c.column_name='restaurante_id')
  loop execute format('alter table public.%I drop column restaurante_id cascade', r.table_name); end loop;
end $$;
