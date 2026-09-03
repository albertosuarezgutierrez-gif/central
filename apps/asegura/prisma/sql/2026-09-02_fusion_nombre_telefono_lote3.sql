-- Fusión de 8 pares por NOMBRE + APELLIDOS + TELÉFONO (lote `fusion-nombre-telefono-2026-09-02`).
--
-- 🚨 Este lote sale FUERA del criterio del `fusion-cima-2026-09-02`, y por eso se
-- preguntó antes de tocar nada. Aquel exigía *nombre o teléfono **+** número de
-- póliza compartido, o mismo DNI*; estos ocho pares **no comparten ninguna póliza**.
-- Lo que los identifica es el patrón, que es el mismo de José Suárez Salas:
--
--   ficha del 30/05 → entra por CIMA, tiene las pólizas vivas
--   ficha del 21/06 → volcado `asegura_app`, mismo nombre, mismos apellidos, mismo teléfono
--
-- **Alberto lo autorizó expresamente el 02/09/2026**, preguntándoselo con los ocho
-- nombres delante y diciéndole que moverían 20 pólizas. Sin ese OK esto no se hace:
-- fusionar a dos personas distintas no se deshace con un UPDATE — se pierde de quién
-- era cada póliza.
--
-- El motor es el mismo que `2026-09-02_fusion_dni_lote2.sql` (ahí está explicado con
-- detalle: conflictos de índices únicos antes de mover, la lápida suelta sus índices
-- ciegos, herencia solo de huecos tratando `''` como hueco, reapuntado de las FKs
-- leyendo el catálogo, lápida + fila en `cliente_merge_log`). Lo único que cambia es
-- la **guarda de identidad**, que aquí exige nombre y apellidos idénticos, mismo hash
-- de teléfono, el superviviente CON pólizas de CIMA y la lápida SIN ninguna.
--
-- Resultado en la BD (02/09/2026), verificado después: 8 fusiones · **20 pólizas**,
-- 14 bienes, 8 teléfonos y 2 intervinientes reapuntados · 12 campos heredados.
-- En toda la base: 0 grupos con DNI repetido, 0 grupos nombre+teléfono que toquen la
-- cartera viva, **0 pólizas colgando de una lápida**. 50 fichas fusionadas en total.
do $$
declare
  pares constant uuid[][] := array[
    -- [superviviente (CIMA, 30/05), lápida (volcado, 21/06)]
    ['bc7eed57-7957-4f79-ae62-f67895753e1f','4f3007bf-f053-4eb0-bf2c-53574d9566c7'],
    ['e9b4c9ca-22d1-4f65-8bcf-558fd6f46082','17cec897-120a-437b-9804-380973c4654a'],
    ['e37840a0-898b-43aa-a431-ffcdd801f13f','46395181-2d8b-4cfc-a95e-81036046f19e'],
    ['9ed7e405-6090-4b06-a7aa-050e415b27f0','8fe90484-b95e-494d-939d-7240197df6e8'],
    ['9c6afbda-1510-4ce7-822e-16e291de906f','596b1755-abdf-47dd-a97e-42865dafce65'],
    ['7f2b661e-9b4a-49d9-b4d1-335146017ebc','56dd31ad-3f73-4207-bec4-4a88cdad56f2'],
    ['00a6b1ef-a805-4d48-a48b-a438554e364c','28d8c0c1-f7f0-4475-8f66-12080321b0ad'],
    ['66d0e2b2-ba10-4e1a-a7b1-9b2bc68f612f','05e02e35-91c2-45d6-99ae-75acc2eeb87f']
  ];
  i int; sup uuid; lap uuid; s record; l record;
  r record; n int; deps jsonb; snap jsonb; heredados text[]; corr uuid; es_texto bool;
begin
  for i in 1 .. array_length(pares,1) loop
    sup := pares[i][1]; lap := pares[i][2];
    deps := '{}'::jsonb; heredados := '{}';
    select * into s from seguros.clientes where id = sup;
    if not found then raise exception 'superviviente % no existe', sup; end if;
    select * into l from seguros.clientes where id = lap;
    if not found then raise exception 'lapida % no existe', lap; end if;
    select to_jsonb(c) into snap from seguros.clientes c where c.id = lap;
    corr := l.correduria_id;

    -- Guarda de identidad de ESTE lote. Si no cuadra, revienta antes de tocar nada:
    -- es lo que impide reutilizar el fichero con otros ids y mezclar dos personas.
    if lower(btrim(s.nombre)) is distinct from lower(btrim(l.nombre))
       or lower(btrim(s.apellidos)) is distinct from lower(btrim(l.apellidos))
       or s.telefono_lookup_hash is null
       or s.telefono_lookup_hash is distinct from l.telefono_lookup_hash then
      raise exception 'el par %/% no cumple nombre+apellidos+telefono', sup, lap;
    end if;
    if (select count(*) from seguros.polizas p where p.cliente_id=sup and p.import_ref is null) = 0 then
      raise exception 'el superviviente % no es la ficha de CIMA', sup;
    end if;
    if (select count(*) from seguros.polizas p where p.cliente_id=lap and p.import_ref is null) > 0 then
      raise exception 'la lapida % tiene polizas de CIMA: no es la gemela del volcado', lap;
    end if;

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

    update seguros.clientes
       set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
     where id = lap;

    for r in
      select column_name c, data_type d from information_schema.columns
       where table_schema='seguros' and table_name='clientes'
         and column_name not in ('id','correduria_id','created_at','updated_at',
                                 'merged_into_cliente_id','import_ref')
       order by column_name
    loop
      es_texto := r.d in ('character varying','text');
      if es_texto then
        -- El hueco de una columna de texto puede ser NULL **o cadena vacía**.
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

    update seguros.clientes set merged_into_cliente_id = sup where id = lap;
    insert into seguros.cliente_merge_log
      (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
       inherited_fields, cohort_movido, deps_repointed, snapshot_before, lote, actor)
    values (corr, lap, sup,
      'mismo nombre, mismos apellidos y mismo hash de telefono; la ficha del 30/05 entra por CIMA y la del '
      || '21/06 es el volcado, que es el patron exacto de Jose Suarez Salas. NO comparten numero de poliza, '
      || 'asi que queda FUERA del criterio del lote fusion-cima (nombre/telefono + poliza comun o DNI): lo '
      || 'autorizo Alberto expresamente el 02/09/2026 al preguntarselo caso por caso.',
      heredados, false, deps, snap, 'fusion-nombre-telefono-2026-09-02',
      'claude-code (OK explicito de Alberto 02/09/2026)');
  end loop;
end $$;
