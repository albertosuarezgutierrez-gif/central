-- Purga de los intervinientes COMODÍN del volcado (lote `purga-comodin-2026-09-03`).
--
-- El caso, dictado por Alberto el 03/09/2026 desde la ficha de Pilar Piña Franco:
-- «👤 Personas en sus pólizas» enseñaba a «Francisco Chacón Matito · conductor
-- ocasional», y dijo «Matito no se puede borrar, es un error». Las dos mitades de
-- la frase eran ciertas y por motivos distintos:
--
--   1. La fila SÍ es un error, pero no la de Pilar en particular: Matito figura
--      como conductor ocasional de **52 tomadores distintos** que no tienen nada
--      que ver entre sí (Phenix Automoción, Kartenbrot, Esquiansa y 49
--      particulares). Nadie conduce el coche de 52 personas. Es el comodín que
--      el CRM viejo metía cuando no sabía a quién poner.
--   2. «No se puede borrar» es literal: el puerto de operador tiene GET, POST y
--      PATCH de cliente y **ningún DELETE** de intervinientes ni de relaciones.
--      La operación no existe, así que la limpieza es este lote.
--
-- 🚨 MATITO ES UNA PERSONA REAL Y SU FICHA NO SE TOCA. De sus 60 filas de
-- interviniente, **59 son del volcado** (`origen='manual'`, creadas todas en 57
-- segundos el 21/06/2026 entre las 17:58:47 y las 17:59:44, sin NIF, sin nombre
-- propio, y **ninguna sobre una póliza de la cartera viva**) y **1 es de CIMA**:
-- conductor HABITUAL, con NIF, sobre una póliza viva. Esa se queda. Borrarla no
-- serviría de nada además: el siguiente pull de CIMA la volvería a crear.
--
-- GUARDA DE ALCANCE (lo que decide qué se borra, y por eso solo salen dos personas):
--   1. `origen = 'manual'` — es la etiqueta del volcado del 21/06. Las 408 filas
--      `manual` de la base cuelgan TODAS de pólizas del volcado; las 96 de CIMA,
--      todas de pólizas vivas. La frontera es limpia y no hay que adivinarla.
--   2. la persona interviene en pólizas de **≥ 4 tomadores distintos**. Ahí solo
--      caen Matito (52) y Antonio Sevico (16, que además es «conductor ocasional»
--      del propio Matito). El tercero de la lista no pasa de 3 tomadores, así que
--      no hay zona gris que arbitrar.
--   3. 🚨 **el comodín NO es el TOMADOR de esa póliza.** Dictado por Alberto el
--      03/09/2026 al revisar este lote: «matito no conduce 52 coches, quitado, si
--      no es tomador». Lo suyo es suyo: figurar en la póliza de la que uno es
--      titular no es un comodín, es el titular. Medido: no salva ninguna de las 77
--      filas de interviniente (Matito 0 de 59, Sevico 0 de 18 son sobre pólizas
--      propias), **pero sí 2 relaciones** — el par «Matito tomador ↔ Sevico su
--      conductor ocasional», en sus dos sentidos, que es un vínculo de verdad.
--      Se deja escrita aunque hoy no salve intervinientes: la próxima ejecución
--      sobre otros datos la necesita.
--
-- Se borran también sus relaciones «Ocasional/Contacto - Tomador», que son la otra
-- cara del mismo comodín (es de donde sale la etiqueta «Tomador - Ocasional» que se
-- pinta bajo el nombre). **NO se tocan las relaciones de familia** —Hijo/a,
-- Cónyuge/Pareja de Hecho, Padre/Madre, Amigo/a, Empresa, Administración—, que son
-- dato bueno, ni ninguna con `puede_ver_polizas = true`: comprobado antes de
-- escribir esto, **ninguna de las 118 candidatas lleva autorización** (la lección
-- del lote 5 fue justo esa: el consentimiento colgaba de la ficha que no era).
--
-- REVERSIBLE POR DISEÑO: nada se borra sin dejar antes la fila entera en
-- `seguros.interviniente_purga_log.snapshot_before`. Restaurar es un INSERT desde
-- ese jsonb. La tabla es append-only por trigger, igual que `cliente_merge_log`.
--
-- ⚠️ Esto NO arregla la causa: mientras el puerto no tenga un DELETE, el próximo
-- comodín también habrá que quitarlo por SQL.

-- ── Bitácora de la purga ─────────────────────────────────────────────────────
create table if not exists seguros.interviniente_purga_log (
  id uuid primary key default gen_random_uuid(),
  correduria_id uuid not null,
  tabla text not null check (tabla in ('poliza_intervinientes', 'cliente_relaciones')),
  fila_id uuid not null,
  cliente_id uuid not null,
  motivo text not null,
  lote text not null,
  actor text not null,
  snapshot_before jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_interviniente_purga_log_lote
  on seguros.interviniente_purga_log (lote, created_at);
create index if not exists idx_interviniente_purga_log_cliente
  on seguros.interviniente_purga_log (cliente_id);

create or replace function seguros.interviniente_purga_log_reject_modification()
returns trigger language plpgsql as $reject$
begin
  raise exception 'seguros.interviniente_purga_log es append-only (intento de % en %)',
    tg_op, tg_table_name;
end;
$reject$;

drop trigger if exists interviniente_purga_log_reject_modification
  on seguros.interviniente_purga_log;
create trigger interviniente_purga_log_reject_modification
  before update or delete on seguros.interviniente_purga_log
  for each row execute function seguros.interviniente_purga_log_reject_modification();

grant select, insert on seguros.interviniente_purga_log to prisma_seguros;

-- ── La purga ─────────────────────────────────────────────────────────────────
do $$
declare
  lote constant text := 'purga-comodin-2026-09-03';
  actor constant text := 'claude/duplicidad-do9979 (dictado de Alberto 03/09/2026)';
  min_tomadores constant int := 4;
  comodines uuid[];
  r record;
  n_interv int := 0;
  n_rel int := 0;
begin
  -- Quiénes son los comodines: personas que intervienen, SIEMPRE por el volcado,
  -- en pólizas de 4 o más tomadores distintos. Se calcula, no se cablea: si el
  -- lote se repite sobre otra base el criterio sigue siendo el mismo.
  select array_agg(cliente_id) into comodines
  from (
    select pi.cliente_id
    from seguros.poliza_intervinientes pi
    join seguros.polizas p on p.id = pi.poliza_id
    where pi.origen = 'manual' and pi.cliente_id is not null
    group by pi.cliente_id
    having count(distinct p.cliente_id) >= min_tomadores
  ) x;

  if comodines is null or array_length(comodines, 1) = 0 then
    raise notice '[%] no hay comodines que purgar', lote;
    return;
  end if;
  raise notice '[%] comodines detectados: %', lote, array_length(comodines, 1);

  -- 1) Intervinientes del volcado. La guarda `origen='manual'` es la que salva la
  --    fila de CIMA de Matito; sin ella este lote borraría dato bueno y vivo.
  for r in
    select pi.* from seguros.poliza_intervinientes pi
    join seguros.polizas p on p.id = pi.poliza_id
    where pi.cliente_id = any(comodines)
      and pi.origen = 'manual'
      -- Guarda 3: en SU propia póliza no es un comodín, es el titular.
      and p.cliente_id is distinct from pi.cliente_id
  loop
    insert into seguros.interviniente_purga_log
      (correduria_id, tabla, fila_id, cliente_id, motivo, lote, actor, snapshot_before)
    values
      (r.correduria_id, 'poliza_intervinientes', r.id, r.cliente_id,
       'comodín del volcado: interviene en pólizas de ≥4 tomadores sin relación entre sí',
       lote, actor, to_jsonb(r));
    delete from seguros.poliza_intervinientes where id = r.id;
    n_interv := n_interv + 1;
  end loop;

  -- 2) Las relaciones que son la otra cara del comodín. Sólo los pares
  --    ocasional/contacto, sólo sin autorización, y sólo cuando el comodín es una
  --    de las dos partes: la familia y los permisos no se tocan.
  for r in
    select cr.* from seguros.cliente_relaciones cr
    where (cr.cliente_a_id = any(comodines) or cr.cliente_b_id = any(comodines))
      and cr.puede_ver_polizas = false
      and cr.tipo_relacion in (
        'Ocasional - Tomador', 'Tomador - Ocasional',
        'Contacto - Tomador', 'Tomador - Contacto'
      )
      -- Guarda 3, aquí: el tipo es «papel de A - papel de B», así que el comodín
      -- es el TOMADOR si está en A con 'Tomador - …' o en B con '… - Tomador'.
      -- Ese vínculo se queda (hoy son 2 filas: Matito tomador ↔ Sevico ocasional).
      and not (
        (cr.cliente_a_id = any(comodines) and split_part(cr.tipo_relacion, ' - ', 1) = 'Tomador')
        or
        (cr.cliente_b_id = any(comodines) and split_part(cr.tipo_relacion, ' - ', 2) = 'Tomador')
      )
  loop
    insert into seguros.interviniente_purga_log
      (correduria_id, tabla, fila_id, cliente_id, motivo, lote, actor, snapshot_before)
    values
      (r.correduria_id, 'cliente_relaciones', r.id,
       case when r.cliente_a_id = any(comodines) then r.cliente_a_id else r.cliente_b_id end,
       'espejo del comodín: relación ocasional/contacto sin autorización',
       lote, actor, to_jsonb(r));
    delete from seguros.cliente_relaciones where id = r.id;
    n_rel := n_rel + 1;
  end loop;

  raise notice '[%] borrados: % intervinientes · % relaciones', lote, n_interv, n_rel;
end $$;

-- ── Verificación (debe salir todo a 0 salvo la fila de CIMA de Matito) ───────
--
-- select count(*) from seguros.poliza_intervinientes pi
--   join seguros.polizas p on p.id = pi.poliza_id
--   group by pi.cliente_id having count(distinct p.cliente_id) >= 4;   -- 0 filas
--
-- select origen, count(*) from seguros.poliza_intervinientes
--  where cliente_id = (select id from seguros.clientes
--                       where import_ref = 'asegura_app:cli2:235')
--  group by origen;                                                    -- cima | 1
--
-- select count(*) from seguros.interviniente_purga_log
--  where lote = 'purga-comodin-2026-09-03';                            -- 77 + 118 = 195
