-- Fusión de 1 par por PÓLIZA COMÚN (lote `fusion-poliza-comun-2026-09-03`).
--
-- El caso: Alberto buscó «global» en /correduria y salieron DOS fichas:
--
--   «GLOBAL 2 INSTALACIONES TÉCNICAS»  (05/06, entra por CIMA: 5 pólizas, 4 activas; con DNI)
--   «Global2»                          (21/06, volcado asegura_app: 2 pólizas; con email y CP de Salteras)
--
-- y dictó «mismo cliente». Las tres fusiones del 02/09 no la cazaron porque:
--   · `fusion-cima` exigía NOMBRE igual o TELÉFONO igual + póliza común → el nombre
--     difiere («Global2» ≠ «GLOBAL 2 INSTALACIONES TÉCNICAS») y ninguna tiene teléfono;
--   · `fusion-dni` exigía el mismo hash de DNI → la del volcado no lo tiene;
--   · `fusion-nombre-telefono` exigía nombre+apellidos+teléfono idénticos.
--
-- Lo que SÍ las identifica, y es un identificador y no una etiqueta: comparten la
-- póliza de RC **547875907** (Occident en CIMA · «Plus Ultra» en el volcado, que es la
-- marca absorbida por Occident). Medido el 03/09/2026 sobre TODA la cartera viva: es
-- **el único par** en el que una póliza CIMA existe con el mismo número en otra ficha
-- sin fusionar. No es una clase, es el último resto de las gemelas del volcado.
--
-- Motor idéntico a `2026-09-02_fusion_dni_lote2.sql` (allí está explicado paso a paso).
-- Cambia solo la GUARDA DE IDENTIDAD: exige póliza común (número normalizado, ≥6
-- caracteres, mismo ramo), superviviente CON pólizas de CIMA y lápida SIN ninguna, y
-- que NO haya dos DNI distintos (dos identificadores distintos no se funden jamás).
--
-- Lo que se mueve: la póliza de auto Generali UV-G-410.081.428 (1670HRB, que CIMA no
-- trae porque Generali no está adherida) y la gemela de RC pasan al superviviente; el
-- email, el CP 41909 y la ciudad SALTERAS los hereda porque la viva no los tenía.
-- Reversible: la lápida no se borra; `cliente_merge_log.snapshot_before` guarda la ficha.
do $$
declare
  pares constant uuid[][] := array[
    -- [superviviente (CIMA), lápida (volcado)]
    ['2604512a-f946-4dd4-af91-94400700fe72','803ee8a1-5261-48c6-9fe9-18e8f386e9d0']
  ];
  i int; sup uuid; lap uuid; s record; l record; comun text;
  r record; n int; deps jsonb; snap jsonb; heredados text[]; corr uuid; es_texto bool;
begin
  for i in 1 .. array_length(pares,1) loop
    sup := pares[i][1]; lap := pares[i][2];
    deps := '{}'::jsonb; heredados := '{}';
    if sup = lap then raise exception 'superviviente y lápida coinciden: %', sup; end if;
    select * into s from seguros.clientes where id = sup;
    if not found then raise exception 'superviviente % no existe', sup; end if;
    select * into l from seguros.clientes where id = lap;
    if not found then raise exception 'lapida % no existe', lap; end if;
    if s.merged_into_cliente_id is not null or l.merged_into_cliente_id is not null then
      raise exception 'el par %/% ya tiene una lápida', sup, lap;
    end if;
    if s.correduria_id <> l.correduria_id then
      raise exception 'el par %/% es de dos corredurías', sup, lap;
    end if;
    select to_jsonb(c) into snap from seguros.clientes c where c.id = lap;
    corr := l.correduria_id;

    -- Guarda de identidad de ESTE lote: una póliza con el mismo número y el mismo
    -- ramo en las dos fichas. Si no la hay, revienta antes de tocar nada.
    select a.numero_poliza into comun
      from seguros.polizas a
      join seguros.polizas b
        on upper(regexp_replace(b.numero_poliza,'[^A-Za-z0-9]','','g'))
         = upper(regexp_replace(a.numero_poliza,'[^A-Za-z0-9]','','g'))
       and b.tipo = a.tipo
       and b.cliente_id = lap and b.merged_into_poliza_id is null
     where a.cliente_id = sup and a.merged_into_poliza_id is null
       and length(regexp_replace(a.numero_poliza,'[^A-Za-z0-9]','','g')) >= 6
     limit 1;
    if comun is null then
      raise exception 'el par %/% no comparte ninguna póliza: fuera del criterio de este lote', sup, lap;
    end if;
    if (select count(*) from seguros.polizas p where p.cliente_id=sup and p.import_ref is null and p.merged_into_poliza_id is null) = 0 then
      raise exception 'el superviviente % no es la ficha de CIMA', sup;
    end if;
    if (select count(*) from seguros.polizas p where p.cliente_id=lap and p.import_ref is null and p.merged_into_poliza_id is null) > 0 then
      raise exception 'la lapida % tiene polizas de CIMA: no es la gemela del volcado', lap;
    end if;
    if s.dni_lookup_hash is not null and l.dni_lookup_hash is not null
       and s.dni_lookup_hash <> l.dni_lookup_hash then
      raise exception 'el par %/% tiene DOS DNI distintos: no se funde', sup, lap;
    end if;

    -- 1. Conflictos que reventarían el reapuntado (índices únicos), ANTES de mover.
    delete from seguros.cliente_relaciones x
     where (x.cliente_a_id = lap and x.cliente_b_id = sup)
        or (x.cliente_b_id = lap and x.cliente_a_id = sup);
    delete from seguros.cliente_relaciones x
     where x.cliente_a_id = lap
       and exists (select 1 from seguros.cliente_relaciones y
                    where y.cliente_a_id = sup and y.cliente_b_id = x.cliente_b_id
                      and y.tipo_relacion = x.tipo_relacion);
    delete from seguros.cliente_relaciones x
     where x.cliente_b_id = lap
       and exists (select 1 from seguros.cliente_relaciones y
                    where y.cliente_b_id = sup and y.cliente_a_id = x.cliente_a_id
                      and y.tipo_relacion = x.tipo_relacion);
    delete from seguros.portal_vinculo x
     where x.cliente_id = lap
       and exists (select 1 from seguros.portal_vinculo y
                    where y.cliente_id = sup and y.identidad_id = x.identidad_id);

    -- 2. La lápida suelta sus índices ciegos únicos (quedan en snapshot_before).
    update seguros.clientes
       set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
     where id = lap;

    -- 3. El superviviente hereda SOLO sus huecos (NULL o '' en texto).
    for r in
      select column_name c, data_type d from information_schema.columns
       where table_schema='seguros' and table_name='clientes'
         and column_name not in ('id','correduria_id','created_at','updated_at',
                                 'merged_into_cliente_id','import_ref')
       order by column_name
    loop
      es_texto := r.d in ('character varying','text');
      if es_texto then
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2
              and nullif(btrim(s.%1$I), '''') is null
              and nullif(btrim(l.%1$I), '''') is not null', r.c) using sup, lap;
      else
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2 and s.%1$I is null and l.%1$I is not null', r.c) using sup, lap;
      end if;
      get diagnostics n = row_count;
      if n > 0 then heredados := heredados || r.c; end if;
    end loop;

    -- 4. Reapuntar TODAS las FKs que miran a clientes.id (leyendo el catálogo).
    for r in
      select tc.table_name tn, kcu.column_name cn
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
       where tc.constraint_type='FOREIGN KEY' and tc.table_schema='seguros'
         and ccu.table_name='clientes' and ccu.column_name='id'
         and not (tc.table_name='clientes' and kcu.column_name='merged_into_cliente_id')
         and tc.table_name <> 'cliente_merge_log'
       order by 1,2
    loop
      execute format('update seguros.%I set %I=$1 where %I=$2', r.tn, r.cn, r.cn) using sup, lap;
      get diagnostics n = row_count;
      deps := deps || jsonb_build_object(r.tn||'.'||r.cn, n);
    end loop;

    -- 5. Lápida y libro de fusiones.
    update seguros.clientes set merged_into_cliente_id = sup where id = lap;
    insert into seguros.cliente_merge_log
      (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
       inherited_fields, cohort_movido, deps_repointed, snapshot_before, lote, actor)
    values (corr, lap, sup,
      'las dos fichas tienen la misma poliza ' || comun || ' (mismo numero y mismo ramo): en CIMA como '
      || 'Occident y en el volcado del 21/06 como Plus Ultra, la marca absorbida por Occident. El nombre '
      || 'difiere («Global2» frente a «GLOBAL 2 INSTALACIONES TECNICAS») y por eso escapo al lote '
      || 'fusion-cima. Alberto lo dicto el 03/09/2026 con las dos fichas delante: «mismo cliente».',
      heredados, false, deps, snap, 'fusion-poliza-comun-2026-09-03',
      'claude-code (dictado de Alberto 03/09/2026: «mismo cliente»)');
  end loop;
end $$;

-- ── Segunda pasada (mismo día): el índice ciego del email ──────────────────────
-- 🚨 Fallo LATENTE del motor (el mismo en los tres lotes del 02/09): el paso 2
-- anula los hashes de la lápida ANTES del paso 3 (herencia), así que el
-- superviviente hereda `email`/`telefono`/`dni` cifrados pero NUNCA su
-- `*_lookup_hash`. Consecuencia: buscar por ese email en /correduria devolvía
-- vacío sobre una ficha que lo tiene — el modo de fallo silencioso que este repo
-- marca como el más caro. Medido el 03/09/2026 sobre los 50 supervivientes de los
-- lotes anteriores: 0 huecos (allí ninguna lápida aportó un email/teléfono/DNI que
-- la viva no tuviera). Aquí SÍ: la viva no tenía email y lo heredó de «Global2».
-- Se repone desde `snapshot_before`, solo si el superviviente no tiene hash y
-- nadie más lo usa (índice único). Aplicado el 03/09/2026 (1 fila).
update seguros.clientes s
   set email_lookup_hash = (m.snapshot_before->>'email_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-poliza-comun-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.email_lookup_hash is null
   and nullif(m.snapshot_before->>'email_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.email_lookup_hash = m.snapshot_before->>'email_lookup_hash');
