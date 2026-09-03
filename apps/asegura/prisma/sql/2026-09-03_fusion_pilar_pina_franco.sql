-- Fusión de UN par: «Pilar Piña Franco» (lote `fusion-pilar-pina-franco-2026-09-03`).
--
--   superviviente  8eac726e-fd8b-4ede-a8ae-5128b4a7d196  `intranet:cli:174`      alta 30/05/2026
--                  segmento `prospecto` · 0 relaciones · 0 pólizas · 0 intervinientes
--                  **CON `dni_lookup_hash` y CON `email_lookup_hash`**
--   lápida         5a409052-b1be-4522-abcd-a4c389dd55d2  `asegura_app:cli2:174`  alta 21/06/2026
--                  segmento `ex_cliente` · 10 relaciones · 3 pólizas · interviene en 3
--                  · dirección, CP, ciudad, provincia y cuenta bancaria · SIN los dos hashes
--
-- Alberto vio las dos fichas en el buscador el 03/09/2026 y preguntó por qué se duplican.
-- El diagnóstico está en el `CLAUDE.md` de esta app: **el blind index de DNI está a medias**
-- (19.696 fichas con DNI guardado, 15.800 con `dni_lookup_hash` a NULL), así que el lote 2
-- —mismo hash de DNI, el criterio fuerte— no pudo ni preguntar por este par. Este fichero es
-- la fusión a mano de ese par concreto, no un criterio nuevo aplicable a nadie más.
--
-- ── POR QUÉ SOBREVIVE LA QUE NO TIENE NADA ──────────────────────────────────────────────
-- Es contraintuitivo —la lápida trae las 10 relaciones, las 3 pólizas y la dirección— pero
-- sobrevive la ficha IDENTIFICADA, que es la regla de todos los lotes anteriores. Aquí hay
-- además una segunda razón, y conviene que quede escrita: **`email_lookup_hash` es lo único
-- por lo que el portal del cliente engancha una identidad con su ficha**. Si sobreviviera la
-- otra, Pilar entraría al portal y no vería nada — un vacío que se lee como «no tienes
-- pólizas» y que no daría ningún error. Todo lo que trae la lápida se mueve (paso 4) y sus
-- huecos se heredan (paso 3); lo que NO se puede mover es un índice ciego que no existe.
--
-- ── 🚨 LO QUE AUTORIZA ESTA FUSIÓN, DICHO CON TODAS LAS LETRAS ──────────────────────────
-- **Este par NO cumple la guarda automática de ninguno de los lotes anteriores.**
--   · lote 2 (mismo hash de DNI):     imposible, la lápida no tiene hash de DNI.
--   · lote 4 (póliza común de CIMA):  imposible, ninguna de las dos tiene pólizas de CIMA.
--   · lote 5 (mismo vehículo):        imposible, la superviviente no tiene NINGUNA póliza,
--                                     así que no hay matrícula que cruzar.
-- Comparten el número del import (174: `intranet:cli:174` y `asegura_app:cli2:174`) y **ese N
-- NO es un identificador compartido**: lo midió el propio lote 5 — de los 4.093 pares que lo
-- comparten, solo el 25% comparte además el nombre. Es exactamente el caso «Salvador Pérez
-- Jiménez» que el lote 5 dejó fuera A PROPÓSITO por no poder distinguir a una persona de su
-- padre o su hijo.
--
-- **Lo que autoriza esta fusión es la palabra del corredor: Alberto afirmó el 03/09/2026
-- que «Pilar Piña Franco solo hay una».** Una persona que conoce a su clienta es mejor
-- identificador que una heurística, pero **no es lo mismo que un DNI medido**, y quien lea
-- esto dentro de seis meses tiene que poder distinguir las dos cosas: esto es una fusión
-- **por afirmación del corredor, con fecha**, no por identificador común medido.
--
-- Lo que SÍ está medido el 03/09/2026 y sostiene esa afirmación (corroboración, no prueba):
--   · **En TODA la base hay exactamente 2 fichas** cuyo nombre+apellidos normalizados son
--     «pilar pina franco», y son estas dos. Ninguna otra. La afirmación de Alberto y el
--     recuento dicen lo mismo.
--   · **Las dos tienen el MISMO `telefono_lookup_hash`** (idéntico byte a byte), y solo esas
--     dos fichas lo tienen en toda la cartera. Es el criterio del **lote 3**
--     (`fusion-nombre-telefono`, nombre + apellidos + teléfono, con OK expreso de Alberto).
--     ⚠️ Aquel lote se limitó a los grupos que TOCAN la cartera viva y este par no la toca,
--     por eso quedó entre los ~545 apartados. Y el propio `CLAUDE.md` dice por qué el
--     teléfono solo no basta: **740 grupos comparten teléfono y 203 tienen nombres
--     distintos** — un fijo compartido suele ser una familia. Aquí el nombre y el apellido
--     coinciden y no hay tercera ficha con ese nombre, pero el teléfono sigue siendo
--     corroboración, no identidad.
--   · La lápida NO tiene ninguna póliza de CIMA: sus 3 son `asegura_app:pol2:*` del volcado
--     (Direct Seguros 67230588 `activa`, Plus Ultra GPAFM1300735 y Generali UV-G-410058469
--     las dos `fin_riesgo`), ninguna con `eiac_xml_hash`. O sea, es la gemela del volcado.
--     **Esta fusión no mueve ni una póliza de la cartera viva.**
--
-- ── 🚨 EL DNI: NO SE HA PODIDO MEDIR, Y ESO NO ES «NO HAY DOS DNI» ──────────────────────
-- Medido el 03/09/2026 mirando la columna, que era la duda razonable:
--   · la lápida SÍ tiene `dni` guardado (cifrado `v1:…`, 57 caracteres) — lo que no tiene es
--     el `dni_lookup_hash`. «Sin hash» ≠ «sin DNI»;
--   · la superviviente tiene las dos cosas, y su hash es ÚNICO en la base (1 ficha).
-- Los dos ciphertexts son distintos y **eso no prueba absolutamente nada en ninguna de las
-- dos direcciones**: el cifrado es AES-256-GCM con IV aleatorio (`@central/module-seguros-pii`),
-- así que el MISMO DNI cifrado dos veces sale distinto. Y el hash, que sí es determinista,
-- solo lo tiene una de las dos. Desde SQL, con las claves fuera de la base, esta pregunta no
-- se puede responder. Así que aquí no se afirma que los DNI coincidan **ni** que difieran.
--
-- ✋ **PRE-VUELO OBLIGATORIO ANTES DE EJECUTAR ESTE FICHERO** — la pregunta sí se puede
-- responder, pero desde la app, que es la que tiene `PII_ENCRYPTION_KEY` y `PII_LOOKUP_KEY`:
--
--     GET /api/operador/backfill-dni      (Bearer ASEGURA_OPERADOR_SECRET; EN SECO, no escribe)
--
-- Busca los dos uuid en la respuesta:
--   · aparecen JUNTOS en un mismo grupo de `choques`  → mismo DNI: la fusión pasa a estar
--     respaldada por el criterio fuerte y esta cabecera se queda corta, no larga. Adelante.
--   · la lápida NO aparece en un choque con la superviviente → **son DOS DNI DISTINTOS: NO SE
--     EJECUTA ESTE FICHERO.** La regla del repo no admite matices — dos identificadores
--     distintos no se funden jamás, coincida lo que coincida el resto (nombre, teléfono, y la
--     palabra de Alberto incluida: querría decir que hay dos Pilar Piña Franco).
--   · la lápida sale como `ilegible` → su DNI no descifra: sigue sin saberse, y entonces
--     ejecutar esto es asumir a conciencia la afirmación del corredor.
-- El paso 8 de las guardas de abajo cubre el mismo choque DENTRO de la transacción, pero solo
-- puede actuar si alguien ya corrió el backfill: si el hash de la lápida sigue a NULL, la
-- guarda no ve nada y no protege de nada. Por eso el pre-vuelo es de fuera, no de aquí.
--
-- ── QUÉ CUESTA EQUIVOCARSE (para dimensionar el riesgo, no para asustar) ────────────────
-- El paso 3 hereda los HUECOS de la superviviente, y sus huecos son justo los datos
-- personales de la lápida: `direccion` (cifrada), `codigo_postal`, `ciudad`, `provincia`,
-- `fuente` y **`cuenta_bancaria` (IBAN)**. Si fueran dos personas, esto pone el IBAN y el
-- domicilio de una en la ficha de la otra. No se deshace con un `UPDATE` a ojo — se deshace
-- con `snapshot_before`, que es exactamente para esto.
--
-- ── REVERSIBLE E IDEMPOTENTE ────────────────────────────────────────────────────────────
-- Igual que los lotes anteriores: **la lápida NO se borra**. Se marca con
-- `merged_into_cliente_id` y queda fila en `cliente_merge_log` con `snapshot_before` (la ficha
-- entera antes de tocarla) y `deps_repointed` (cuántas filas se movieron, tabla a tabla).
-- ⚠️ `cliente_merge_log` es **append-only** (triggers `cliente_merge_log_no_update` /
-- `_no_delete`): una corrección posterior NO se anota editando su fila; lo que vale como
-- auditoría es el snapshot, y el relato va aquí y en la memoria.
-- **Idempotente de verdad:** si el par ya está fusionado por ESTE lote, el bloque lo dice con
-- un `notice` y no toca nada (los lotes anteriores abortaban con excepción; aquí se prefiere
-- que una segunda ejecución sea un no-op limpio, porque este fichero se ejecuta a mano).
--
-- Motor: el mismo de `2026-09-02_fusion_dni_lote2.sql` (allí está explicado paso a paso) y
-- `2026-09-03_fusion_mismo_vehiculo_lote5.sql`, entero y sin recortar — las 5 fases, el
-- recorrido del catálogo de FKs (31 columnas de 29 tablas apuntan a `clientes.id`, así que no
-- se escribe la lista a mano) y la reposición final de los índices ciegos.
do $$
declare
  pares constant uuid[][] := array[
    -- [superviviente (con DNI y email indexados), lápida (la que trae los datos)]
    -- Pilar Piña Franco — `intranet:cli:174` sobrevive a `asegura_app:cli2:174`
    ['8eac726e-fd8b-4ede-a8ae-5128b4a7d196','5a409052-b1be-4522-abcd-a4c389dd55d2']
  ];
  lote_nombre constant text := 'fusion-pilar-pina-franco-2026-09-03';
  i int; sup uuid; lap uuid; s record; l record;
  r record; n int; deps jsonb; snap jsonb; heredados text[]; corr uuid; es_texto bool;
begin
  for i in 1 .. array_length(pares,1) loop
    sup := pares[i][1]; lap := pares[i][2];
    deps := '{}'::jsonb; heredados := '{}';

    -- 0. Existencia y encuadre. Nada de esto es paranoia: este fichero se ejecuta a mano y
    --    un uuid mal pegado no da error, da la ficha de otra persona.
    if sup = lap then raise exception 'superviviente y lápida coinciden: %', sup; end if;
    select * into s from seguros.clientes where id = sup;
    if not found then raise exception 'el superviviente % no existe', sup; end if;
    select * into l from seguros.clientes where id = lap;
    if not found then raise exception 'la lápida % no existe', lap; end if;

    -- 0b. IDEMPOTENCIA. Si el par ya está fusionado por este mismo lote, no se hace nada:
    --     repetir el paso 3 sobre una lápida ya vaciada no rompería, pero insertaría una
    --     SEGUNDA fila en un libro append-only, y entonces el libro contaría dos fusiones
    --     donde hubo una.
    if l.merged_into_cliente_id = sup
       and exists (select 1 from seguros.cliente_merge_log m
                    where m.lote = lote_nombre and m.merged_cliente_id = lap
                      and m.surviving_cliente_id = sup) then
      raise notice 'el par %/% ya estaba fusionado por el lote %: no se toca nada', sup, lap, lote_nombre;
      continue;
    end if;

    -- 0c. Cualquier OTRA lápida previa es un caso que no entiende este fichero: alguien
    --     fusionó una de las dos con una tercera ficha. Se para y se mira a mano.
    if s.merged_into_cliente_id is not null or l.merged_into_cliente_id is not null then
      raise exception 'el par %/% ya tiene una lápida hacia otra ficha', sup, lap;
    end if;
    if s.correduria_id <> l.correduria_id then
      raise exception 'el par %/% es de dos corredurías', sup, lap;
    end if;
    select to_jsonb(c) into snap from seguros.clientes c where c.id = lap;
    corr := l.correduria_id;

    -- ── Guardas de identidad ─────────────────────────────────────────────────────────
    -- Ninguna de estas DEMUESTRA la identidad (eso lo pone Alberto, ver cabecera). Lo que
    -- hacen es impedir que este fichero fusione otra cosa si alguien lo reutiliza con
    -- otros uuid: cada una es una condición NECESARIA que sí se puede medir.

    -- Guarda 1: nombre + apellidos IDÉNTICOS normalizados (sin tildes, sin dobles espacios,
    -- en minúsculas). Condición necesaria y nunca suficiente: sola fundiría homónimos.
    if lower(unaccent(btrim(regexp_replace(coalesce(s.nombre,'') || ' ' || coalesce(s.apellidos,''), '\s+', ' ', 'g'))))
       is distinct from
       lower(unaccent(btrim(regexp_replace(coalesce(l.nombre,'') || ' ' || coalesce(l.apellidos,''), '\s+', ' ', 'g'))))
    then
      raise exception 'el par %/% no tiene el mismo nombre normalizado: fuera del criterio de este lote', sup, lap;
    end if;

    -- Guarda 2: el MISMO teléfono, comparado por su índice ciego (determinista) y no por el
    -- valor cifrado (que no se puede comparar). Es lo único medible que tiene este par en
    -- lugar del vehículo del lote 5 o la póliza del lote 4 — y por eso vale como
    -- corroboración, no como identidad: un fijo compartido suele ser una familia.
    if s.telefono_lookup_hash is null or s.telefono_lookup_hash is distinct from l.telefono_lookup_hash then
      raise exception 'el par %/% no comparte el índice ciego de teléfono: fuera del criterio de este lote', sup, lap;
    end if;

    -- Guarda 3: el superviviente es el IDENTIFICADO. Si esto falla, los uuid están al revés
    -- —y al revés esta fusión dejaría a Pilar sin poder entrar al portal (ver cabecera).
    if s.dni_lookup_hash is null then
      raise exception 'el superviviente % no tiene DNI indexado: en este lote sobrevive la ficha identificada', sup;
    end if;
    if s.email_lookup_hash is null then
      raise exception 'el superviviente % no tiene email indexado: es la razón por la que sobrevive', sup;
    end if;

    -- Guarda 4: DOS DNI DISTINTOS NO SE FUNDEN JAMÁS. ⚠️ Hoy esta guarda **no puede actuar**
    -- porque la lápida tiene el hash a NULL (el blind index está a medias); no ver un choque
    -- aquí NO es haber comprobado que no lo hay. La comprobación de verdad es el pre-vuelo
    -- de la cabecera (`GET /api/operador/backfill-dni`). Se deja escrita porque el día que
    -- alguien corra el backfill antes que esto, quiere fallar en vez de fusionar.
    if l.dni_lookup_hash is not null and s.dni_lookup_hash <> l.dni_lookup_hash then
      raise exception 'el par %/% tiene DOS DNI distintos: no se funde', sup, lap;
    end if;

    -- Guarda 5: la lápida es la gemela del VOLCADO. Si tuviera una póliza de CIMA sería una
    -- ficha viva y la dirección de esta fusión habría que pensarla otra vez.
    if (select count(*) from seguros.polizas p
         where p.cliente_id = lap and p.merged_into_poliza_id is null
           and (p.import_ref is null or p.eiac_xml_hash is not null)) > 0 then
      raise exception 'la lápida % tiene pólizas de cartera viva: no es la gemela del volcado', lap;
    end if;

    -- Guarda 6: choque de intervinientes. `uq_intervinientes_correduria_poliza_nif_hash` es
    -- único por (correduría, póliza, hash de NIF): si las dos fichas intervinieran en la
    -- MISMA póliza, el paso 4 reventaría a mitad. Medido el 03/09/2026: la superviviente no
    -- interviene en ninguna, así que hoy no puede pasar — se comprueba igual porque un
    -- reapuntado que revienta a medias deja el trabajo hecho a trozos.
    if exists (
      select 1 from seguros.poliza_intervinientes a
        join seguros.poliza_intervinientes b
          on b.poliza_id = a.poliza_id
         and b.correduria_id = a.correduria_id
         and b.nif_lookup_hash is not distinct from a.nif_lookup_hash
       where a.cliente_id = lap and b.cliente_id = sup and a.nif_lookup_hash is not null
    ) then
      raise exception 'el par %/% interviene en la misma póliza con el mismo NIF: se revisa a mano', sup, lap;
    end if;

    -- 1. Conflictos que reventarían el reapuntado (índices únicos), ANTES de mover.
    --    `uq_cliente_relaciones_a_b_tipo` es único por (A, B, tipo). Aquí no hay ninguno
    --    —las 10 relaciones de la lápida son con GLOBAL 2 INSTALACIONES TÉCNICAS, Manuel
    --    Francisco Piña Ruiz y Pilar Franco Ruz, y la superviviente no tiene ninguna— pero
    --    el motor se copia entero: quitarle los pasos que «hoy no hacen falta» es cómo se
    --    rompe la próxima vez que alguien lo reutilice.
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
    --    heredarlos (`uq_clientes_dni_lookup_hash` / `uq_clientes_email_lookup_hash` son
    --    únicos). Los valores quedan guardados en `snapshot_before`, que se tomó arriba.
    --    En este par la lápida solo tiene el de teléfono, y es el MISMO que ya tiene la
    --    superviviente (guarda 2), así que aquí no se pierde ningún índice.
    update seguros.clientes
       set email_lookup_hash = null, dni_lookup_hash = null, telefono_lookup_hash = null
     where id = lap;

    -- 3. El superviviente hereda SOLO sus huecos. Nunca pisa un dato que ya tiene: la ficha
    --    identificada manda, la del volcado solo rellena.
    --    🚨 Un HUECO es `NULL` **o cadena vacía**: `clientes.apellidos` es NOT NULL, así que
    --    su hueco solo puede ser `''`, y `''` es un valor de cajón que se cuela por toda
    --    guarda basada en NULL (la lección que costó una segunda pasada en el lote 2).
    --    Lo que se espera que herede este par (medido el 03/09/2026): `ciudad`,
    --    `codigo_postal`, `provincia`, `direccion`, `cuenta_bancaria` y `fuente`.
    --    NO hereda `dni`, `email`, `telefono` ni `fecha_nacimiento`: la superviviente ya los
    --    tiene, y los suyos son los que están indexados.
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

    -- 4. Reapuntar TODAS las FKs que miran a `clientes.id`. Se recorre el catálogo en vez de
    --    una lista escrita a mano: hoy son 31 columnas en 29 tablas (`polizas`,
    --    `poliza_intervinientes`, `cliente_relaciones` por sus DOS extremos, `siniestros`,
    --    `historial_interno`, `documentos`, `cliente_telefonos`, `cliente_emails`,
    --    `portal_vinculo`, `portal_autorizacion` por sus DOS extremos…), y una tabla nueva
    --    con `cliente_id` entra sola el día que exista.
    --    Aquí mueve, medido: 3 pólizas · 3 intervinientes · 10 relaciones · 2 de historial ·
    --    1 teléfono · 1 email. Ese teléfono y ese email de la lápida NO se pierden: pasan a
    --    ser filas secundarias de la ficha superviviente.
    --    ⚠️ El UPDATE sobre `polizas` dispara `polizas_recompute_segmento`, que recalcula
    --    `clientes.segmento`. Es lo correcto: la superviviente deja de ser `prospecto` en
    --    cuanto tiene las pólizas, y ese recálculo es de la BD, no nuestro.
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

    -- 5. Lápida y libro de fusiones. La justificación se escribe para quien la lea dentro de
    --    seis meses sin este contexto: dice de qué está hecha la identidad y de qué NO.
    update seguros.clientes set merged_into_cliente_id = sup where id = lap;
    insert into seguros.cliente_merge_log
      (correduria_id, merged_cliente_id, surviving_cliente_id, justificacion_identidad,
       inherited_fields, cohort_movido, deps_repointed, snapshot_before, lote, actor)
    values (corr, lap, sup,
      'FUSION POR AFIRMACION DEL CORREDOR, NO POR IDENTIFICADOR COMUN MEDIDO. Alberto afirmo '
      || 'el 03/09/2026 que «Pilar Pina Franco solo hay una». Medido ese dia como corroboracion: '
      || 'son las UNICAS 2 fichas de toda la base con ese nombre+apellidos normalizados, y las '
      || 'unicas 2 que comparten el indice ciego de telefono. NO comparten DNI medido (la lapida '
      || 'tiene DNI cifrado pero sin blind index, y el cifrado es AES-GCM: los ciphertexts no se '
      || 'pueden comparar), NO comparten poliza ni vehiculo (la superviviente no tiene ninguna '
      || 'poliza), y el N del import_ref (174) NO es un identificador compartido: de los 4.093 '
      || 'pares que lo comparten solo el 25% comparte ademas el nombre. Sobrevive '
      || 'intranet:cli:174 por ser la unica con dni_lookup_hash y email_lookup_hash — el hash de '
      || 'email es lo unico por lo que el portal del cliente engancha una identidad con su ficha. '
      || 'La lapida (asegura_app:cli2:174) no tiene ninguna poliza de cartera viva: sus 3 son del '
      || 'volcado.',
      heredados, false, deps, snap, lote_nombre,
      'claude-code (peticion de Alberto 03/09/2026, tras ver las dos fichas en el buscador)');
  end loop;
end $$;

-- ── Reposición de los índices ciegos (el fallo latente del motor, lote 4) ──────────────
-- El paso 2 anula los hashes de la lápida ANTES del paso 3, así que un email o un teléfono
-- heredado se queda sin su índice ciego y la ficha NO aparece al buscarlo — un vacío que se
-- lee como «no está en la cartera» y que no da ningún error. Se repone desde
-- `snapshot_before`, solo si el superviviente no tiene hash y nadie más lo usa (dos de los
-- tres índices son únicos).
-- ⚠️ En ESTE par no debería reponer nada: la superviviente ya tiene los tres hashes que
-- importan (el de teléfono es idéntico al de la lápida, y los de DNI y email son suyos y la
-- lápida no los tenía). Se deja igual, y con guarda de unicidad: un lote que solo funciona
-- porque hoy sus tres updates afectan a 0 filas es un lote que hay que reescribir el día que
-- alguien lo copie.
update seguros.clientes s
   set email_lookup_hash = (m.snapshot_before->>'email_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-pilar-pina-franco-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.email_lookup_hash is null
   and nullif(m.snapshot_before->>'email_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.email_lookup_hash = m.snapshot_before->>'email_lookup_hash');

update seguros.clientes s
   set telefono_lookup_hash = (m.snapshot_before->>'telefono_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-pilar-pina-franco-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.telefono_lookup_hash is null
   and nullif(m.snapshot_before->>'telefono_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.telefono_lookup_hash = m.snapshot_before->>'telefono_lookup_hash');

update seguros.clientes s
   set dni_lookup_hash = (m.snapshot_before->>'dni_lookup_hash')
  from seguros.cliente_merge_log m
 where m.lote = 'fusion-pilar-pina-franco-2026-09-03'
   and s.id = m.surviving_cliente_id
   and s.dni_lookup_hash is null
   and nullif(m.snapshot_before->>'dni_lookup_hash','') is not null
   and not exists (select 1 from seguros.clientes x where x.dni_lookup_hash = m.snapshot_before->>'dni_lookup_hash');

-- ── Comprobación después de ejecutar ──────────────────────────────────────────────────
-- select merged_cliente_id, surviving_cliente_id, inherited_fields, deps_repointed
--   from seguros.cliente_merge_log where lote = 'fusion-pilar-pina-franco-2026-09-03';
-- Esperado: 1 fila. `inherited_fields` con ciudad/codigo_postal/provincia/direccion/
-- cuenta_bancaria/fuente, y `deps_repointed` con polizas.cliente_id = 3,
-- poliza_intervinientes.cliente_id = 3, cliente_relaciones.cliente_a_id = 5 y
-- cliente_b_id = 5, historial_interno.cliente_id = 2, cliente_telefonos = 1,
-- cliente_emails = 1, y 0 en el resto.
--
-- Y en /correduria: buscar «Pilar Piña Franco» debe devolver UNA ficha, con las 3 pólizas del
-- volcado, las 10 relaciones (incluida «Administración» con GLOBAL 2 INSTALACIONES TÉCNICAS)
-- y su dirección — y esa ficha debe seguir apareciendo al buscarla por DNI y por email, que
-- es lo que se estaba protegiendo al elegir superviviente.
