-- Fusión de DOS fichas de cliente desde la pantalla, eligiendo campo a campo (25/09/2026).
--
-- Hasta hoy las fusiones se hacían por lotes SQL escritos a mano (lotes 2-10 y el
-- de Antonio Cruz). Alberto: «que indique qué datos son diferentes y pueda
-- seleccionar cuál sí y cuál no». Esta función es el MISMO motor que esos lotes
-- (lápida + `cliente_merge_log` con `snapshot_before`, reapuntado de FKs por
-- catálogo, contactos UNIDOS) con tres cosas que los lotes no tenían:
--
-- 1. `p_de_absorbida`: los grupos de campos en los que el corredor ha elegido el
--    valor de la ficha que desaparece. Lista blanca cerrada (abajo). Lo que no
--    está en la lista se queda como está en la superviviente, y si ahí está vacío
--    se hereda (como en los lotes).
-- 2. `snapshot_superviviente`: la superviviente entera ANTES de tocarla. Elegir
--    el valor de la otra SOBREESCRIBE, y sin esa foto no habría vuelta atrás.
-- 3. Los índices ciegos viajan con su valor. El lote 4 dejó un email heredado
--    sin `email_lookup_hash` (se vaciaba en la lápida antes de heredar): aquí se
--    guardan antes y se ponen en la superviviente junto con el valor.
--
-- 🚨 La guarda de identidad NO se relaja: dos DNI distintos = dos personas y la
-- función se niega (el caso de Antonio Cruz, padre e hijo, revertido el 24/09).
--
-- Filas que no se pueden mover (tablas append-only como `firma` o `consent_logs`,
-- o que chocarían con un índice único) se quedan colgando de la lápida, que no
-- se borra, y se DEVUELVEN contadas en `sin_mover`: no se pierden, no se callan.
--
-- SECURITY DEFINER porque `prisma_seguros` no tiene UPDATE en tres tablas con FK
-- a clientes (portal_enlace_directo, felicitacion, portal_mensaje) y una fusión a
-- medias es peor que ninguna. Solo la ejecuta `prisma_seguros`: el `revoke` a
-- `crm_seguros` es explícito porque los privilegios por defecto del schema se la daban.

alter table seguros.cliente_merge_log add column if not exists snapshot_superviviente jsonb;

create or replace function seguros.fusionar_clientes(
  p_correduria uuid,
  p_sup uuid,
  p_lap uuid,
  p_de_absorbida text[],
  p_justificacion text,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path = seguros, pg_temp
as $$
declare
  grupos constant jsonb := '{
    "nombre": ["nombre"],
    "apellidos": ["apellidos"],
    "fecha_nacimiento": ["fecha_nacimiento"],
    "direccion": ["direccion", "codigo_postal", "ciudad", "provincia"],
    "direccion_fiscal": ["direccion_fiscal", "cp_fiscal", "ciudad_fiscal", "provincia_fiscal"],
    "cuenta_bancaria": ["cuenta_bancaria"],
    "notas": ["notas"],
    "saludo": ["saludo"],
    "estado_civil": ["estado_civil"],
    "ocupacion": ["ocupacion"],
    "sector": ["sector"],
    "tipo_persona": ["tipo_persona"]
  }'::jsonb;
  s record; l record; r record; n int; g text; col text;
  snap_l jsonb; snap_s jsonb;
  deps jsonb := '{}'::jsonb; sin_mover jsonb := '{}'::jsonb;
  elegidos text[] := '{}'; heredados text[] := '{}';
  h_dni text; h_tel text; h_email text; h_dom text; h_usr text;
  es_texto bool; v_saltadas int; v_row record; v_ids jsonb;
  bloques constant text[] := array['direccion','codigo_postal','ciudad','provincia','direccion_fiscal','cp_fiscal','ciudad_fiscal','provincia_fiscal'];
  borradas jsonb := '{}'::jsonb; insertadas jsonb := '[]'::jsonb; v_nueva uuid;
begin
  if p_sup = p_lap then raise exception 'misma_ficha'; end if;
  if nullif(btrim(coalesce(p_actor, '')), '') is null then raise exception 'sin_actor'; end if;

  -- Bloqueo en orden fijo (por id) para que dos fusiones cruzadas no se interbloqueen.
  perform 1 from clientes where id in (p_sup, p_lap) order by id for update;
  select * into s from clientes where id = p_sup;
  select * into l from clientes where id = p_lap;
  if s.id is null or l.id is null then raise exception 'no_encontrado'; end if;
  if s.correduria_id <> p_correduria or l.correduria_id <> p_correduria then raise exception 'no_encontrado'; end if;
  if s.merged_into_cliente_id is not null or l.merged_into_cliente_id is not null then raise exception 'ya_fusionada'; end if;
  if s.dni_lookup_hash is not null and l.dni_lookup_hash is not null and s.dni_lookup_hash <> l.dni_lookup_hash then
    raise exception 'dni_contradictorio';
  end if;
  -- Un DNI guardado SIN índice ciego no se puede comparar: si las dos tienen DNI y a
  -- alguna le falta el índice, podrían ser dos personas (padre e hijo) y no se sabe.
  if nullif(btrim(coalesce(s.dni, '')), '') is not null and nullif(btrim(coalesce(l.dni, '')), '') is not null
     and (s.dni_lookup_hash is null or l.dni_lookup_hash is null) then
    raise exception 'dni_sin_indice';
  end if;

  foreach g in array coalesce(p_de_absorbida, '{}') loop
    if not grupos ? g then raise exception 'campo_no_permitido: %', g; end if;
    elegidos := elegidos || g;
  end loop;

  snap_l := to_jsonb(l);
  snap_s := to_jsonb(s);
  h_dni := l.dni_lookup_hash; h_tel := l.telefono_lookup_hash; h_email := l.email_lookup_hash;
  h_dom := l.email_dominio_hash; h_usr := l.email_usuario_hash;

  -- ─── Contactos UNIDOS ────────────────────────────────────────────────────
  -- Si la superviviente solo tiene el valor en la COLUMNA y va a recibir otro,
  -- primero se baja a la tabla hija como principal: si no, el secundario nuevo
  -- quedaría como único en la hija y la ficha dejaría de pintar el suyo.
  if (nullif(btrim(coalesce(l.telefono, '')), '') is not null or exists (select 1 from cliente_telefonos where cliente_id = p_lap))
     and nullif(btrim(coalesce(s.telefono, '')), '') is not null
     and not exists (select 1 from cliente_telefonos where cliente_id = p_sup) then
    insert into cliente_telefonos (id, cliente_id, correduria_id, telefono, telefono_lookup_hash, es_principal, created_at)
    values (gen_random_uuid(), p_sup, p_correduria, s.telefono, s.telefono_lookup_hash, true, now()) returning id into v_nueva;
    insertadas := insertadas || jsonb_build_object('tabla', 'cliente_telefonos', 'id', v_nueva);
  end if;
  if (nullif(btrim(coalesce(l.email, '')), '') is not null or exists (select 1 from cliente_emails where cliente_id = p_lap))
     and nullif(btrim(coalesce(s.email, '')), '') is not null
     and not exists (select 1 from cliente_emails where cliente_id = p_sup) then
    insert into cliente_emails (id, cliente_id, correduria_id, email, email_lookup_hash, email_dominio_hash, email_usuario_hash, es_principal, created_at)
    values (gen_random_uuid(), p_sup, p_correduria, s.email, s.email_lookup_hash, s.email_dominio_hash, s.email_usuario_hash, true, now()) returning id into v_nueva;
    insertadas := insertadas || jsonb_build_object('tabla', 'cliente_emails', 'id', v_nueva);
  end if;
  -- El valor de columna de la lápida pasa a la hija de la superviviente si no está ya.
  if nullif(btrim(coalesce(l.telefono, '')), '') is not null
     and nullif(btrim(coalesce(s.telefono, '')), '') is not null
     and (h_tel is null or (h_tel is distinct from s.telefono_lookup_hash
          and not exists (select 1 from cliente_telefonos where cliente_id in (p_sup, p_lap) and telefono_lookup_hash = h_tel))) then
    insert into cliente_telefonos (id, cliente_id, correduria_id, telefono, telefono_lookup_hash, etiqueta, es_principal, created_at)
    values (gen_random_uuid(), p_sup, p_correduria, l.telefono, h_tel, 'otro', false, now()) returning id into v_nueva;
    insertadas := insertadas || jsonb_build_object('tabla', 'cliente_telefonos', 'id', v_nueva);
  end if;
  if nullif(btrim(coalesce(l.email, '')), '') is not null
     and nullif(btrim(coalesce(s.email, '')), '') is not null
     and (h_email is null or (h_email is distinct from s.email_lookup_hash
          and not exists (select 1 from cliente_emails where cliente_id in (p_sup, p_lap) and email_lookup_hash = h_email))) then
    insert into cliente_emails (id, cliente_id, correduria_id, email, email_lookup_hash, email_dominio_hash, email_usuario_hash, etiqueta, es_principal, created_at)
    values (gen_random_uuid(), p_sup, p_correduria, l.email, h_email, h_dom, h_usr, 'otro', false, now()) returning id into v_nueva;
    insertadas := insertadas || jsonb_build_object('tabla', 'cliente_emails', 'id', v_nueva);
  end if;
  -- Hijas de la lápida: las repetidas se borran; el resto se mueve como secundario.
  -- Lo que se borra por repetido queda en el registro, entero: sin esto no hay vuelta atrás.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]') into v_ids from cliente_telefonos t where t.cliente_id = p_lap and t.telefono_lookup_hash is not null
     and exists (select 1 from cliente_telefonos o where o.cliente_id = p_sup and o.telefono_lookup_hash = t.telefono_lookup_hash);
  borradas := borradas || jsonb_build_object('cliente_telefonos', v_ids);
  select coalesce(jsonb_agg(to_jsonb(e)), '[]') into v_ids from cliente_emails e where e.cliente_id = p_lap and e.email_lookup_hash is not null
     and exists (select 1 from cliente_emails o where o.cliente_id = p_sup and o.email_lookup_hash = e.email_lookup_hash);
  borradas := borradas || jsonb_build_object('cliente_emails', v_ids);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]') into v_ids from cliente_relaciones x
   where (x.cliente_a_id = p_lap and x.cliente_b_id = p_sup) or (x.cliente_b_id = p_lap and x.cliente_a_id = p_sup)
      or (x.cliente_a_id = p_lap and exists (select 1 from cliente_relaciones y where y.cliente_a_id = p_sup and y.cliente_b_id = x.cliente_b_id and y.tipo_relacion = x.tipo_relacion))
      or (x.cliente_b_id = p_lap and exists (select 1 from cliente_relaciones y where y.cliente_b_id = p_sup and y.cliente_a_id = x.cliente_a_id and y.tipo_relacion = x.tipo_relacion));
  borradas := borradas || jsonb_build_object('cliente_relaciones', v_ids);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]') into v_ids from portal_vinculo x where x.cliente_id = p_lap
     and exists (select 1 from portal_vinculo y where y.cliente_id = p_sup and y.identidad_id = x.identidad_id);
  borradas := borradas || jsonb_build_object('portal_vinculo', v_ids);

  delete from cliente_telefonos t where t.cliente_id = p_lap and t.telefono_lookup_hash is not null
     and exists (select 1 from cliente_telefonos o where o.cliente_id = p_sup and o.telefono_lookup_hash = t.telefono_lookup_hash);
  delete from cliente_emails e where e.cliente_id = p_lap and e.email_lookup_hash is not null
     and exists (select 1 from cliente_emails o where o.cliente_id = p_sup and o.email_lookup_hash = e.email_lookup_hash);
  update cliente_telefonos set es_principal = false where cliente_id = p_lap;
  update cliente_emails set es_principal = false where cliente_id = p_lap;

  -- Relaciones entre las dos, y las que la superviviente ya tiene iguales.
  delete from cliente_relaciones x
   where (x.cliente_a_id = p_lap and x.cliente_b_id = p_sup) or (x.cliente_b_id = p_lap and x.cliente_a_id = p_sup);
  delete from cliente_relaciones x where x.cliente_a_id = p_lap
     and exists (select 1 from cliente_relaciones y where y.cliente_a_id = p_sup and y.cliente_b_id = x.cliente_b_id and y.tipo_relacion = x.tipo_relacion);
  delete from cliente_relaciones x where x.cliente_b_id = p_lap
     and exists (select 1 from cliente_relaciones y where y.cliente_b_id = p_sup and y.cliente_a_id = x.cliente_a_id and y.tipo_relacion = x.tipo_relacion);
  delete from portal_vinculo x where x.cliente_id = p_lap
     and exists (select 1 from portal_vinculo y where y.cliente_id = p_sup and y.identidad_id = x.identidad_id);

  -- Los índices ciegos son únicos: se vacían en la lápida ANTES de ponerlos en la superviviente.
  update clientes set dni_lookup_hash = null, email_lookup_hash = null, telefono_lookup_hash = null,
                      email_dominio_hash = null, email_usuario_hash = null
   where id = p_lap;

  -- ─── Lo ELEGIDO de la absorbida: sobreescribe ────────────────────────────
  foreach g in array elegidos loop
    for col in select jsonb_array_elements_text(grupos -> g) loop
      execute format('update clientes s set %1$I = l.%1$I from clientes l where s.id = $1 and l.id = $2', col)
        using p_sup, p_lap;
    end loop;
  end loop;

  -- Si la que desaparece era «cliente» y la superviviente no, la superviviente lo pasa a ser.
  if l.tipo::text = 'cliente' and s.tipo::text <> 'cliente' then
    update clientes set tipo = l.tipo where id = p_sup;
  end if;

  -- ─── Lo que la superviviente no tiene: se hereda ──────────────────────────
  for r in
    select a.attname::text c, format_type(a.atttypid, a.atttypmod) d
      from pg_attribute a
     where a.attrelid = 'seguros.clientes'::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('id','correduria_id','created_at','updated_at','merged_into_cliente_id','import_ref','activo',
                             'tipo','segmento','lead_estado','fuente',
                             'dni_lookup_hash','email_lookup_hash','telefono_lookup_hash','email_dominio_hash','email_usuario_hash')
       and a.attname <> all(bloques)
     order by 1
  loop
    es_texto := r.d like 'character varying%' or r.d = 'text';
    if es_texto then
      execute format('update clientes s set %1$I = l.%1$I from clientes l
          where s.id=$1 and l.id=$2 and nullif(btrim(s.%1$I), '''') is null and nullif(btrim(l.%1$I), '''') is not null', r.c)
        using p_sup, p_lap;
    else
      execute format('update clientes s set %1$I = l.%1$I from clientes l
          where s.id=$1 and l.id=$2 and s.%1$I is null and l.%1$I is not null', r.c)
        using p_sup, p_lap;
    end if;
    get diagnostics n = row_count;
    if n > 0 then heredados := heredados || r.c; end if;
  end loop;
  -- Los hashes, con su valor.
  -- Las direcciones se heredan ENTERAS y solo si la que queda no tiene ninguna parte:
  -- rellenar a trozos daría «Calle A, Sevilla» con el CP de Madrid de la otra.
  if nullif(btrim(coalesce(s.direccion,'')),'') is null and nullif(btrim(coalesce(s.codigo_postal,'')),'') is null
     and nullif(btrim(coalesce(s.ciudad,'')),'') is null and nullif(btrim(coalesce(s.provincia,'')),'') is null
     and not ('direccion' = any(elegidos))
     and coalesce(nullif(btrim(coalesce(l.direccion,'')),''), nullif(btrim(coalesce(l.codigo_postal,'')),''),
                  nullif(btrim(coalesce(l.ciudad,'')),''), nullif(btrim(coalesce(l.provincia,'')),'')) is not null then
    update clientes set direccion = l.direccion, codigo_postal = l.codigo_postal, ciudad = l.ciudad, provincia = l.provincia where id = p_sup;
    heredados := heredados || 'direccion'::text;
  end if;
  if nullif(btrim(coalesce(s.direccion_fiscal,'')),'') is null and nullif(btrim(coalesce(s.cp_fiscal,'')),'') is null
     and nullif(btrim(coalesce(s.ciudad_fiscal,'')),'') is null and nullif(btrim(coalesce(s.provincia_fiscal,'')),'') is null
     and not ('direccion_fiscal' = any(elegidos))
     and coalesce(nullif(btrim(coalesce(l.direccion_fiscal,'')),''), nullif(btrim(coalesce(l.cp_fiscal,'')),''),
                  nullif(btrim(coalesce(l.ciudad_fiscal,'')),''), nullif(btrim(coalesce(l.provincia_fiscal,'')),'')) is not null then
    update clientes set direccion_fiscal = l.direccion_fiscal, cp_fiscal = l.cp_fiscal, ciudad_fiscal = l.ciudad_fiscal, provincia_fiscal = l.provincia_fiscal where id = p_sup;
    heredados := heredados || 'direccion_fiscal'::text;
  end if;
  -- El índice del DNI solo acompaña a un DNI heredado: nunca se pone junto a un DNI propio distinto.
  if s.dni_lookup_hash is null and h_dni is not null and nullif(btrim(coalesce(s.dni, '')), '') is null then
    update clientes set dni_lookup_hash = h_dni where id = p_sup;
  end if;
  -- Un usuario de acceso no puede quedar en dos fichas.
  if 'usuario_id' = any(heredados) then
    update clientes set usuario_id = null where id = p_lap;
  end if;
  if 'telefono' = any(heredados) then
    update clientes set telefono_lookup_hash = h_tel where id = p_sup;
  end if;
  if 'email' = any(heredados) then
    update clientes set email_lookup_hash = h_email, email_dominio_hash = h_dom, email_usuario_hash = h_usr where id = p_sup;
  end if;

  -- ─── Reapuntar todo lo que cuelga de la lápida ────────────────────────────
  for r in
    select c.conrelid::regclass::text tn, a.attname::text cn
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f' and c.confrelid = 'seguros.clientes'::regclass
       and not (c.conrelid = 'seguros.clientes'::regclass and a.attname = 'merged_into_cliente_id')
       and c.conrelid <> 'seguros.cliente_merge_log'::regclass
     order by 1, 2
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) -> ''id''), ''[]'') from %s t where %I = $1', r.tn, r.cn) into v_ids using p_lap;
    if jsonb_array_length(v_ids) > 0 then deps := deps || jsonb_build_object(r.tn || '.' || r.cn || ':ids', v_ids); end if;
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tn, r.cn, r.cn) using p_sup, p_lap;
      get diagnostics n = row_count;
      if n > 0 then deps := deps || jsonb_build_object(r.tn || '.' || r.cn, n); end if;
    exception when others then
      -- Tabla append-only o índice único: fila a fila, y lo que no quepa se queda en la lápida.
      n := 0; v_saltadas := 0;
      for v_row in execute format('select ctid from %s where %I = $1', r.tn, r.cn) using p_lap loop
        begin
          execute format('update %s set %I = $1 where ctid = $2', r.tn, r.cn) using p_sup, v_row.ctid;
          n := n + 1;
        exception when others then
          v_saltadas := v_saltadas + 1;
        end;
      end loop;
      if n > 0 then deps := deps || jsonb_build_object(r.tn || '.' || r.cn, n); end if;
      if v_saltadas > 0 then sin_mover := sin_mover || jsonb_build_object(r.tn || '.' || r.cn, v_saltadas); end if;
    end;
  end loop;

  -- La superviviente, si se quedó sin principal en columna pero tiene hijas, espeja la principal.
  update cliente_telefonos t set es_principal = true
   where t.id = (select id from cliente_telefonos where cliente_id = p_sup
                  order by (telefono_lookup_hash is not distinct from (select telefono_lookup_hash from clientes where id = p_sup)) desc,
                           es_principal desc, created_at limit 1)
     and not exists (select 1 from cliente_telefonos where cliente_id = p_sup and es_principal);
  update cliente_emails e set es_principal = true
   where e.id = (select id from cliente_emails where cliente_id = p_sup
                  order by (email_lookup_hash is not distinct from (select email_lookup_hash from clientes where id = p_sup)) desc,
                           es_principal desc, created_at limit 1)
     and not exists (select 1 from cliente_emails where cliente_id = p_sup and es_principal);
  update clientes c set telefono = t.telefono, telefono_lookup_hash = t.telefono_lookup_hash
    from cliente_telefonos t
   where c.id = p_sup and t.cliente_id = p_sup and t.es_principal and nullif(btrim(coalesce(c.telefono, '')), '') is null;
  update clientes c set email = e.email, email_lookup_hash = e.email_lookup_hash,
                        email_dominio_hash = e.email_dominio_hash, email_usuario_hash = e.email_usuario_hash
    from cliente_emails e
   where c.id = p_sup and e.cliente_id = p_sup and e.es_principal and nullif(btrim(coalesce(c.email, '')), '') is null;

  -- Una relación de la ficha consigo misma (quedaba entre las dos) no significa nada.
  delete from cliente_relaciones where cliente_a_id = p_sup and cliente_b_id = p_sup;

  update clientes set merged_into_cliente_id = p_sup, updated_at = now() where id = p_lap;
  update clientes set updated_at = now() where id = p_sup;

  insert into cliente_merge_log
    (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
     inherited_fields, cohort_movido, deps_repointed, snapshot_before, snapshot_superviviente, lote, actor)
  values (p_correduria, p_lap, p_sup,
    coalesce(nullif(btrim(p_justificacion), ''), 'Misma persona, confirmada desde la pantalla.'),
    heredados || elegidos, false,
    deps || jsonb_build_object('sin_mover', sin_mover, 'borradas', borradas, 'insertadas', insertadas), snap_l, snap_s,
    'fusion-pantalla', p_actor);

  insert into historial_interno (id, correduria_id, cliente_id, tipo, texto, created_at)
  values (gen_random_uuid(), p_correduria, p_sup, 'gestion',
    'Fusionada en esta ficha la duplicada ' || coalesce(nullif(btrim(concat_ws(' ', l.nombre, l.apellidos)), ''), 'sin nombre')
    || ' por ' || p_actor || '. Elegido de la otra: ' || coalesce(nullif(array_to_string(elegidos, ', '), ''), 'nada')
    || '. Heredado (vacío aquí): ' || coalesce(nullif(array_to_string(heredados, ', '), ''), 'nada') || '.', now());

  return jsonb_build_object('elegidos', to_jsonb(elegidos), 'heredados', to_jsonb(heredados), 'sin_mover', sin_mover);
end $$;

revoke all on function seguros.fusionar_clientes(uuid, uuid, uuid, text[], text, text) from public;
revoke all on function seguros.fusionar_clientes(uuid, uuid, uuid, text[], text, text) from crm_seguros;
grant execute on function seguros.fusionar_clientes(uuid, uuid, uuid, text[], text, text) to prisma_seguros;
