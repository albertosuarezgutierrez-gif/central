-- Parte del portal ↔ siniestro, y alta manual ↔ siniestro de CIMA (03/10/2026, Alberto, ideas 2+3).
--
-- ADITIVO: solo columnas nuevas nullable, una FK y grants. No borra ni reescribe ninguna fila.
-- Reglas puras: `packages/module-seguros/src/siniestro-vinculo.ts`. BD: `apps/asegura/lib/siniestros-vinculo.ts`.
--
-- 1) `siniestros.fusionado_en_siniestro_id`: cuando entra por CIMA el siniestro que la correduría ya
--    había dado de alta a mano y la clave de CIMA no casó (sin nº, o nº con ceros de Allianz), el alta
--    manual NO se borra: se marca como fusionada en la fila de CIMA (que es la que la ingesta sigue
--    actualizando), y su nº, notas, tramitador… se copian a esa fila donde estaba vacía. Toda lectura
--    de la ficha/portal filtra `fusionado_en_siniestro_id IS NULL`. Mismo patrón que
--    `polizas.merged_into_poliza_id`.
-- 2) `portal_parte_siniestro.siniestro_id` pasa a tener FK (antes era un uuid suelto), y se anota CÓMO se
--    vinculó: `alta_desde_parte` · `manual` (desde la ficha) · `auto_cima` (coincidencia fuerte: misma
--    póliza + fecha ±3 días + un único candidato de CIMA). Las filas ya vinculadas antes de esto quedan
--    con `siniestro_vinculo` NULL = «vinculado antes de que se anotara cómo» (no se inventa).
--
-- ✅ APLICADO en producción el 04/10/2026 (comprobaciones previas y posteriores OK). ORDEN: aplicar ANTES de desplegar `asegura`, `asegura-portal` y
-- `plataforma`: el portal pide la columna nueva y tiene GRANT por columnas (sin el GRANT, su lectura de
-- siniestros falla con «permission denied»).
--
-- La FK es ON DELETE NO ACTION a propósito: borrar un siniestro con un parte del cliente colgado debe
-- FALLAR (el CHECK `portal_parte_abierto_con_sello` impediría además el SET NULL en los abiertos).
-- Comprobación previa de huérfanos (debe dar 0; si no, la FK queda NOT VALID y se avisa):
--   select count(*) from seguros.portal_parte_siniestro p
--    where p.siniestro_id is not null and not exists (select 1 from seguros.siniestros s where s.id = p.siniestro_id);

-- ─── 1. Fusión de altas manuales ─────────────────────────────────────────────
alter table seguros.siniestros
  add column if not exists fusionado_en_siniestro_id uuid references seguros.siniestros(id),
  add column if not exists fusionado_at timestamptz;

do $$ begin
  alter table seguros.siniestros
    add constraint siniestros_fusion_coherente
    check ((fusionado_en_siniestro_id is null) = (fusionado_at is null) and fusionado_en_siniestro_id is distinct from id);
exception when duplicate_object then null; end $$;

create index if not exists idx_siniestros_fusionado_en
  on seguros.siniestros (fusionado_en_siniestro_id) where fusionado_en_siniestro_id is not null;

comment on column seguros.siniestros.fusionado_en_siniestro_id is
  'Alta manual (gestionado_correduria) unida al siniestro de CIMA que la compañía mandó después. La fila se conserva; '
  'las lecturas la ocultan (IS NULL). NULL = no fusionado.';
comment on column seguros.siniestros.fecha_declaracion is
  'Día en que se declaró a la compañía. En origen cima lo manda CIMA; en gestionado_correduria lo anota el corredor. NULL = no consta.';

-- El portal oculta las fusionadas: necesita leer la columna (GRANT por columnas, ver 2026-09-02_portal_rol_vinculo_grants.sql).
grant select (fusionado_en_siniestro_id) on seguros.siniestros to prisma_asegura_portal;

-- ─── 2. Vínculo parte ↔ siniestro ────────────────────────────────────────────
alter table seguros.portal_parte_siniestro
  add column if not exists siniestro_vinculo text,
  add column if not exists siniestro_vinculado_at timestamptz;

do $$ begin
  alter table seguros.portal_parte_siniestro
    add constraint portal_parte_siniestro_vinculo_ck
    check (siniestro_vinculo is null or (siniestro_vinculo in ('alta_desde_parte', 'manual', 'auto_cima') and siniestro_id is not null));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table seguros.portal_parte_siniestro
    add constraint portal_parte_siniestro_siniestro_fk
    foreign key (siniestro_id) references seguros.siniestros(id) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  if exists (
    select 1 from seguros.portal_parte_siniestro p
     where p.siniestro_id is not null
       and not exists (select 1 from seguros.siniestros s where s.id = p.siniestro_id)
  ) then
    raise warning 'portal_parte_siniestro tiene siniestro_id huérfanos: la FK queda NOT VALID (las filas nuevas sí se comprueban). Revisar a mano.';
  else
    alter table seguros.portal_parte_siniestro validate constraint portal_parte_siniestro_siniestro_fk;
  end if;
end $$;

create index if not exists idx_portal_parte_siniestro_siniestro
  on seguros.portal_parte_siniestro (siniestro_id) where siniestro_id is not null;

comment on column seguros.portal_parte_siniestro.siniestro_vinculo is
  'Cómo se vinculó al siniestro: alta_desde_parte | manual | auto_cima. NULL con siniestro_id = vinculado antes del 03/10/2026.';

-- Comprobación tras aplicar (las tres deben devolver una fila):
--   select 1 from information_schema.columns where table_schema='seguros' and table_name='siniestros' and column_name='fusionado_en_siniestro_id';
--   select convalidated from pg_constraint where conname='portal_parte_siniestro_siniestro_fk';   -- true
--   select has_column_privilege('prisma_asegura_portal','seguros.siniestros','fusionado_en_siniestro_id','SELECT');
