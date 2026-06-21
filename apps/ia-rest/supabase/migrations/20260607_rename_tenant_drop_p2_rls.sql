-- Fase 3 DROP paso 2: regenerar políticas RLS restaurante_id -> local_id (atómico, sin ventana).
do $$
declare r record; q text; wc text; stmt text; roles_txt text;
begin
  for r in select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies where schemaname='public'
      and (coalesce(qual,'')||coalesce(with_check,'')) ~ '\mrestaurante_id\M'
  loop
    roles_txt := array_to_string(r.roles, ', ');
    q  := case when r.qual       is not null then regexp_replace(r.qual,       '\mrestaurante_id\M','local_id','g') end;
    wc := case when r.with_check is not null then regexp_replace(r.with_check, '\mrestaurante_id\M','local_id','g') end;
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    stmt := format('create policy %I on public.%I as %s for %s to %s', r.policyname, r.tablename, r.permissive, r.cmd, roles_txt);
    if q  is not null then stmt := stmt || ' using ('  || q  || ')'; end if;
    if wc is not null then stmt := stmt || ' with check (' || wc || ')'; end if;
    execute stmt;
  end loop;
end $$;
