-- Fusión de los pares NOMBRE + CÓDIGO DE CLIENTE idénticos (lote `fusion-nombre-codigo-2026-09-05`).
--
-- ─── Qué duplicado ataca ────────────────────────────────────────────────────
-- Alberto, viendo el buscador: «sigue habiendo duplicidad ¿xq?». No era el
-- buscador repitiendo una fila: son DOS fichas reales. Los dos volcados del CRM
-- viejo (`intranet:` del 30/05 y `asegura_app:` del 21/06) se cargaron SIN
-- cruzarse entre sí, así que una misma persona entró dos veces.
--
-- 🚨 Y lo que NO vale para cruzarlos, medido antes de escribir esto: el id que
-- viaja en el `import_ref`. De 3.443 pares con el MISMO id de origen, **3.005
-- tienen nombre distinto** — los dos sistemas numeran independientemente y sus
-- ids coinciden por casualidad. Fusionar por `import_ref` habría mezclado tres
-- mil personas distintas, que es el error caro de la regla de identidad del
-- CLAUDE.md raíz («por IDENTIDAD, nunca por la etiqueta»).
--
-- ─── La guarda de identidad de ESTE lote ────────────────────────────────────
-- Nombre y apellidos idénticos **más el código numérico que el volcado dejó
-- pegado al final del apellido** («garcia suarez 14354»). Ese código es el nº de
-- cliente del CRM viejo: con 3+ dígitos, dos fichas que comparten nombre exacto
-- Y código son la misma persona. Además:
--   · exactamente 2 fichas en el grupo (no se fusionan tríos a ciegas),
--   · NINGUNA en cartera viva — los grupos que la tocan quedan fuera y se miran
--     a mano; una fusión mal hecha sobre un cliente de CIMA sí duele,
--   · sin DNI contradictorio (1 par cae por aquí),
--   · las dos activas y sin fusionar ya.
-- Medido el 05/09/2026 contra la BD: **106 grupos**, todos parejas, 0 en cartera
-- viva, 1 con DNI contradictorio y 1 que parte el nombre de otra forma →
-- **104 fusiones**. El tope de abajo aborta si alguna vez saliera un número muy
-- distinto (el fichero no se reutiliza a ciegas).
--
-- 🧪 La guarda NO es decorativa: en la primera pasada abortó el lote entero por
-- ese par de reparto distinto, y no se tocó ni una fila (todo el DO va en una
-- transacción). Lo que se cambió fue el criterio de selección, no el cepo.
--
-- ─── Qué hace distinto al lote 3 ────────────────────────────────────────────
-- El motor es el de `2026-09-02_fusion_dni_lote2.sql` (conflictos de índices
-- únicos antes de mover, herencia solo de huecos tratando `''` como hueco,
-- reapuntado de TODAS las FKs leyendo el catálogo, lápida + `cliente_merge_log`).
-- 🆕 Lo que se añade: **los contactos se UNEN, no se eligen**. La herencia por
-- huecos solo salva el contacto de la lápida si el superviviente no tenía; si
-- los dos tienen teléfono, el de la lápida se perdía. Aquí se vuelca a
-- `cliente_telefonos` / `cliente_emails` (que admiten varios por ficha) antes de
-- tocar nada. Es justo el caso que abrió el hilo: de las dos fichas de «Jose
-- alfredo garcia suarez 14354», una tiene teléfono y la otra solo email.
--
-- Reversible: cada fusión deja `snapshot_before` y `deps_repointed` en
-- `cliente_merge_log`, y la lápida sigue existiendo con `merged_into_cliente_id`.
--
-- ⏱️ SE APLICA POR TANDAS. Cada par toca ~33 FKs + ~40 columnas de herencia, así
-- que los 104 de golpe se pasan del minuto que aguanta el cliente de Supabase.
-- El `limit` de abajo acota la tanda y el DO es IDEMPOTENTE —una lápida ya
-- fusionada deja de cumplir `merged_into_cliente_id is null` y no vuelve a
-- entrar—, así que se relanza tal cual hasta que reporte 0 fusiones.
do $$
declare
  v_lote constant text := 'fusion-nombre-codigo-2026-09-05';
  v_max  constant int  := 130;   -- tope de seguridad: si sale mucho más, algo cambió
  par record; s record; l record;
  r record; n int; deps jsonb; snap jsonb; heredados text[]; corr uuid; es_texto bool;
  hechas int := 0; movidos int := 0;
begin
  for par in
    with vis as (
      select c.id, c.dni_lookup_hash as dni, c.created_at,
             lower(btrim(regexp_replace(coalesce(c.nombre,'') || ' ' || coalesce(c.apellidos,''), '\s+', ' ', 'g'))) as nom,
             (regexp_match(coalesce(c.apellidos,''), '(\d{3,})\s*$'))[1] as cod,
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
      select nom, cod from vis
       where cod is not null
       group by nom, cod
      having count(*) = 2
         and bool_and(not viva)
         and count(distinct dni) filter (where dni is not null) <= 1
         -- 🚨 Y el reparto nombre/apellidos tiene que ser el MISMO, no solo la
         -- concatenación. Al aplicarlo la primera vez (05/09/2026) la guarda de
         -- abajo abortó el lote entero por un par que agrupaba igual —
         -- «Jose Alfredo | Garcia Suarez» contra «Jose | Alfredo Garcia Suarez»—
         -- pero partía el nombre en otro sitio. Se aprieta la SELECCIÓN en vez de
         -- relajar la guarda: ese par (1 de 105) se mira a mano. Un criterio que
         -- se ablanda cada vez que su propio cepo salta deja de ser un criterio.
         and count(distinct lower(btrim(nombre))) = 1
         and count(distinct lower(btrim(apellidos))) = 1
    ),
    ord as (
      select v.*, row_number() over (partition by v.nom, v.cod order by v.pol desc, v.created_at asc) as rn
        from vis v join g on g.nom = v.nom and g.cod = v.cod
    )
    select a.id as sup, b.id as lap, a.nom as nom, a.cod as cod
      from ord a join ord b on a.nom = b.nom and a.cod = b.cod
     where a.rn = 1 and b.rn = 2
     order by a.nom
     limit 15   -- tanda: relanzar hasta que el NOTICE diga 0 fusiones
  loop
    hechas := hechas + 1;
    if hechas > v_max then
      raise exception 'el lote saldria con mas de % pares: revisa el criterio antes de aplicarlo', v_max;
    end if;

    deps := '{}'::jsonb; heredados := '{}';
    select * into s from seguros.clientes where id = par.sup;
    select * into l from seguros.clientes where id = par.lap;
    select to_jsonb(c) into snap from seguros.clientes c where c.id = par.lap;
    corr := l.correduria_id;

    -- Guarda repetida sobre las filas ya leídas: si el SELECT de arriba se
    -- tocara alguna vez, esto revienta antes de mover un solo dato.
    if lower(btrim(s.nombre)) is distinct from lower(btrim(l.nombre))
       or lower(btrim(s.apellidos)) is distinct from lower(btrim(l.apellidos)) then
      raise exception 'el par %/% no tiene nombre identico', par.sup, par.lap;
    end if;
    if par.cod is null or length(par.cod) < 3 then
      raise exception 'el par %/% no comparte codigo de cliente', par.sup, par.lap;
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

    -- 🆕 UNIR los contactos. Va ANTES de soltar los hashes de la lápida, que es
    -- de donde sale la comparación. Solo se vuelca lo que el superviviente NO
    -- tiene ya (ni como principal ni como secundario), para no duplicar filas.
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
    -- Los secundarios de la lápida que el superviviente YA tiene se borran en vez
    -- de reapuntarse: si no, la ficha acaba con el mismo número dos veces.
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

    -- La lápida suelta sus índices ciegos para no chocar con el superviviente.
    update seguros.clientes
       set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
     where id = par.lap;

    -- Herencia solo de HUECOS. `activo` queda fuera a propósito: el superviviente
    -- ya está activo y no puede heredar un `false` de la lápida.
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
      'mismo nombre y apellidos Y mismo codigo de cliente del CRM viejo pegado al final del apellido ('
      || par.cod || '), grupo de exactamente 2 fichas, ninguna en cartera viva y sin DNI contradictorio. '
      || 'Los dos volcados (intranet 30/05 y asegura_app 21/06) se cargaron sin cruzarse. El id del '
      || 'import_ref NO se usa como prueba: 3.005 de 3.443 pares con el mismo id de origen tienen nombre '
      || 'distinto. Contactos UNIDOS, no elegidos. Autorizado por Alberto el 05/09/2026.',
      heredados, false, deps, snap, v_lote,
      'claude-code (OK de Alberto 05/09/2026)');
  end loop;

  raise notice 'lote %: % fusiones, % contactos preservados', v_lote, hechas, movidos;
end $$;
