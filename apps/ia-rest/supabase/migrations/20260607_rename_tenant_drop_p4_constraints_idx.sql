-- Fase 3 DROP paso 4: espejar en local_id los uniques/PK, FKs e índices de restaurante_id.
-- 4a uniques (+PK->unique como destino de FKs)
do $$ declare r record; newdef text; newname text; begin
  for r in select con.oid, t.relname tbl, pg_get_constraintdef(con.oid) def
    from pg_constraint con join pg_class t on t.oid=con.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and con.contype in ('u','p') and pg_get_constraintdef(con.oid) ~ '\mrestaurante_id\M'
  loop
    newdef := regexp_replace(r.def, '\mrestaurante_id\M', 'local_id', 'g');
    newdef := regexp_replace(newdef, '^PRIMARY KEY', 'UNIQUE');
    newname := left(r.tbl,38) || '_lid_key_' || r.oid;
    begin execute format('alter table public.%I add constraint %I %s', r.tbl, newname, newdef);
    exception when duplicate_table or duplicate_object then null; end;
  end loop;
end $$;
-- 4b FKs
do $$ declare r record; newdef text; newname text; begin
  for r in select con.oid, t.relname tbl, pg_get_constraintdef(con.oid) def
    from pg_constraint con join pg_class t on t.oid=con.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and con.contype='f' and pg_get_constraintdef(con.oid) ~ '\mrestaurante_id\M'
  loop
    newdef := regexp_replace(r.def, '\mrestaurante_id\M', 'local_id', 'g');
    newname := left(r.tbl,36) || '_lid_fkey_' || r.oid;
    begin execute format('alter table public.%I add constraint %I %s', r.tbl, newname, newdef);
    exception when duplicate_object then null; end;
  end loop;
end $$;
-- 4c índices standalone
do $$ declare r record; newdef text; newname text; begin
  for r in select ix.indexrelid as oid, pg_get_indexdef(ix.indexrelid) as def
    from pg_index ix join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and pg_get_indexdef(ix.indexrelid) ~ '\mrestaurante_id\M'
      and not exists (select 1 from pg_constraint c where c.conindid = ix.indexrelid)
  loop
    newname := 'ix_lid_' || r.oid;
    newdef := regexp_replace(r.def, '\mrestaurante_id\M', 'local_id', 'g');
    newdef := regexp_replace(newdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ON', 'CREATE \1INDEX ' || newname || ' ON');
    begin execute newdef; exception when duplicate_table then null; end;
  end loop;
end $$;
