-- Fusión por MISMO NOMBRE + (mismo vehículo O misma póliza) — lote `fusion-vehiculo-poliza-2026-09-05`.
--
-- ─── Qué queda después del lote 8 ───────────────────────────────────────────
-- El lote 8 se llevó los 104 pares que compartían el código de cliente del CRM
-- viejo. Alberto: «haz lo mismo con los 336 homónimos que quedan». No se puede
-- con todos, y el dato dice por qué: de los **1.322 pares** que solo comparten
-- el nombre, **277 tienen DNI DISTINTO** — están PROBADOS como personas
-- diferentes, y ninguno comparte DNI. Fusionar por nombre es fundir homónimos.
--
-- Lo que sí queda es rescatar los que traen una de las pruebas ya validadas en
-- lotes anteriores: **mismo vehículo** (criterio del lote 5) o **misma póliza**
-- (criterio del lote 4). Medido el 05/09/2026: **6 pares** con prueba, de los
-- cuales 1 cae por DNI contradictorio y **2 por ser grupos de TRES fichas** →
-- **3 fusiones** (cristina sanchez · mirian molina leon · susana espinar).
--
-- ⚠️ La cuenta previa dijo «5 fusionables» y era errónea: contaba PARES, y en un
-- grupo de tres hay tres pares posibles. La guarda `count(*) = 2` los deja
-- fuera a propósito — tres fichas con el mismo nombre y el mismo coche pueden
-- ser abuelo, padre y nieto, y ahí el vehículo compartido no prueba nada.
-- «Emil Muti» y «Manuel Duarte Herrera» son esos dos tríos, y siguen sin tocar.
--
-- 🚨 Ese que cae merece leerse, porque es el lote entero en un caso: «Jose
-- Manuel Seijas Vazquez» aparece dos veces, **comparte coche** y tiene **dos
-- DNI distintos**. Es un padre y un hijo del mismo nombre con el mismo vehículo.
-- Sin la guarda del DNI, la prueba «mismo coche» los habría fundido.
--
-- ─── Guardas ────────────────────────────────────────────────────────────────
--   · nombre y apellidos idénticos (normalizados) y mismo reparto entre campos,
--   · exactamente 2 fichas en el grupo,
--   · mismo vehículo (matrícula de `datos_especificos`) o misma póliza
--     (número normalizado, ≥4 dígitos — el resto son centinelas del volcado),
--   · sin DNI contradictorio,
--   · NINGUNA en cartera viva (las 5 son leads del volcado; una fusión mal
--     hecha sobre un cliente de CIMA sí duele).
-- Superviviente: la que más pólizas tiene; empate, la más antigua.
--
-- Motor idéntico al del lote 8 (contactos UNIDOS, reapuntado de FKs por
-- catálogo, lápida + `cliente_merge_log` con `snapshot_before`). Reversible.
do $$
declare
  v_lote constant text := 'fusion-vehiculo-poliza-2026-09-05';
  v_max  constant int  := 15;   -- tope: se midieron 5; si sale mucho más, revisar
  par record; s record; l record;
  r record; n int; deps jsonb; snap jsonb; heredados text[]; corr uuid; es_texto bool;
  hechas int := 0; movidos int := 0;
begin
  for par in
    with vis as (
      select c.id, c.nombre, c.apellidos, c.dni_lookup_hash as dni, c.created_at,
             lower(btrim(regexp_replace(coalesce(c.nombre,'') || ' ' || coalesce(c.apellidos,''), '\s+', ' ', 'g'))) as nom,
             (select count(*) from seguros.polizas p
               where p.cliente_id = c.id and p.merged_into_poliza_id is null) as pol,
             exists (select 1 from seguros.polizas p
                      where p.cliente_id = c.id and p.merged_into_poliza_id is null
                        and (p.import_ref is null or p.eiac_xml_hash is not null)) as viva
        from seguros.clientes c
       where c.merged_into_cliente_id is null and c.activo
         and coalesce(btrim(c.nombre || c.apellidos), '') <> ''
    ),
    g as (
      select nom from vis
       group by nom
      having count(*) = 2
         and bool_and(not viva)
         and count(distinct dni) filter (where dni is not null) <= 1
         and count(distinct lower(btrim(nombre))) = 1
         and count(distinct lower(btrim(apellidos))) = 1
    ),
    ord as (
      select v.*, row_number() over (partition by v.nom order by v.pol desc, v.created_at asc) as rn
        from vis v join g on g.nom = v.nom
    ),
    cand as (
      select a.id as sup, b.id as lap, a.nom as nom
        from ord a join ord b on a.nom = b.nom
       where a.rn = 1 and b.rn = 2
    )
    select c.*,
           exists (select 1 from seguros.polizas x join seguros.polizas y
              on upper(btrim(x.datos_especificos->>'matricula')) = upper(btrim(y.datos_especificos->>'matricula'))
             and coalesce(btrim(x.datos_especificos->>'matricula'), '') <> ''
            where x.cliente_id = c.sup and y.cliente_id = c.lap
              and x.merged_into_poliza_id is null and y.merged_into_poliza_id is null) as veh,
           exists (select 1 from seguros.polizas x join seguros.polizas y
              on upper(regexp_replace(x.numero_poliza, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(y.numero_poliza, '[^A-Za-z0-9]', '', 'g'))
             and length(regexp_replace(x.numero_poliza, '[^0-9]', '', 'g')) >= 4
            where x.cliente_id = c.sup and y.cliente_id = c.lap
              and x.merged_into_poliza_id is null and y.merged_into_poliza_id is null) as polc
      from cand c
     order by c.nom
  loop
    continue when not (par.veh or par.polc);   -- sin prueba no se fusiona
    hechas := hechas + 1;
    if hechas > v_max then
      raise exception 'el lote saldria con mas de % pares: revisa el criterio', v_max;
    end if;

    deps := '{}'::jsonb; heredados := '{}';
    select * into s from seguros.clientes where id = par.sup;
    select * into l from seguros.clientes where id = par.lap;
    select to_jsonb(c) into snap from seguros.clientes c where c.id = par.lap;
    corr := l.correduria_id;

    if lower(btrim(s.nombre)) is distinct from lower(btrim(l.nombre))
       or lower(btrim(s.apellidos)) is distinct from lower(btrim(l.apellidos)) then
      raise exception 'el par %/% no tiene nombre identico', par.sup, par.lap;
    end if;
    if s.dni_lookup_hash is not null and l.dni_lookup_hash is not null
       and s.dni_lookup_hash is distinct from l.dni_lookup_hash then
      raise exception 'el par %/% tiene DNI contradictorio: son dos personas', par.sup, par.lap;
    end if;
    if exists (select 1 from seguros.polizas p
                where p.cliente_id in (par.sup, par.lap) and p.merged_into_poliza_id is null
                  and (p.import_ref is null or p.eiac_xml_hash is not null)) then
      raise exception 'el par %/% toca la cartera viva: se mira a mano', par.sup, par.lap;
    end if;

    -- Contactos UNIDOS, no elegidos (igual que el lote 8).
    if nullif(btrim(coalesce(l.telefono, '')), '') is not null
       and l.telefono_lookup_hash is distinct from s.telefono_lookup_hash
       and not exists (select 1 from seguros.cliente_telefonos t
                        where t.cliente_id = par.sup
                          and t.telefono_lookup_hash is not distinct from l.telefono_lookup_hash) then
      insert into seguros.cliente_telefonos
        (id, cliente_id, correduria_id, telefono, telefono_lookup_hash, etiqueta, es_principal)
      values (gen_random_uuid(), par.sup, corr, l.telefono, l.telefono_lookup_hash, 'de ficha fusionada', false);
      movidos := movidos + 1;
    end if;
    if nullif(btrim(coalesce(l.email, '')), '') is not null
       and l.email_lookup_hash is distinct from s.email_lookup_hash
       and not exists (select 1 from seguros.cliente_emails e
                        where e.cliente_id = par.sup
                          and e.email_lookup_hash is not distinct from l.email_lookup_hash) then
      insert into seguros.cliente_emails
        (id, cliente_id, correduria_id, email, email_lookup_hash, etiqueta, es_principal)
      values (gen_random_uuid(), par.sup, corr, l.email, l.email_lookup_hash, 'de ficha fusionada', false);
      movidos := movidos + 1;
    end if;
    delete from seguros.cliente_telefonos t
     where t.cliente_id = par.lap
       and exists (select 1 from seguros.cliente_telefonos o
                    where o.cliente_id = par.sup
                      and o.telefono_lookup_hash is not distinct from t.telefono_lookup_hash);
    delete from seguros.cliente_emails e
     where e.cliente_id = par.lap
       and exists (select 1 from seguros.cliente_emails o
                    where o.cliente_id = par.sup
                      and o.email_lookup_hash is not distinct from e.email_lookup_hash);

    delete from seguros.cliente_relaciones x
     where (x.cliente_a_id = par.lap and x.cliente_b_id = par.sup)
        or (x.cliente_b_id = par.lap and x.cliente_a_id = par.sup);
    delete from seguros.cliente_relaciones x
     where x.cliente_a_id = par.lap
       and exists (select 1 from seguros.cliente_relaciones y
                    where y.cliente_a_id = par.sup and y.cliente_b_id = x.cliente_b_id
                      and y.tipo_relacion = x.tipo_relacion);
    delete from seguros.cliente_relaciones x
     where x.cliente_b_id = par.lap
       and exists (select 1 from seguros.cliente_relaciones y
                    where y.cliente_b_id = par.sup and y.cliente_a_id = x.cliente_a_id
                      and y.tipo_relacion = x.tipo_relacion);
    delete from seguros.portal_vinculo x
     where x.cliente_id = par.lap
       and exists (select 1 from seguros.portal_vinculo y
                    where y.cliente_id = par.sup and y.identidad_id = x.identidad_id);

    update seguros.clientes
       set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
     where id = par.lap;

    for r in
      select column_name c, data_type d from information_schema.columns
       where table_schema = 'seguros' and table_name = 'clientes'
         and column_name not in ('id','correduria_id','created_at','updated_at',
                                 'merged_into_cliente_id','import_ref','activo')
       order by column_name
    loop
      es_texto := r.d in ('character varying','text');
      if es_texto then
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2
              and nullif(btrim(s.%1$I), '''') is null
              and nullif(btrim(l.%1$I), '''') is not null', r.c) using par.sup, par.lap;
      else
        execute format(
          'update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
            where s.id=$1 and l.id=$2 and s.%1$I is null and l.%1$I is not null', r.c) using par.sup, par.lap;
      end if;
      get diagnostics n = row_count;
      if n > 0 then heredados := heredados || r.c; end if;
    end loop;

    for r in
      select tc.table_name tn, kcu.column_name cn
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'seguros'
         and ccu.table_name = 'clientes' and ccu.column_name = 'id'
         and not (tc.table_name = 'clientes' and kcu.column_name = 'merged_into_cliente_id')
         and tc.table_name <> 'cliente_merge_log'
       order by 1, 2
    loop
      execute format('update seguros.%I set %I=$1 where %I=$2', r.tn, r.cn, r.cn) using par.sup, par.lap;
      get diagnostics n = row_count;
      deps := deps || jsonb_build_object(r.tn || '.' || r.cn, n);
    end loop;

    update seguros.clientes set merged_into_cliente_id = par.sup where id = par.lap;
    insert into seguros.cliente_merge_log
      (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
       inherited_fields, cohort_movido, deps_repointed, snapshot_before, lote, actor)
    values (corr, par.lap, par.sup,
      'mismo nombre y apellidos Y ' || (case when par.veh then 'MISMO VEHICULO (matricula compartida)' else 'MISMA POLIZA (numero + >=4 digitos)' end)
      || ', grupo de exactamente 2 fichas, ninguna en cartera viva y sin DNI contradictorio. Rescate de los '
      || 'homonimos que el lote 8 no pudo probar por codigo de cliente: de los 1.322 pares que solo comparten '
      || 'nombre, 277 tienen DNI DISTINTO, asi que el nombre por si solo NO identifica. Autorizado por Alberto '
      || 'el 05/09/2026.',
      heredados, false, deps, snap, v_lote,
      'claude-code (OK de Alberto 05/09/2026)');
  end loop;

  raise notice 'lote %: % fusiones, % contactos preservados', v_lote, hechas, movidos;
end $$;
