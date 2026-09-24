-- Fusión de fichas duplicadas por MISMO DNI (lote `fusion-dni-2026-09-02`).
--
-- Continúa el lote `fusion-cima-2026-09-02` (34 fusiones) con el MISMO criterio de
-- identidad que aprobó Alberto: **mismo DNI**. Aquí no hay pólizas de CIMA de por
-- medio; son 8 grupos del volcado en los que la misma persona/entidad entró dos
-- veces, y en 7 de los 8 la segunda ficha ni siquiera tiene apellidos.
--
-- 🚨 Lo que esto NO hace: fusionar por nombre, ni por nombre+teléfono. Queda fuera a
-- propósito — el 02/09 ya se descartaron 94 pares por nombre, y los 553 grupos por
-- nombre+teléfono son en su mayoría familias que comparten el fijo. Fusionar a dos
-- personas distintas no se deshace con un UPDATE: se pierde de quién era cada póliza.
--
-- Reversible por diseño: la lápida NO se borra. Se marca con `merged_into_cliente_id`
-- y queda fila en `cliente_merge_log` con `snapshot_before` (la ficha entera antes de
-- tocarla) y `deps_repointed` (cuántas filas se movieron, tabla a tabla).
--
-- ⚠️ `cliente_merge_log` es **append-only** (trigger `cliente_merge_log_reject_modification`):
-- una corrección posterior NO se puede anotar editando su fila. Lo que vale como
-- auditoría es `snapshot_before`; el relato va aquí y en la memoria.
--
-- Resultado en la BD (02/09/2026): 8 fusiones, 0 pólizas que mover (las lápidas eran
-- las fichas `lead` del volcado, sin pólizas), 5 teléfonos y 3 emails reapuntados,
-- 12 campos heredados + los apellidos del caso «Roberto» en la segunda pasada.
-- Verificado después: **0 grupos con DNI repetido** y **0 pólizas colgando de una
-- lápida** en toda la base.
do $$
declare
  pares constant uuid[][] := array[
    -- [superviviente, lápida] — sobrevive la `tipo='cliente'`, que es la de las pólizas
    ['1c6f47fa-735f-4071-ae6a-49969535732d','3eb1fd8b-c4c8-472d-8436-7a60e170e2fb'],
    ['c225c75d-8331-4083-bf2b-33c0f3d11c44','e0eb80fa-6333-4943-8af8-adad44b805d2'],
    ['4da74f40-bb43-4fae-a855-bf61aa8cd736','90f54949-501a-46d1-9d22-bd9dfce35c2b'],
    ['c6c75f10-fb28-49c4-b915-577442e6594a','3cb7e1bb-2fef-49b1-bb18-41deeaee1bc7'],
    ['d0656f68-d7d1-4b49-8828-cad06bbee92d','cecb89da-5339-4d1f-8af0-79467426a6aa'],
    ['99ba23a1-89ec-4c77-9660-43dde090d182','e2447574-7be5-43eb-9a63-d19996369df1'],
    ['d3cd83fd-20f6-4f9b-a825-e0eeec6d5b3e','a89ca3af-8fcb-44b1-8efc-4b83702d823b'],
    ['4756cdcf-31ef-4ee8-b632-e215e31c5e91','4f4f4e44-ebc1-49bd-aa2a-96a8317c08c9']
  ];
  i int; sup uuid; lap uuid;
  r record; n int; deps jsonb; snap jsonb; heredados text[]; corr uuid; hsup text; hlap text;
begin
  for i in 1 .. array_length(pares,1) loop
    sup := pares[i][1]; lap := pares[i][2];
    deps := '{}'::jsonb; heredados := '{}';

    if sup = lap then raise exception 'superviviente y lápida coinciden: %', sup; end if;
    select to_jsonb(c), c.correduria_id, c.dni_lookup_hash into snap, corr, hlap
      from seguros.clientes c where c.id = lap;
    if snap is null then raise exception 'la lápida % no existe', lap; end if;
    select c.dni_lookup_hash into hsup from seguros.clientes c where c.id = sup;
    if not found then raise exception 'el superviviente % no existe', sup; end if;

    -- Guarda de identidad: este lote SOLO fusiona fichas con el mismo hash de DNI.
    -- Si alguien reutiliza el fichero con otros ids, aquí revienta en vez de fusionar
    -- a dos personas distintas.
    if hsup is null or hsup is distinct from hlap then
      raise exception 'el par %/% no comparte DNI: fuera del criterio de este lote', sup, lap;
    end if;

    -- 1. Conflictos que reventarían el reapuntado (índices únicos), ANTES de mover.
    delete from seguros.cliente_relaciones x
     where (x.cliente_a_id = lap and x.cliente_b_id = sup)
        or (x.cliente_b_id = lap and x.cliente_a_id = sup);          -- quedarían A = B
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

    -- 2. La lápida SUELTA sus índices ciegos únicos: si no, el superviviente no puede
    --    heredarlos (uq_clientes_dni_lookup_hash / _email_ son únicos). El valor queda
    --    guardado en `snapshot_before`, que se tomó arriba.
    update seguros.clientes
       set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
     where id = lap;

    -- 3. El superviviente hereda SOLO sus huecos. Nunca pisa un dato que ya tiene:
    --    la ficha viva manda, la del volcado solo rellena (p. ej. los apellidos que
    --    le faltan a una de las ocho).
    --
    -- 🚨 Un HUECO aquí es `NULL` **o cadena vacía**, y las dos condiciones de abajo
    --    salieron de fallar: la primera versión filtraba `is_nullable='YES'` y
    --    comparaba con `IS NULL`, y por eso NO recuperó los apellidos del único caso
    --    que los tenía en la gemela. Dos causas a la vez, las dos clásicas de este
    --    repo: `clientes.apellidos` es **NOT NULL** (así que su hueco solo puede ser
    --    `''`) y `''` es un valor de cajón que se cuela por toda guarda basada en
    --    NULL. Se arregló en la BD con una segunda pasada el mismo día.
    for r in
      select column_name c from information_schema.columns
       where table_schema='seguros' and table_name='clientes'
         and column_name not in ('id','correduria_id','created_at','updated_at',
                                 'merged_into_cliente_id','import_ref')
       order by column_name
    loop
      if (select data_type from information_schema.columns
           where table_schema='seguros' and table_name='clientes' and column_name=r.c)
         in ('character varying','text') then
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2
              and nullif(btrim(s.%1$I), '''') is null
              and nullif(btrim(l.%1$I), '''') is not null', r.c)
          using sup, lap;
      else
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2 and s.%1$I is null and l.%1$I is not null', r.c)
          using sup, lap;
      end if;
      get diagnostics n = row_count;
      if n > 0 then heredados := heredados || r.c; end if;
    end loop;

    -- 4. Reapuntar TODAS las FKs que miran a clientes.id. Se recorre el catálogo en
    --    vez de una lista escrita a mano: una tabla nueva con `cliente_id` entra sola.
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
      'mismo hash de DNI (identificador legal) en las dos fichas; sobrevive la de tipo cliente, '
      || 'que es la que trae las pólizas. La gemela viene del volcado del 21/06 y en 7 de los 8 '
      || 'casos ni siquiera tiene apellidos. Criterio DNI ya aprobado por Alberto en el lote '
      || 'fusion-cima-2026-09-02.',
      heredados, false, deps, snap, 'fusion-dni-2026-09-02',
      'claude-code (petición de Alberto 02/09/2026: «hazme limpieza de bbdd unificar lo q puedas»)');
  end loop;
end $$;
