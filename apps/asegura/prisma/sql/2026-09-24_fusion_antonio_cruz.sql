-- Fusión a mano de UN par: «Antonio Cruz Sánchez» (edc7248d…) → «Antonio Cruz Martínez» (8016986c…).
--
-- La ficha edc7248d se creó a mano el 21/09/2026 (13:44) con DNI y fecha de nacimiento
-- pero con el segundo apellido mal; la buena (8016986c, «Antonio», Jaén) es la que tiene
-- teléfono, email, la relación Cuñado/a con Gabriel Cabrera y, desde el 24/09, la póliza
-- Mapfre 2002600520435. Alberto confirmó el 24/09/2026 que es la misma persona.
--
-- Motor idéntico al del lote 9 (contactos UNIDOS, reapuntado de FKs por catálogo,
-- lápida + `cliente_merge_log` con `snapshot_before`, reversible), con una diferencia:
-- aquí la superviviente NO tiene DNI y la lápida sí, así que el `dni_lookup_hash` se
-- guarda ANTES de vaciarlo en la lápida y se pone en la superviviente (el lote 9 lo
-- vaciaba antes de heredar y el DNI llegaba sin su índice ciego).
-- Sin la guarda de «ninguna en cartera viva»: la superviviente tiene una póliza viva
-- a propósito, y el par lo ha decidido Alberto, no un criterio automático.
do $$
declare
  v_sup constant uuid := '8016986c-2a78-4e80-98ea-8d2fb0084896';
  v_lap constant uuid := 'edc7248d-85ef-4b87-821c-4a94f3116d72';
  s record; l record; r record; n int;
  deps jsonb := '{}'::jsonb; snap jsonb; heredados text[] := '{}'; es_texto bool;
  dni_hash text;
begin
  select * into s from seguros.clientes where id = v_sup;
  select * into l from seguros.clientes where id = v_lap;
  if s.id is null or l.id is null then raise exception 'falta alguna de las dos fichas'; end if;
  if l.merged_into_cliente_id is not null then raise exception 'la lapida ya esta fusionada'; end if;
  if s.correduria_id <> l.correduria_id then raise exception 'correduria distinta'; end if;
  if s.dni_lookup_hash is not null and l.dni_lookup_hash is not null
     and s.dni_lookup_hash <> l.dni_lookup_hash then
    raise exception 'DNI contradictorio: son dos personas';
  end if;
  select to_jsonb(c) into snap from seguros.clientes c where c.id = v_lap;
  dni_hash := l.dni_lookup_hash;

  -- Contactos UNIDOS (hoy la lápida no trae ni teléfono ni email; se deja por si acaso).
  if nullif(btrim(coalesce(l.telefono, '')), '') is not null
     and l.telefono_lookup_hash is distinct from s.telefono_lookup_hash
     and not exists (select 1 from seguros.cliente_telefonos t
                      where t.cliente_id = v_sup and t.telefono_lookup_hash is not distinct from l.telefono_lookup_hash) then
    insert into seguros.cliente_telefonos (id, cliente_id, correduria_id, telefono, telefono_lookup_hash, etiqueta, es_principal)
    values (gen_random_uuid(), v_sup, s.correduria_id, l.telefono, l.telefono_lookup_hash, 'de ficha fusionada', false);
  end if;
  if nullif(btrim(coalesce(l.email, '')), '') is not null
     and l.email_lookup_hash is distinct from s.email_lookup_hash
     and not exists (select 1 from seguros.cliente_emails e
                      where e.cliente_id = v_sup and e.email_lookup_hash is not distinct from l.email_lookup_hash) then
    insert into seguros.cliente_emails (id, cliente_id, correduria_id, email, email_lookup_hash, etiqueta, es_principal)
    values (gen_random_uuid(), v_sup, s.correduria_id, l.email, l.email_lookup_hash, 'de ficha fusionada', false);
  end if;
  delete from seguros.cliente_telefonos t where t.cliente_id = v_lap
     and exists (select 1 from seguros.cliente_telefonos o where o.cliente_id = v_sup
                  and o.telefono_lookup_hash is not distinct from t.telefono_lookup_hash);
  delete from seguros.cliente_emails e where e.cliente_id = v_lap
     and exists (select 1 from seguros.cliente_emails o where o.cliente_id = v_sup
                  and o.email_lookup_hash is not distinct from e.email_lookup_hash);

  delete from seguros.cliente_relaciones x
   where (x.cliente_a_id = v_lap and x.cliente_b_id = v_sup) or (x.cliente_b_id = v_lap and x.cliente_a_id = v_sup);
  delete from seguros.cliente_relaciones x where x.cliente_a_id = v_lap
     and exists (select 1 from seguros.cliente_relaciones y
                  where y.cliente_a_id = v_sup and y.cliente_b_id = x.cliente_b_id and y.tipo_relacion = x.tipo_relacion);
  delete from seguros.cliente_relaciones x where x.cliente_b_id = v_lap
     and exists (select 1 from seguros.cliente_relaciones y
                  where y.cliente_b_id = v_sup and y.cliente_a_id = x.cliente_a_id and y.tipo_relacion = x.tipo_relacion);
  delete from seguros.portal_vinculo x where x.cliente_id = v_lap
     and exists (select 1 from seguros.portal_vinculo y where y.cliente_id = v_sup and y.identidad_id = x.identidad_id);

  update seguros.clientes set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
   where id = v_lap;

  -- Hereda lo que la superviviente no tiene (en claro o cifrado, tal cual).
  for r in
    select column_name c, data_type d from information_schema.columns
     where table_schema = 'seguros' and table_name = 'clientes'
       and column_name not in ('id','correduria_id','created_at','updated_at','merged_into_cliente_id','import_ref','activo',
                               'dni_lookup_hash','email_lookup_hash','telefono_lookup_hash')
     order by column_name
  loop
    es_texto := r.d in ('character varying','text');
    if es_texto then
      execute format('update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
          where s.id=$1 and l.id=$2 and nullif(btrim(s.%1$I), '''') is null and nullif(btrim(l.%1$I), '''') is not null', r.c)
        using v_sup, v_lap;
    else
      execute format('update seguros.clientes s set %1$I = l.%1$I from seguros.clientes l
          where s.id=$1 and l.id=$2 and s.%1$I is null and l.%1$I is not null', r.c)
        using v_sup, v_lap;
    end if;
    get diagnostics n = row_count;
    if n > 0 then heredados := heredados || r.c; end if;
  end loop;
  if dni_hash is not null and s.dni_lookup_hash is null then
    update seguros.clientes set dni_lookup_hash = dni_hash where id = v_sup;
    heredados := heredados || 'dni_lookup_hash'::text;
  end if;

  for r in
    select tc.table_name tn, kcu.column_name cn
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
     where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'seguros'
       and ccu.table_name = 'clientes' and ccu.column_name = 'id'
       and not (tc.table_name = 'clientes' and kcu.column_name = 'merged_into_cliente_id')
       and tc.table_name <> 'cliente_merge_log'
     order by 1, 2
  loop
    execute format('update seguros.%I set %I=$1 where %I=$2', r.tn, r.cn, r.cn) using v_sup, v_lap;
    get diagnostics n = row_count;
    if n > 0 then deps := deps || jsonb_build_object(r.tn || '.' || r.cn, n); end if;
  end loop;

  update seguros.clientes set merged_into_cliente_id = v_sup where id = v_lap;
  insert into seguros.cliente_merge_log
    (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
     inherited_fields, cohort_movido, deps_repointed, snapshot_before, lote, actor)
  values (s.correduria_id, v_lap, v_sup,
    'Misma persona confirmada por Alberto el 24/09/2026: «Antonio Cruz Sánchez» es un alta manual del 21/09 con el '
    || 'segundo apellido mal; el titular es Antonio Cruz Martínez (pólizas Mapfre 2002600520435 y Allianz 058366323).',
    heredados, false, deps, snap, 'fusion-antonio-cruz-2026-09-24', 'claude-code (OK de Alberto 24/09/2026)');
  insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
  values (s.correduria_id, v_sup, 'gestion',
    'Fusionada en esta ficha la duplicada «Antonio Cruz Sánchez» (' || v_lap || '), confirmada por Alberto el 24/09/2026. '
    || 'Campos heredados: ' || coalesce(array_to_string(heredados, ', '), 'ninguno') || '.');
  raise notice 'heredados: %, deps: %', heredados, deps;
end $$;
