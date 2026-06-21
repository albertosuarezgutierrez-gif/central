-- ============================================================
-- 20260607_rename_tenant_fase3_vistas.sql
-- FASE 3 (CONTRACT, paso 1) del rename restaurante_id -> local_id.
-- ============================================================
-- Las VISTAS exponían restaurante_id pero NO local_id (el trigger de Fase 1 solo
-- actúa sobre TABLAS BASE). Eso bloqueaba migrar a local_id las queries que leen
-- de vistas. Aquí se recrean TODAS las vistas con restaurante_id para exponer
-- también local_id (= restaurante_id), de forma uniforme y reversible:
-- se envuelve la definición original y se añade local_id al final (cumple la
-- restricción de CREATE OR REPLACE VIEW de solo añadir columnas al final).
-- Aplicada al remoto el 2026-06-07. Idempotente (re-ejecutable).
do $$
declare r record; def text;
begin
  for r in
    select v.table_name
    from information_schema.views v
    where v.table_schema = 'public'
      and exists (select 1 from information_schema.columns c
                  where c.table_schema='public' and c.table_name=v.table_name and c.column_name='restaurante_id')
      and not exists (select 1 from information_schema.columns c
                  where c.table_schema='public' and c.table_name=v.table_name and c.column_name='local_id')
    order by v.table_name
  loop
    def := pg_get_viewdef(('public.'||quote_ident(r.table_name))::regclass, true);
    def := regexp_replace(def, ';\s*$', '');
    execute format(
      'create or replace view public.%I as select sub.*, sub.restaurante_id as local_id from (%s) sub',
      r.table_name, def
    );
  end loop;
end $$;
