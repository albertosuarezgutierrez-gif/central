-- La dirección buena YA ESTÁ EN CASA: vive en la lápida de la fusión (06/09/2026).
--
-- ── QUÉ SE ARREGLA Y POR QUÉ EXISTÍA ───────────────────────────────────────────────────────────
-- Alberto, sobre la ficha de Manuel Antonio Piña Franco: «también le sale Tarragona». Su ficha
-- decía «41807 34304, Tarragona» — un CP de Sevilla, un número donde va la ciudad y una provincia
-- que no es ninguna de las dos.
--
-- La causa NO es el volcado: es cómo funde el motor de fusión. `fusion_*` **hereda huecos**, y eso
-- es lo correcto — un dato presente en la superviviente manda sobre el de la lápida. Pero «34304»
-- no es un dato: es el identificador de población del CRM viejo aterrizado en la columna `ciudad`.
-- Como NO es NULL, la herencia no lo pisó, y la ciudad de verdad («ESPARTINAS») se quedó en la
-- lápida mientras la ficha viva enseñaba el número. Es el tercer hermano de la regla del
-- CLAUDE.md raíz: **el «no lo sé» DISFRAZADO DE VALOR se cuela por toda guarda basada en NULL**.
--
-- Medido el 06/09/2026: **357 supervivientes** tienen la ciudad sin una sola letra teniendo una
-- lápida suya que guarda el nombre. De ellas **10 tienen póliza viva**.
--
-- ── LO QUE ESTE LOTE NO HACE: ADIVINAR ─────────────────────────────────────────────────────────
-- No deriva nada del código postal. Solo COPIA lo que ya está guardado en la lápida de la propia
-- ficha, y únicamente cuando **el CP de las dos coincide exactamente**. Sin esa guarda esto sería
-- inventarse el domicilio de una persona:
--
--   · 7f2b661e Juan Manuel Lopez Benjumea — viva 41907, lápida 41927 «MAIRENA DEL ALJARAFE».
--     41927 es Mairena; 41907 es Valencina de la Concepción. Son dos pueblos.
--   · d765d66c Antonio Navarro Perez     — viva 41004 (Sevilla capital), lápida 41500
--     «TORREQUINTO (URBANIZACION)», que es Alcalá de Guadaíra.
--
-- Esas **12 fichas** (2 de ellas con póliza viva) se quedan como están y salen por `notice`. Una
-- dirección que no se sabe se queda sin saber; la ficha ya la enseña como reparo (`leerSitio`).
--
-- ── REVERSIBLE POR CONSTRUCCIÓN ────────────────────────────────────────────────────────────────
-- La lápida NO se toca y conserva su copia, así que el valor de origen sigue disponible. Lo que se
-- sobrescribe es basura conocida (un número donde va un nombre), no un dato que alguien tecleara.
-- Idempotente: al repetirlo, las ya corregidas dejan de cumplir la condición y no se tocan.

do $$
declare
  n_ciudad int := 0;
  n_prov   int := 0;
  r record;
begin

  ------------------------------------------------------------------------------------------------
  -- BLOQUE A — la ciudad, recuperada de la lápida. Solo con el MISMO código postal.
  ------------------------------------------------------------------------------------------------
  for r in
    select s.id, s.ciudad as antes, l.ciudad as despues, s.codigo_postal,
           exists (select 1 from seguros.polizas p
                    where p.cliente_id = s.id
                      and (p.import_ref is null or p.eiac_xml_hash is not null)) as viva,
           s.correduria_id
      from seguros.clientes s
      join lateral (
        select l.* from seguros.clientes l
         where l.merged_into_cliente_id = s.id
           and l.ciudad ~ '[[:alpha:]]'
           and l.codigo_postal is not distinct from s.codigo_postal
         order by l.created_at
         limit 1
      ) l on true
     where s.merged_into_cliente_id is null
       and s.ciudad is not null
       and s.ciudad !~ '[[:alpha:]]'
  loop
    update seguros.clientes
       set ciudad = r.despues, updated_at = now()
     where id = r.id;
    n_ciudad := n_ciudad + 1;

    -- Rastro SOLO en las fichas de cartera viva: son las que alguien abre. Anotar las 337 muertas
    -- llenaría su historial de ruido que nadie va a leer.
    if r.viva then
      insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
      values (r.correduria_id, r.id, 'gestion',
              format('Dirección: ciudad corregida de «%s» a «%s» (CP %s sin cambios). El nombre '
                  || 'estaba guardado en la ficha duplicada que se fusionó con esta; la fusión '
                  || 'hereda huecos y no pisó el identificador de población del CRM viejo. '
                  || 'Lote 2026-09-06_direccion_recuperar_de_lapida.',
                  r.antes, r.despues, coalesce(r.codigo_postal,'—')));
    end if;
  end loop;

  -- Las que NO se tocan, dichas en voz alta.
  for r in
    select s.id, s.ciudad, s.codigo_postal as cp_viva, l.ciudad as ciudad_lapida,
           l.codigo_postal as cp_lapida
      from seguros.clientes s
      join lateral (
        select l.* from seguros.clientes l
         where l.merged_into_cliente_id = s.id and l.ciudad ~ '[[:alpha:]]'
         order by l.created_at limit 1
      ) l on true
     where s.merged_into_cliente_id is null
       and s.ciudad is not null and s.ciudad !~ '[[:alpha:]]'
  loop
    raise notice 'SIN TOCAR %: ciudad «%» CP % — la lápida dice «%» pero con CP %, que es otra población',
      left(r.id::text,8), r.ciudad, coalesce(r.cp_viva,'—'), r.ciudad_lapida, coalesce(r.cp_lapida,'—');
  end loop;

  ------------------------------------------------------------------------------------------------
  -- BLOQUE B — la provincia que contradice al CP. Por id, una a una, y solo donde hay DOS fuentes
  -- independientes de acuerdo (el CP y el nombre de la ciudad). No se deriva del CP a secas: el
  -- equivocado podría ser el CP.
  ------------------------------------------------------------------------------------------------
  for r in
    select * from (values
      -- uuid completo, provincia mala, provincia buena, por qué se puede afirmar
      ('d1513322-f48f-4f13-9d18-4d46bb4fa286', 'Tarragona', 'Sevilla',
       'CP 41005 es de Sevilla y la ciudad guardada ya decía «(Sevilla)»'),
      ('53148321-fef8-4b27-a84a-5948b2296885', 'Girona',    'A Coruña',
       'CP 15006 es de A Coruña y la ciudad guardada ya decía «CORUÑA, A»'),
      ('e33f2674-91ce-4682-b869-3d9637728905', 'Castellón', 'Cantabria',
       'CP 39700 es de Cantabria y su lápida dice «CASTRO URDIALES» con ese MISMO CP'),
      ('94fa2f31-e135-4ec2-820f-b6c0b6f155a4', 'Tarragona', 'Sevilla',
       'CP 41807 es de Sevilla y su lápida dice «ESPARTINAS» con ese MISMO CP')
    ) as t(cid, mala, buena, motivo)
  loop
    update seguros.clientes c
       set provincia = r.buena, updated_at = now()
     where c.id = r.cid::uuid
       and c.merged_into_cliente_id is null
       and c.provincia = r.mala;          -- si ya está corregida, no se toca

    if found then
      n_prov := n_prov + 1;
      insert into seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
      select c.correduria_id, c.id, 'gestion',
             format('Dirección: provincia corregida de «%s» a «%s». %s. '
                 || 'Lote 2026-09-06_direccion_recuperar_de_lapida.', r.mala, r.buena, r.motivo)
        from seguros.clientes c
       where c.id = r.cid::uuid and c.merged_into_cliente_id is null;
    else
      raise notice 'provincia %: ya estaba corregida o la ficha no dice «%», se salta', left(r.cid,8), r.mala;
    end if;
  end loop;

  raise notice '── ciudades recuperadas de la lápida: %  ·  provincias corregidas: %', n_ciudad, n_prov;
end $$;
