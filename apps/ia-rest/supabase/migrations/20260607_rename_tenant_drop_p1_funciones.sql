-- Fase 3 DROP paso 1: funciones que referencian la columna restaurante_id -> local_id.
-- Word-boundary (\m..\M): la columna pasa a local_id pero el parámetro p_restaurante_id se conserva.
-- DROP+CREATE para las que cambian tipo de retorno. Excluye sync_local_restaurante_id.
do $$
declare r record; def text; newdef text;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname <> 'sync_local_restaurante_id'
      and pg_get_functiondef(p.oid) ~ '\mrestaurante_id\M'
  loop
    def := pg_get_functiondef(r.oid);
    newdef := regexp_replace(def, '\mrestaurante_id\M', 'local_id', 'g');
    begin execute newdef;
    exception when others then
      execute format('drop function if exists public.%I(%s)', r.proname, r.args);
      execute newdef;
    end;
  end loop;
end $$;
