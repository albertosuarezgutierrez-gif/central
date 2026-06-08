-- Fase 3 DROP paso 3: recrear vistas para usar local_id y NO referenciar restaurante_id.
do $$
declare r record; def text; newdef text;
begin
  create temp table _vdefs(name text, ddl text) on commit drop;
  for r in select v.table_name from information_schema.views v where v.table_schema='public'
    and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v.table_name and c.column_name='restaurante_id')
  loop
    def := pg_get_viewdef(('public.'||quote_ident(r.table_name))::regclass, true);
    newdef := regexp_replace(def, '\mrestaurante_id\M', 'local_id', 'g');
    newdef := regexp_replace(newdef, ',\s*local_id AS local_id', '', 'g');
    newdef := regexp_replace(newdef, ';\s*$', '');
    insert into _vdefs values (r.table_name, newdef);
  end loop;
  for r in select name from _vdefs loop execute format('drop view if exists public.%I cascade', r.name); end loop;
  for i in 1..10 loop
    for r in select name, ddl from _vdefs d where not exists (select 1 from pg_views v where v.schemaname='public' and v.viewname=d.name) loop
      begin execute format('create view public.%I as %s', r.name, r.ddl); exception when others then null; end;
    end loop;
    exit when not exists (select 1 from _vdefs d where not exists (select 1 from pg_views v where v.schemaname='public' and v.viewname=d.name));
  end loop;
  if exists (select 1 from _vdefs d where not exists (select 1 from pg_views v where v.schemaname='public' and v.viewname=d.name)) then
     raise exception 'no se pudieron recrear todas las vistas'; end if;
end $$;
