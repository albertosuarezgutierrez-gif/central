-- Lote 10 — los 18 grupos de MISMO DNI que quedaban, resueltos uno a uno (`fusion-dni-lote10-2026-09-05`).
--
-- ── QUÉ LO HACE DISTINTO DE LOS ANTERIORES ─────────────────────────────────────────────────────
-- El motor del lote 7 (`2026-09-04_fusion_mismo_dni_lote7.sql`) solo sabía fusionar grupos de
-- EXACTAMENTE DOS fichas: los tríos los saltaba con un `notice` a propósito, «los decide una
-- persona con los nombres delante». Esa persona ya los ha decidido — Alberto, 05/09/2026, con la
-- tabla de los 18 grupos delante— así que aquí el motor fusiona grupos de N: elige UN superviviente
-- por grupo con el mismo orden de siempre y le funde las demás de una en una.
--
-- Y NO lee los grupos de la foto: lleva los uuid **escritos a mano**, uno por uno. La foto se
-- recalcula cada vez que alguien abre `/correduria/mantenimiento`, así que el ordinal de un grupo
-- no es estable; escribir los ids es lo único que garantiza que lo ejecutado es exactamente lo
-- aprobado, y no lo que la foto dijera después. La foto se sigue exigiendo fresca para el
-- `justificacion_identidad`: el DNI solo se puede comparar descifrado, y eso solo lo hace la app.
--
-- ── LO QUE ALBERTO APROBÓ (14 grupos completos + 1 parcial) ─────────────────────────────────────
--   1  Cesar Arevalo Delgado ×3                                    · mismo teléfono
--   2  Manuel Vargas Cardeñoza ×5                                  · mismo teléfono
--   3  Josefina Montesinos Ramos ×6                                · mismo teléfono
--   4  Juan Garcia ×3                                              · solo el DNI
--   5  Juan Antonio Romero Lopez ×2  ← PARCIAL, ver abajo          · mismo teléfono
--   6  Antonio suarez Carrasco ×3                                  · mismo teléfono
--   7  Inmaculada Rodriguez Alba / Alba Rodriguez ×3               · el MISMO teléfono en las 3
--   8  Manuel Duarte Herrera ×2 + Manuel Herrera                   · dos teléfonos, mismo DNI
--   9  Cristina Sanchez ×2                                         · mismo teléfono
--  11  Amparo Rosado Rueda ×3                                      · tres teléfonos, mismo DNI
--  13  Fco. Javier Zamora Flores ×2 + «Gerente Chapisa»            · el MISMO teléfono en las 3
--  14  Eva Sanchez ×3                                              · solo el DNI
--  16  Yolanda Emilia Raya Gonzalez ×2 + Yolanda Gonzalez          · dos teléfonos, mismo DNI
--  17  PROYECTO ASSENTO / ASSENTO . / ASSENTO (sin apellidos)      · empresa, tres escrituras
--  18  Emil Muti ×3                                                · mismo teléfono
--
-- 🔎 El 13 es el que ningún criterio de nombre habría encontrado: «Gerente Chapisa (sin apellidos)»
-- no es una persona sin nombre, es **él** — mismo DNI y mismo teléfono que Francisco Javier Zamora.
--
-- ⚠️ El 5 entra PARCIAL: el grupo tiene tres fichas y la tercera es «Elisa De paz campo», que no
-- tiene nada que ver con las dos «Juan Antonio Romero Lopez». Se funden los dos Juan Antonio y la
-- ficha de Elisa **no se toca**: lleva un DNI que no es suyo, y eso se corrige, no se fusiona.
--
-- ── LOS TRES QUE NO ENTRAN, Y POR QUÉ ──────────────────────────────────────────────────────────
--  12  «Antonio Manuel Mejias Heredia» / «Yolanda Rios Vazquez» — dos personas, dos teléfonos.
--  15  «Fernando Martin Verdugo» / «Catalina Verdugo Garcia» — comparten apellido, no identidad.
--  10  el DNI CENTINELA: 20 fichas, 20 nombres sin relación, 19 correos distintos.
-- En los tres, el identificador coincide y el DATO es el que está mal. Fundirlos mezclaría los
-- papeles de dos personas, que es el fallo que no se ve luego (regla «agrupar por IDENTIDAD, nunca
-- por la etiqueta» de CLAUDE.md). Los 12 y 15 ya los excluyó el pre-vuelo del lote 7; se repiten
-- aquí porque un lote tiene que poder leerse solo.
--
-- ── QUIÉN SOBREVIVE (mismo orden que todos los lotes anteriores) ───────────────────────────────
--   1. la que YA tiene `dni_lookup_hash`;  2. la que tiene pólizas de CIMA;
--   3. la que tiene `email_lookup_hash`;   4. la que tiene más pólizas;  5. la más antigua.
-- Todo lo de las lápidas se MUEVE y sus huecos se heredan: la elección decide qué id queda, no qué
-- datos se pierden.
--
-- ── IDEMPOTENTE Y REVERSIBLE ───────────────────────────────────────────────────────────────────
-- Una ficha ya en lápida se salta con `notice`. La lápida no se borra: queda con
-- `merged_into_cliente_id` y una fila en `cliente_merge_log` (append-only) con `snapshot_before`
-- —la ficha entera— y `deps_repointed`. `tope` corta la pasada para no morir en los 60 s del
-- cliente SQL; se repite hasta que una pasada haga 0.

do $$
declare
  foto record;
  grupos jsonb := $json$[
    {"n": 1,  "fichas": ["db08d45d-edeb-4e77-a1f8-121b1f2873a5","55a3fe82-3de6-4e10-b6f0-bfd9dbeef624","e72b6f8d-414c-419c-bc8d-8ffb7d167ef2"]},
    {"n": 2,  "fichas": ["2608742b-f242-4408-abe9-ec0da18a9b84","989eb44c-f237-4722-9aca-b49127cb9729","dd4fa2e3-1bb2-4974-a78d-4f74cc2dfee7","98b2898d-f8f0-4769-883b-00f9b9be484e","ff1fe034-1f8f-491c-b5d7-6aa6709dd2f4"]},
    {"n": 3,  "fichas": ["bcbb51a2-1251-4e31-9bb0-3e328f66a91a","49725dc8-4999-4a1c-95a3-1705cf5a039a","3ca37ba6-d5c3-4a4d-a804-eac8934030af","b5c90a61-b60b-46fd-84ab-b266871bee3c","c6355101-e580-4809-a8b2-41140f7de06d","36e185d2-5f55-497c-bff4-5cdbb1f278e5"]},
    {"n": 4,  "fichas": ["921ee093-a534-4f48-a26d-830bcf8332bf","90bf993d-4f18-4f50-a9c7-1cd55df8aa6f","72fc76bd-770d-4eef-9d46-f99b3529dbb6"]},
    {"n": 5,  "fichas": ["f2164cf7-c864-4fd1-8d05-d4b9040e4eb3","f8d3eda7-abb6-4e6c-9c03-b7446213248b"]},
    {"n": 6,  "fichas": ["9fb3ef27-229f-44a7-bcf9-2d00069917a8","e58d6d8b-2c82-44c9-9abd-f6f62aab8d0d","302e6d4c-7774-4e09-bb26-e80ee86bfa5e"]},
    {"n": 7,  "fichas": ["8b2480c1-0691-4490-b191-bc02d1a5d40b","50a5b873-b0c4-4acb-9b33-375f201407d2","13431b4c-0c9f-4283-90f8-f4e4a4e2ff36"]},
    {"n": 8,  "fichas": ["5d8ac55d-cfbf-48ca-9768-01613856a605","a83ae42e-7b94-4103-bbd4-7f5a56e0bff2","a14d6fe9-c8a9-46ad-aad6-9ee596bd360d"]},
    {"n": 9,  "fichas": ["4806b6df-5a27-4d26-91b5-fbc49b2be04c","790c39e8-a4f1-4599-b8f9-caf785a57e4a"]},
    {"n": 11, "fichas": ["a3ef65b1-d18c-44c8-90c1-8dedad65c1d5","e75ba659-998a-4cc8-9d22-94ddda4e94a5","f8776a96-52f3-4959-97c6-5186c0235af4"]},
    {"n": 13, "fichas": ["ab1eeaad-32fa-4fcd-964a-a830a7e805ef","ff3d94bc-15a4-4b9e-8890-d42c5f40f47c","9bdca7c9-ced1-4707-addc-66a7b1171499"]},
    {"n": 14, "fichas": ["da1387d1-ccd4-4b97-aef0-7672a8f29110","9ccfec33-7d26-48ab-8157-57d9a6a12829","32001f08-e2a7-4c81-ab4b-2b50f7f8c809"]},
    {"n": 16, "fichas": ["0339c338-b5d0-4ed6-ba05-fd86ba1d4dd7","5ee196c3-a957-4181-a138-b0e9d298b26e","e9829823-ec5a-4fd1-b0a0-db0af5d0ed6d"]},
    {"n": 17, "fichas": ["82abda29-1612-4065-9108-11cdab934fd9","15026538-ae86-48ce-89ca-8e814ecdac63","9e4fb04e-ee9b-4ac5-9c90-e3358ce41d36"]},
    {"n": 18, "fichas": ["05753051-c9ab-48c3-8cc7-b550e5c048b7","d5369502-1db2-49ed-a3af-e3370fc3cf0d","3db6f804-f961-44fc-97e0-c588799a2bf5"]}
  ]$json$::jsonb;
  g jsonb; fichas uuid[]; grupo_n int;
  sup uuid; lap uuid; motivo_sup text;
  vivas int; hashes int; corr uuid;
  n int; i int; deps jsonb; snap jsonb; heredados text[];
  hechas int := 0; saltadas int := 0; grupos_ok int := 0;
  tope int := 40;
  col_nombre text[]; col_es_texto boolean[];
  fk_tabla text[]; fk_col text[];
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

  for g in select value from jsonb_array_elements(grupos) loop
    exit when hechas >= tope;
    grupo_n := (g->>'n')::int;
    select array_agg(x::uuid) into fichas from jsonb_array_elements_text(g->'fichas') x;

    -- Todas las fichas del grupo tienen que existir, ser de la misma correduría y estar libres.
    if (select count(*) from seguros.clientes c where c.id = any(fichas)) <> array_length(fichas,1) then
      raise notice 'grupo %: falta alguna ficha, se salta', grupo_n; saltadas := saltadas + 1; continue;
    end if;
    if (select count(*) from seguros.clientes c
         where c.id = any(fichas) and c.merged_into_cliente_id is not null) > 0 then
      raise notice 'grupo %: alguna ficha ya está en lápida (¿pasada anterior?), se salta', grupo_n;
      saltadas := saltadas + 1; continue;
    end if;
    if (select count(distinct c.correduria_id) from seguros.clientes c where c.id = any(fichas)) <> 1 then
      raise exception 'grupo %: fichas de corredurías distintas', grupo_n;
    end if;

    -- Dos identificadores distintos NO se funden jamás.
    select count(distinct c.dni_lookup_hash) into hashes
      from seguros.clientes c where c.id = any(fichas) and c.dni_lookup_hash is not null;
    if hashes > 1 then
      raise exception 'grupo %: % hashes de DNI distintos, no se funde', grupo_n, hashes;
    end if;

    -- Si la cartera VIVA está en más de una ficha, no lo decide un bucle.
    select count(distinct p.cliente_id) into vivas
      from seguros.polizas p
     where p.cliente_id = any(fichas) and p.merged_into_poliza_id is null
       and (p.import_ref is null or p.eiac_xml_hash is not null);
    if vivas > 1 then
      raise notice 'grupo %: pólizas de CIMA en % fichas, lo decide una persona, se salta', grupo_n, vivas;
      saltadas := saltadas + 1; continue;
    end if;

    -- El superviviente: el primero del orden de siempre.
    select c.id,
           case when c.dni_lookup_hash is not null then 'ya tenía el índice de DNI'
                when (select count(*) from seguros.polizas p where p.cliente_id = c.id
                       and (p.import_ref is null or p.eiac_xml_hash is not null)) > 0 then 'tiene las pólizas de CIMA'
                when c.email_lookup_hash is not null then 'tiene el índice de email (portal)'
                else 'tiene más pólizas o es la más antigua' end
      into sup, motivo_sup
      from seguros.clientes c
     where c.id = any(fichas)
     order by (c.dni_lookup_hash is not null) desc,
              (select count(*) from seguros.polizas p where p.cliente_id = c.id
                and (p.import_ref is null or p.eiac_xml_hash is not null)) desc,
              (c.email_lookup_hash is not null) desc,
              (select count(*) from seguros.polizas p where p.cliente_id = c.id) desc,
              c.created_at asc
     limit 1;

    select c.correduria_id into corr from seguros.clientes c where c.id = sup;
    grupos_ok := grupos_ok + 1;

    -- Se funde cada una de las demás EN el superviviente, con el motor del lote 2/7 sin cambios.
    for lap in select c.id from seguros.clientes c
                where c.id = any(fichas) and c.id <> sup order by c.created_at loop
      deps := '{}'::jsonb; heredados := '{}';
      select to_jsonb(c) into snap from seguros.clientes c where c.id = lap;

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

      -- 4. Reapuntar TODAS las FKs que miran a clientes.id.
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
        'mismo DNI (grupo ' || grupo_n || ' de la foto del blind index, calculada '
        || to_char(foto.calculado_en, 'DD/MM/YYYY HH24:MI') || ' UTC y descifrada en la app con '
        || 'PII_ENCRYPTION_KEY). Sobrevive ' || sup || ' porque ' || motivo_sup
        || '. Los 18 grupos se pusieron delante de Alberto con nombre, teléfono y pólizas el '
        || '05/09/2026; aprobó estos y dejó fuera el 12 y el 15 (dos personas distintas), el 10 '
        || '(DNI centinela de 20 fichas) y la ficha de «Elisa De paz campo» del grupo 5.',
        heredados, false, deps, snap, 'fusion-dni-lote10-2026-09-05',
        'claude-code (petición de Alberto 05/09/2026: «ahora los 18 grupos a fusionar… ejecutalo»)');
      hechas := hechas + 1;
    end loop;
  end loop;

  raise notice 'lote 10: % grupos fusionados, % fusiones, % grupos saltados (tope %)',
    grupos_ok, hechas, saltadas, tope;
end $$;
