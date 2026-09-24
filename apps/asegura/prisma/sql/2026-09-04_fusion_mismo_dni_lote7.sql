-- Lote 7 — fusión de fichas por MISMO DNI leído de la FOTO del plan (`fusion-dni-lote7-2026-09-04`).
--
-- Qué cambia respecto al lote 2 (`2026-09-02_fusion_dni_lote2.sql`): el MOTOR es el mismo, las
-- cinco fases idénticas; lo que cambia es de dónde salen los pares. Allí eran ocho uuid pegados a
-- mano; aquí se leen de `seguros.backfill_dni_plan.choques`, la foto que deja
-- `GET /api/operador/backfill-dni` cada vez que Alberto abre `/correduria/mantenimiento`. Esa foto
-- es lo ÚNICO que sabe qué fichas comparten DNI de verdad, porque descifra con la clave que solo
-- tiene la app; desde SQL, 15.753 fichas tienen el DNI cifrado y sin hash, y ahí un mismo nombre y
-- teléfono no distingue a una persona de su homónimo (medido el 04/09/2026: 561 grupos, 517 pares).
--
-- Por qué NO se fusiona por nombre+teléfono a ciegas: fusionar a dos personas distintas pone el
-- IBAN y el domicilio de una en la ficha de la otra, y no se deshace con un UPDATE.
--
-- ── QUÉ ENTRA ──────────────────────────────────────────────────────────────────────────────────
--   · Los pares que el pre-vuelo descartó con los nombres delante (lista `excluidos`): el mismo
--     DNI con nombres de dos personas distintas es un DNI mal tecleado, no una gemela.
--   · Solo grupos de EXACTAMENTE dos fichas. Los tríos se saltan con un `notice`: los decide una
--     persona con los nombres delante, no un bucle.
--   · Las dos fichas existen, son de la misma correduría y ninguna está ya en lápida.
--   · Si las dos tienen `dni_lookup_hash`, tienen que ser IGUALES (dos identificadores distintos
--     no se funden jamás). Si solo una lo tiene, es el «preexistente» del plan.
--   · La LÁPIDA no puede tener pólizas de CIMA (`import_ref IS NULL` o `eiac_xml_hash`): si las dos
--     las tienen, no es la gemela del volcado y se salta con `notice`.
--
-- ── QUIÉN SOBREVIVE (en este orden, y el primero que desempata manda) ─────────────────────────
--   1. la que YA tiene `dni_lookup_hash` (la identificada: regla de todos los lotes anteriores);
--   2. la que tiene pólizas de CIMA (la cartera viva);
--   3. la que tiene `email_lookup_hash` (es por lo que el portal engancha una identidad a su ficha);
--   4. la que tiene más pólizas;
--   5. la más antigua.
--   Todo lo que trae la lápida se MUEVE (fase 4) y sus huecos se heredan (fase 3): la elección
--   decide qué id queda, no qué datos se pierden.
--
-- ── FRESCURA DE LA FOTO ─────────────────────────────────────────────────────────────────────────
-- La foto tiene que ser de las últimas 24 h. Una foto vieja describe una cartera que ya no existe
-- (CIMA entra dos veces al día) y el bloque revienta en vez de fusionar sobre datos caducados.
--
-- ── IDEMPOTENTE Y REVERSIBLE ────────────────────────────────────────────────────────────────────
-- Se ejecuta en TANDAS (`tope` fusiones por pasada, hasta que una pasada haga 0): el cliente SQL
-- de Supabase corta a los 60 s y el bloque es una sola transacción, así que una pasada que no
-- cabe se deshace entera sin dejar rastro (pasó el 04/09/2026 a las 21:10 UTC).
-- Un par ya fusionado por ESTE lote se salta con `notice`. La lápida NO se borra: queda con
-- `merged_into_cliente_id` y una fila en `cliente_merge_log` con `snapshot_before` (la ficha
-- entera) y `deps_repointed`. `cliente_merge_log` es append-only.
--
-- ── EN SECO ─────────────────────────────────────────────────────────────────────────────────────
-- Antes de ejecutar el bloque, la consulta del final (`-- PRE-VUELO`) lista los pares con nombre,
-- quién sobrevive y por qué, para enseñárselos a Alberto. El bloque no se lanza sin ese OK.

do $$
declare
  foto record;
  g jsonb; fichas uuid[]; a uuid; b uuid;
  sup uuid; lap uuid; motivo_sup text;
  ra record; rb record;
  cima_a int; cima_b int; pol_a int; pol_b int;
  n int; i int; deps jsonb; snap jsonb; heredados text[]; corr uuid; hsup text; hlap text;
  hechas int := 0; saltadas int := 0;
  -- Tope de fusiones por pasada. El cliente SQL de Supabase corta a los 60 s y la primera
  -- pasada (04/09/2026, 21:10 UTC) murió por ahí con 0 filas: el bloque es una sola transacción,
  -- así que se deshizo entero. Como es idempotente (un par ya fusionado se salta), se corre en
  -- tandas hasta que una pasada haga 0.
  tope int := 150;
  -- Las columnas heredables y las FKs que miran a clientes.id NO cambian dentro del bucle: se
  -- leen UNA vez. Leerlas por par (information_schema, 600 veces × 50 columnas) era lo que se
  -- comía el minuto.
  col_nombre text[]; col_es_texto boolean[];
  fk_tabla text[]; fk_col text[];
  -- Pares que el pre-vuelo del 04/09/2026 descartó CON LOS NOMBRES DELANTE: mismo DNI en la foto
  -- pero nombres de dos personas distintas (grupo 249: «Antonio Manuel Mejias Heredia» /
  -- «Yolanda Rios Vazquez»; grupo 366: «Fernando Martin Verdugo» / «Catalina Verdugo Garcia»).
  -- El identificador coincide, pero es el DATO el que está mal en una de las dos fichas — un DNI
  -- tecleado en la ficha de otro en el volcado— y fundirlas mezclaría los papeles de dos personas.
  -- Se saltan aquí para que el bloque sea el registro fiel de lo que se ejecutó.
  excluidos uuid[] := array[
    'd1a3da30-302b-4bd7-9a04-12fc888d2e8b', '5c38e0ad-8c90-407e-892b-6c11d2f32e9e',
    '6739c179-24e3-4d06-9312-9f975e00333c', 'afd64eec-cce5-489d-bb7a-242d7661a340'
  ]::uuid[];
begin
  select * into foto from seguros.backfill_dni_plan where id = 1;
  if not found then
    raise exception 'no hay foto del plan: abre /correduria/mantenimiento en plataforma y vuelve';
  end if;
  if foto.calculado_en < now() - interval '24 hours' then
    raise exception 'la foto del plan es de % (más de 24 h): refréscala antes de fusionar', foto.calculado_en;
  end if;

  select array_agg(column_name::text order by column_name),
         array_agg((data_type in ('character varying','text')) order by column_name)
    into col_nombre, col_es_texto
    from information_schema.columns
   where table_schema='seguros' and table_name='clientes'
     and column_name not in ('id','correduria_id','created_at','updated_at',
                             'merged_into_cliente_id','import_ref');

  select array_agg(tn order by tn, cn), array_agg(cn order by tn, cn) into fk_tabla, fk_col
    from (
      select distinct tc.table_name::text tn, kcu.column_name::text cn
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
       where tc.constraint_type='FOREIGN KEY' and tc.table_schema='seguros'
         and ccu.table_name='clientes' and ccu.column_name='id'
         and not (tc.table_name='clientes' and kcu.column_name='merged_into_cliente_id')
         and tc.table_name <> 'cliente_merge_log'
    ) f;

  for g in select value from jsonb_array_elements(foto.choques) loop
    exit when hechas >= tope;
    select array_agg(x::uuid) into fichas from jsonb_array_elements_text(g->'fichas') x;

    if array_length(fichas, 1) <> 2 then
      raise notice 'grupo de % fichas se salta (lo decide una persona): %', array_length(fichas, 1), fichas;
      saltadas := saltadas + 1; continue;
    end if;
    a := fichas[1]; b := fichas[2];
    if a = any(excluidos) or b = any(excluidos) then
      raise notice 'par %/% excluido en el pre-vuelo (nombres de dos personas distintas): se salta', a, b;
      saltadas := saltadas + 1; continue;
    end if;

    select * into ra from seguros.clientes where id = a;
    if not found then raise notice 'la ficha % ya no existe: se salta', a; saltadas := saltadas + 1; continue; end if;
    select * into rb from seguros.clientes where id = b;
    if not found then raise notice 'la ficha % ya no existe: se salta', b; saltadas := saltadas + 1; continue; end if;

    -- Idempotencia: ya fusionadas entre sí (por este lote o por otro).
    if ra.merged_into_cliente_id = b or rb.merged_into_cliente_id = a then
      raise notice 'par %/% ya fusionado: se salta', a, b; saltadas := saltadas + 1; continue;
    end if;
    if ra.merged_into_cliente_id is not null or rb.merged_into_cliente_id is not null then
      raise notice 'par %/% tiene una ficha en lápida de OTRA fusión: se salta', a, b; saltadas := saltadas + 1; continue;
    end if;
    if ra.correduria_id <> rb.correduria_id then
      raise exception 'par %/% de corredurías distintas', a, b;
    end if;
    if ra.dni_lookup_hash is not null and rb.dni_lookup_hash is not null
       and ra.dni_lookup_hash <> rb.dni_lookup_hash then
      raise exception 'par %/% con DOS hashes de DNI distintos: no se funde', a, b;
    end if;

    select count(*) into cima_a from seguros.polizas p where p.cliente_id = a and (p.import_ref is null or p.eiac_xml_hash is not null);
    select count(*) into cima_b from seguros.polizas p where p.cliente_id = b and (p.import_ref is null or p.eiac_xml_hash is not null);
    select count(*) into pol_a from seguros.polizas p where p.cliente_id = a;
    select count(*) into pol_b from seguros.polizas p where p.cliente_id = b;

    if cima_a > 0 and cima_b > 0 then
      raise notice 'par %/% con pólizas de CIMA en las DOS fichas: lo decide una persona, se salta', a, b;
      saltadas := saltadas + 1; continue;
    end if;

    -- Quién sobrevive (ver cabecera).
    if (ra.dni_lookup_hash is not null) <> (rb.dni_lookup_hash is not null) then
      sup := case when ra.dni_lookup_hash is not null then a else b end; motivo_sup := 'ya tenía el índice de DNI';
    elsif cima_a <> cima_b then
      sup := case when cima_a > cima_b then a else b end; motivo_sup := 'tiene las pólizas de CIMA';
    elsif (ra.email_lookup_hash is not null) <> (rb.email_lookup_hash is not null) then
      sup := case when ra.email_lookup_hash is not null then a else b end; motivo_sup := 'tiene el índice de email (portal)';
    elsif pol_a <> pol_b then
      sup := case when pol_a > pol_b then a else b end; motivo_sup := 'tiene más pólizas';
    else
      sup := case when ra.created_at <= rb.created_at then a else b end; motivo_sup := 'es la más antigua';
    end if;
    lap := case when sup = a then b else a end;
    deps := '{}'::jsonb; heredados := '{}';

    select to_jsonb(c), c.correduria_id, c.dni_lookup_hash into snap, corr, hlap
      from seguros.clientes c where c.id = lap;
    select c.dni_lookup_hash into hsup from seguros.clientes c where c.id = sup;

    -- ── Motor del lote 2, sin cambios ──────────────────────────────────────────────────────
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

    -- 3. El superviviente hereda SOLO sus huecos (NULL o cadena vacía).
    for i in 1 .. coalesce(array_length(col_nombre, 1), 0) loop
      if col_es_texto[i] then
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2
              and nullif(btrim(s.%1$I), '''') is null
              and nullif(btrim(l.%1$I), '''') is not null', col_nombre[i])
          using sup, lap;
      else
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2 and s.%1$I is null and l.%1$I is not null', col_nombre[i])
          using sup, lap;
      end if;
      get diagnostics n = row_count;
      if n > 0 then heredados := heredados || col_nombre[i]; end if;
    end loop;

    -- 4. Reapuntar TODAS las FKs que miran a clientes.id (lista leída del catálogo arriba).
    for i in 1 .. coalesce(array_length(fk_tabla, 1), 0) loop
      execute format('update seguros.%I set %I=$1 where %I=$2', fk_tabla[i], fk_col[i], fk_col[i]) using sup, lap;
      get diagnostics n = row_count;
      deps := deps || jsonb_build_object(fk_tabla[i]||'.'||fk_col[i], n);
    end loop;

    -- 5. Lápida y libro de fusiones.
    update seguros.clientes set merged_into_cliente_id = sup where id = lap;
    insert into seguros.cliente_merge_log
      (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
       inherited_fields, cohort_movido, deps_repointed, snapshot_before, lote, actor)
    values (corr, lap, sup,
      'mismo DNI según la foto del plan del blind index (backfill_dni_plan calculada '
      || to_char(foto.calculado_en, 'DD/MM/YYYY HH24:MI') || ' UTC, descifrado en la app con '
      || 'PII_ENCRYPTION_KEY; preexistente en el índice: ' || coalesce((g->>'hayPreexistente'), '?')
      || '). Sobrevive ' || sup || ' porque ' || motivo_sup || '. Criterio DNI aprobado por Alberto '
      || 'en los lotes fusion-cima y fusion-dni del 02/09/2026; lote 7 con su OK del 04/09/2026.',
      heredados, false, deps, snap, 'fusion-dni-lote7-2026-09-04',
      'claude-code (petición de Alberto 04/09/2026: «lote 7»)');
    hechas := hechas + 1;
  end loop;

  raise notice 'lote 7: % fusiones hechas, % grupos saltados (tope por pasada %)', hechas, saltadas, tope;
end $$;

-- ── PRE-VUELO (en seco, para enseñar los pares con nombre antes de ejecutar el bloque) ─────────
-- select g.n as grupo, g->>'hayPreexistente' as preexistente, c.id, c.nombre, c.apellidos, c.tipo,
--        c.import_ref, c.dni_lookup_hash is not null as con_indice_dni,
--        (select count(*) from seguros.polizas p where p.cliente_id = c.id) as polizas,
--        (select count(*) from seguros.polizas p where p.cliente_id = c.id
--           and (p.import_ref is null or p.eiac_xml_hash is not null)) as polizas_cima,
--        c.merged_into_cliente_id is not null as en_lapida
--   from seguros.backfill_dni_plan f,
--        jsonb_array_elements(f.choques) with ordinality as g(g, n),
--        jsonb_array_elements_text(g.g->'fichas') as x(id),
--        seguros.clientes c
--  where c.id = x.id::uuid
--  order by g.n, c.created_at;
