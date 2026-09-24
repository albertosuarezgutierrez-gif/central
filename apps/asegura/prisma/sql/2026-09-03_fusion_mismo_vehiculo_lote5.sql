-- Fusión de 3 pares por MISMO NOMBRE + MISMO VEHÍCULO (lote `fusion-mismo-vehiculo-2026-09-03`).
--
-- El caso, dictado por Alberto el 03/09/2026 desde la ficha de José Suárez Salas:
-- «👤 Personas en sus pólizas» enseñaba a «María Antonia Gutiérrez Alcalá» DOS veces,
-- con las mismas tres matrículas. No era un fallo de agrupación —`personasDePolizas`
-- tiene prohibido fundir dos identidades— sino DOS FICHAS de la misma persona:
--
--   `intranet:cli:48`      Maria Antonia Gutierrez Alcala   CON DNI · 1 póliza viva de CIMA
--   `asegura_app:cli2:48`  María Antonia Gutierrez Alcala   SIN DNI · 2 pólizas del volcado
--
-- y lo caro no era el duplicado: el vínculo «Cónyuge/Pareja de Hecho» con José y su
-- AUTORIZACIÓN para ver sus seguros cuelgan de la ficha del volcado, la que no tiene
-- ninguna póliza viva. O sea, el consentimiento estaba anotado en la ficha que no es.
--
-- GUARDA DE IDENTIDAD de este lote (la que decide, y por eso solo salen 3 pares):
--   1. nombre + apellidos IDÉNTICOS normalizados (sin tildes, sin dobles espacios,
--      en minúsculas), y
--   2. las dos fichas intervienen en pólizas del MISMO VEHÍCULO (matrícula normalizada
--      común), que es lo que convierte una etiqueta —el nombre— en un identificador, y
--   3. NO hay dos DNI distintos (regla del repo: dos identificadores distintos no se
--      funden jamás, coincida lo que coincida el resto).
-- Superviviente = la ficha CON `dni_lookup_hash`; lápida = la que no lo tiene. En los
-- tres pares hay exactamente una de cada, así que el reparto no lo elige nadie a ojo.
--
-- ⚠️ Este lote NO exige que el superviviente tenga pólizas de CIMA (a diferencia del
-- lote 4): en el par «Jose Carlos Jaenes Sanchez» ninguna de las dos tiene ninguna viva
-- y siguen siendo la misma persona. Lo que sí se exige es que la LÁPIDA no tenga
-- ninguna de CIMA: si la tuviera, no sería la gemela del volcado.
--
-- Medido el 03/09/2026 sobre TODA la cartera sin fusionar: 3 pares cumplen las tres
-- condiciones. Con solo la primera (mismo nombre) habría 1.010 pares que además
-- comparten el número de import (`intranet:cli:N` / `asegura_app:cli2:N`) — y ese N NO
-- es un identificador compartido: de los 4.093 pares que lo comparten, solo el 25%
-- comparte además el nombre. Fusionar por nombre sería fundir parientes homónimos.
--
-- 🚫 QUIÉN QUEDA FUERA a propósito, y es el ejemplo de por qué hace falta la condición 2:
-- «Salvador Pérez Jiménez» tiene TRES fichas sin fusionar (`asegura_app:cli2:16541` CON
-- DNI, `intranet:cli:325` y `asegura_app:cli2:325`, las dos sin él) y NINGUNA comparte
-- vehículo con otra: 5242DFY · ninguna · 8100FTK+8849HLB. Con ese dato no se puede
-- afirmar que sean la misma persona —pueden ser un padre y un hijo— así que no se tocan.
-- También quedan fuera los 8 pares de mismo nombre con DOS DNI distintos.
--
-- Motor idéntico a `2026-09-02_fusion_dni_lote2.sql` (allí está explicado paso a paso) y
-- a `2026-09-03_fusion_poliza_comun_lote4.sql`. Reversible: la lápida no se borra y
-- `cliente_merge_log.snapshot_before` guarda la ficha entera.
--
-- 🚨 Incorpora de serie la segunda pasada que en el lote 4 hubo que añadir después: el
-- paso 2 anula los índices ciegos de la lápida ANTES de la herencia, así que un
-- email/teléfono heredado se quedaría sin su `*_lookup_hash` y la ficha no aparecería al
-- buscarlo — un vacío que se lee como «no está en la cartera». Se repone al final.
do $$
declare
  pares constant uuid[][] := array[
    -- [superviviente (con DNI), lápida (sin DNI)]
    -- María Antonia Gutiérrez Alcalá — vehículos 0432GLT, 7791GVM, 9833LJC (los de José Suárez Salas)
    ['cca86411-94c1-4f9f-b5bd-144198f58fbd','7b1ea9b9-2e66-49fa-8327-a5d7f5a53d83'],
    -- Pablo Guzmán Lozano — vehículo 6262DLY
    ['6e6a30ef-0139-4405-aab5-f1bc38a32d5b','0e4fe96b-02f3-49bb-b265-d8d5a2fd57ca'],
    -- José Carlos Jaenes Sánchez — vehículo 6976CGR
    ['3379d74e-ef6d-446a-956b-2e78a4adb762','5314d763-917c-479a-8478-8facaf159121']
  ];
  i int; sup uuid; lap uuid; s record; l record; veh text;
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

    -- Guarda 1: el nombre normalizado tiene que ser el MISMO. Es condición necesaria,
    -- nunca suficiente: sola fundiría homónimos, por eso va acompañada de la 2.
    if lower(unaccent(btrim(regexp_replace(coalesce(s.nombre,'') || ' ' || coalesce(s.apellidos,''), '\s+', ' ', 'g'))))
       is distinct from
       lower(unaccent(btrim(regexp_replace(coalesce(l.nombre,'') || ' ' || coalesce(l.apellidos,''), '\s+', ' ', 'g'))))
    then
      raise exception 'el par %/% no tiene el mismo nombre normalizado: fuera del criterio de este lote', sup, lap;
    end if;

    -- Guarda 2: las dos intervienen en pólizas del MISMO vehículo. Sin esto no hay
    -- identidad, solo una etiqueta que se repite entre parientes.
    select x.mt into veh from
      (select distinct upper(regexp_replace(coalesce(p.datos_especificos->>'matricula',''),'[^A-Za-z0-9]','','g')) mt
         from seguros.poliza_intervinientes i join seguros.polizas p on p.id = i.poliza_id
        where i.cliente_id = sup and coalesce(p.datos_especificos->>'matricula','') <> '') x
      join
      (select distinct upper(regexp_replace(coalesce(p.datos_especificos->>'matricula',''),'[^A-Za-z0-9]','','g')) mt
         from seguros.poliza_intervinientes i join seguros.polizas p on p.id = i.poliza_id
        where i.cliente_id = lap and coalesce(p.datos_especificos->>'matricula','') <> '') y
      on y.mt = x.mt
      limit 1;
    if veh is null then
      raise exception 'el par %/% no comparte vehículo: fuera del criterio de este lote', sup, lap;
    end if;

    -- Guarda 3: dos DNI distintos NO se funden jamás; y el superviviente es el que lo tiene.
    if s.dni_lookup_hash is not null and l.dni_lookup_hash is not null
       and s.dni_lookup_hash <> l.dni_lookup_hash then
      raise exception 'el par %/% tiene DOS DNI distintos: no se funde', sup, lap;
    end if;
    if s.dni_lookup_hash is null then
      raise exception 'el superviviente % no tiene DNI: en este lote sobrevive la ficha identificada', sup;
    end if;
    if (select count(*) from seguros.polizas p where p.cliente_id = lap and p.import_ref is null and p.merged_into_poliza_id is null) > 0 then
      raise exception 'la lapida % tiene polizas de CIMA: no es la gemela del volcado', lap;
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
      'las dos fichas tienen el mismo nombre y apellidos normalizados y ADEMAS intervienen '
      || 'en polizas del mismo vehiculo (matricula ' || veh || '), que es lo que convierte el '
      || 'nombre en identidad; la superviviente es la unica de las dos con DNI y la lapida no '
      || 'tiene ninguna poliza de CIMA. Alberto lo dicto el 03/09/2026 al ver a Maria Antonia '
      || 'Gutierrez Alcala duplicada en la ficha de Jose Suarez Salas.',
      heredados, false, deps, snap, 'fusion-mismo-vehiculo-2026-09-03',
      'claude-code (dictado de Alberto 03/09/2026: «prepara»)');
  end loop;
end $$;

-- ── Reposición de los índices ciegos (el fallo latente del motor) ──────────────
-- El paso 2 anula los hashes de la lápida ANTES del paso 3, así que un email o un
-- teléfono heredado se queda sin su índice ciego y la ficha NO aparece al buscarlo.
-- Se repone desde `snapshot_before`, solo si el superviviente no tiene hash y nadie
-- más lo usa (los tres índices son únicos). El de DNI no puede aplicar en este lote
-- (la lápida nunca lo tiene) pero se deja por simetría: si un día no se cumple, que
-- no se pierda el índice en silencio.
update seguros.clientes s
   set email_lookup_hash = (m.snapshot_before->>'email_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-mismo-vehiculo-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.email_lookup_hash is null
   and nullif(m.snapshot_before->>'email_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.email_lookup_hash = m.snapshot_before->>'email_lookup_hash');

update seguros.clientes s
   set telefono_lookup_hash = (m.snapshot_before->>'telefono_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-mismo-vehiculo-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.telefono_lookup_hash is null
   and nullif(m.snapshot_before->>'telefono_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.telefono_lookup_hash = m.snapshot_before->>'telefono_lookup_hash');

update seguros.clientes s
   set dni_lookup_hash = (m.snapshot_before->>'dni_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-mismo-vehiculo-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.dni_lookup_hash is null
   and nullif(m.snapshot_before->>'dni_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.dni_lookup_hash = m.snapshot_before->>'dni_lookup_hash');

-- ── Comprobación después de ejecutar ──────────────────────────────────────────
-- select merged_cliente_id, surviving_cliente_id, inherited_fields, deps_repointed
--   from seguros.cliente_merge_log where lote = 'fusion-mismo-vehiculo-2026-09-03';
-- Esperado: 3 filas. Y en /correduria, la ficha de José Suárez Salas debe enseñar a
-- María Antonia UNA sola vez, con su «Cónyuge/Pareja de Hecho» ya en la ficha con DNI.
