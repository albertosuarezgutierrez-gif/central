-- 2026-09-30 — Recaptación → oportunidades (decisión de Alberto): cada póliza antigua (volcado) de un ex-cliente de la cola
-- de Recaptación pasa a ser una oportunidad `competencia` CON fecha, para que salga en Vencimientos (carril de leads).
-- Ensayo con rollback (30/09/2026): 1.517 creadas (1.079 clientes) + 15 abiertas sin fecha rellenadas (acción de historial
-- `fecha_desde_recaptacion`) = 1.091 clientes; los 155 de WhatsApp quedan todos con abierta con fecha; 0 `import_ref` repetidos; 0 en `gestiones`.
-- Idempotente (`import_ref = 'recaptacion:<poliza_id>'` + índice único; 2.ª pasada = 0). Revertir: bloques comentados al final
-- a) las creadas NO se borran (historial append-only y su FK): se cierran `perdida`/`error_alta`; b) el relleno vuelve
-- a NULL si nadie cambió la fecha después (se localiza por la acción `fecha_desde_recaptacion`). Ambos ensayados.
begin;

set local lock_timeout = '5s';
-- Que nadie abra una oportunidad a mano mientras se decide quién ya tiene una.
lock table seguros.oportunidades in share row exclusive mode;

create temp table _recaptacion on commit drop as
with param as (
  select
    -- El lead es la PERSONA: también se convierten las pólizas «fin de riesgo» (Alberto, 30/09/2026).
    false as excluir_fin_riesgo,
    -- El mismo vehículo en varias pólizas antiguas (renovó cambiando de compañía) = UN riesgo, una oportunidad.
    -- (El mismo nº de póliza se funde SIEMPRE: son gemelas `intranet:pol:N` / `asegura_app:pol2:N` de la misma póliza.)
    true as una_por_matricula,
    1990 as anio_min,
    extract(year from current_date)::int as anio_max
),
pool as (
  -- La misma regla que `colaRecaptacion()` (apps/asegura/lib/cartera-recaptacion.ts), SIN la ventana de 45 días.
  select p.id as poliza_id, p.correduria_id, c.id as cliente_id, p.tipo, p.estado::text as estado,
         p.fecha_vencimiento, p.fecha_inicio,
         nullif(trim(p.aseguradora), '') as aseguradora,
         -- Las dos columnas son la misma magnitud; un 0 no es una prima (NULL ≠ 0).
         nullif(coalesce(p.prima_bruta, p.prima_anual), 0) as prima,
         nullif(ltrim(regexp_replace(upper(coalesce(p.numero_poliza, '')), '[^A-Z0-9]', '', 'g'), '0'), '') as k_num,
         nullif(regexp_replace(upper(coalesce(p.datos_especificos->>'matricula', '')), '[^A-Z0-9]', '', 'g'), '') as k_mat
  from seguros.polizas p
  join seguros.clientes c on c.id = p.cliente_id and c.correduria_id = p.correduria_id
  where p.import_ref is not null and p.eiac_xml_hash is null
    and p.merged_into_poliza_id is null
    and c.merged_into_cliente_id is null and c.activo
    and ((p.estado = 'activa' and p.fecha_vencimiento is null) or p.fecha_vencimiento is not null)
    and ((c.telefono is not null and c.wa_opt_out_at is null) or (c.email is not null and c.email_opt_out_at is null))
    and not exists (
      select 1 from seguros.polizas v
      where v.cliente_id = c.id and v.id <> p.id and v.merged_into_poliza_id is null
        and (v.import_ref is null or v.eiac_xml_hash is not null))
),
cli as (
  -- Por cliente, el motivo que lo deja fuera entero (NULL = entra).
  select k.cliente_id,
    case
      -- Ya sale en el carril (aparcadas incluidas: se respeta su aparcamiento).
      when exists (select 1 from seguros.oportunidades o
                   where o.cliente_id = k.cliente_id and o.correduria_id = k.correduria_id
                     and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
                     and o.fecha_fin_vigencia is not null) then 'ya_abierta_con_fecha'
      -- Ya dijo que no. `error_alta` es «abierta por error», no un no.
      when exists (select 1 from seguros.oportunidades o
                   where o.cliente_id = k.cliente_id and o.correduria_id = k.correduria_id
                     and o.estado::text = 'perdida' and o.motivo_perdida is distinct from 'error_alta') then 'perdida'
    end as motivo
  from (select distinct cliente_id, correduria_id from pool) k
),
base as (
  select pool.*, cli.motivo as motivo_cliente, param.una_por_matricula, param.excluir_fin_riesgo,
         coalesce(pool.fecha_vencimiento, pool.fecha_inicio) as fecha,
         case when pool.fecha_vencimiento is not null then 'fecha_vencimiento' else 'fecha_inicio' end as fecha_de,
         coalesce(extract(year from coalesce(pool.fecha_vencimiento, pool.fecha_inicio))
                  between param.anio_min and param.anio_max, false) as fecha_ok,
         case when extract(year from pool.fecha_inicio) between param.anio_min and param.anio_max
              then pool.fecha_inicio end as fecha_inicio_ok,
         exists (select 1 from seguros.oportunidades o
                 where o.correduria_id = pool.correduria_id and o.import_ref = 'recaptacion:' || pool.poliza_id::text) as ya_convertida,
         -- Su oportunidad ABIERTA y SIN fecha del MISMO ramo, si la tiene: no se duplica, se le rellena la fecha.
         (select o.id from seguros.oportunidades o
           where o.cliente_id = pool.cliente_id and o.correduria_id = pool.correduria_id and o.tipo = pool.tipo
             and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente') and o.fecha_fin_vigencia is null
           order by o.created_at, o.id limit 1) as abierta_sin_fecha_id
  from pool
  join cli on cli.cliente_id = pool.cliente_id
  cross join param
),
relleno as (
  -- De las pólizas de ese ramo, la de fecha más reciente da la fecha; las demás quedan absorbidas por esa oportunidad.
  select b.poliza_id, row_number() over (partition by b.abierta_sin_fecha_id order by b.fecha desc, b.poliza_id) as rf
  from base b
  where b.motivo_cliente is null and b.abierta_sin_fecha_id is not null and b.fecha_ok
),
d1 as (
  -- Mismo cliente, ramo y nº de póliza = la misma póliza: se queda la más reciente.
  select b.poliza_id,
         row_number() over (partition by b.cliente_id, b.tipo, g1 order by b.fecha desc, b.poliza_id) as rn1,
         bool_or(b.estado = 'fin_riesgo') over (partition by b.cliente_id, b.tipo, g1) as fin1,
         case when b.una_por_matricula and length(b.k_mat) between 5 and 10 then 'mat:' || b.k_mat
              else 'id:' || b.poliza_id::text end as g2
  from (select b.*, case when length(b.k_num) >= 4 then 'num:' || b.k_num else 'id:' || b.poliza_id::text end as g1
        from base b
        where b.motivo_cliente is null and not b.ya_convertida and b.fecha_ok and b.abierta_sin_fecha_id is null) b
),
d2 as (
  -- Mismo vehículo: se queda la más reciente. Si alguna del grupo es «fin de riesgo», el grupo entero lo es.
  select x.poliza_id,
         row_number() over (partition by b.cliente_id, b.tipo, x.g2 order by b.fecha desc, b.poliza_id) as rn2,
         bool_or(x.fin1) over (partition by b.cliente_id, b.tipo, x.g2) as fin2
  from d1 x join base b on b.poliza_id = x.poliza_id
  where x.rn1 = 1
)
select b.poliza_id, b.correduria_id, b.cliente_id, b.tipo, b.estado, b.fecha, b.fecha_de, b.fecha_inicio_ok,
       b.aseguradora, b.prima, b.abierta_sin_fecha_id,
       case
         when b.motivo_cliente is not null then 'cliente_' || b.motivo_cliente
         when not b.fecha_ok then 'fecha_fuera_de_rango'
         when b.abierta_sin_fecha_id is not null and r.rf = 1 then 'rellenar_fecha'
         when b.abierta_sin_fecha_id is not null then 'absorbida_por_abierta'
         when b.ya_convertida then 'ya_convertida'
         when d1.rn1 > 1 then 'duplicada_mismo_numero'
         when d2.rn2 > 1 then 'duplicada_misma_matricula'
         when b.excluir_fin_riesgo and d2.fin2 then 'fin_riesgo'
         else 'crear'
       end as decision
from base b
left join relleno r on r.poliza_id = b.poliza_id
left join d1 on d1.poliza_id = b.poliza_id
left join d2 on d2.poliza_id = b.poliza_id;

-- 1) Las nuevas.
with nuevas as (
  insert into seguros.oportunidades
    (correduria_id, cliente_id, tipo, fuente, estado, fecha_vigencia, fecha_fin_vigencia, prima_bruta,
     poliza_competencia, info_riesgo, poliza_id, import_ref)
  select r.correduria_id, r.cliente_id, r.tipo, 'otros', 'competencia', r.fecha_inicio_ok, r.fecha, r.prima,
         -- `aseguradora` NULL: la de la póliza antigua no es la compañía que tiene HOY (la pantalla diría «ahora en…»).
         -- Va en `aseguradoraAnterior` (ningún código la lee de aquí). «(legacy)» es un valor de cajón: no se escribe.
         -- `prima` en texto, la forma que lee leads-competencia.ts. Sin nada que decir, NULL (no `{}`).
         nullif(jsonb_strip_nulls(jsonb_build_object(
           'aseguradoraAnterior', case when r.aseguradora !~* '^\(?legacy\)?$' then r.aseguradora end,
           'prima', case when r.prima is not null then to_char(round(r.prima, 2), 'FM999999990.00') end)), '{}'::jsonb),
         jsonb_build_object('origen', 'recaptacion', 'polizaAntiguaId', r.poliza_id::text, 'fechaDe', r.fecha_de),
         -- `poliza_id` NULL, como las demás del volcado: con valor, la pantalla ofrecería «retarificar póliza en cartera».
         null,
         'recaptacion:' || r.poliza_id::text
  from _recaptacion r
  where r.decision = 'crear'
    and not exists (select 1 from seguros.oportunidades o
                    where o.correduria_id = r.correduria_id and o.import_ref = 'recaptacion:' || r.poliza_id::text)
  on conflict (correduria_id, import_ref) where import_ref is not null do nothing
  returning id, correduria_id, tipo, fecha_fin_vigencia, prima_bruta, poliza_competencia, info_riesgo
)
-- Como `crearOportunidad()` (oportunidad-seguimiento.ts), su fila de historial. Sin tarea en `gestiones`.
insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
select n.correduria_id, n.id, 'creada_recaptacion', null, 'competencia',
       jsonb_build_object(
         'nota', 'Creada desde Recaptación (póliza antigua)',
         'origen', 'recaptacion',
         'ramo', n.tipo::text,
         'fechaFinVigencia', n.fecha_fin_vigencia,
         'fechaDe', n.info_riesgo->>'fechaDe',
         'prima', n.prima_bruta,
         'conCompania', false,
         'conCompaniaAnterior', coalesce(n.poliza_competencia ? 'aseguradoraAnterior', false),
         'polizaAntiguaId', n.info_riesgo->>'polizaAntiguaId'),
       'sistema:recaptacion'
from nuevas n;

-- 2) Las abiertas SIN fecha del mismo ramo: se les rellena la fecha (solo si sigue vacía) y queda dicho en su historial,
--    con la forma de `editada` ({campo: {antes, despues}}).
with rellenas as (
  update seguros.oportunidades o
     set fecha_fin_vigencia = r.fecha, updated_at = now()
    from _recaptacion r
   where r.decision = 'rellenar_fecha' and o.id = r.abierta_sin_fecha_id and o.correduria_id = r.correduria_id
     and o.fecha_fin_vigencia is null and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
  returning o.id, o.correduria_id, o.estado, r.fecha, r.fecha_de, r.poliza_id
)
insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
select x.correduria_id, x.id, 'fecha_desde_recaptacion', x.estado, x.estado,
       jsonb_build_object(
         'fechaFinVigencia', jsonb_build_object('antes', null, 'despues', x.fecha),
         'nota', 'Vencimiento rellenado desde Recaptación (póliza antigua)',
         'origen', 'recaptacion',
         'fechaDe', x.fecha_de,
         'polizaAntiguaId', x.poliza_id::text),
       'sistema:recaptacion'
from rellenas x;

-- Guardas: si algo no cuadra, se aborta TODO.
do $$
declare
  dup int; sin_fecha int; sin_historial int; relleno_mal int;
begin
  select count(*) into dup from (
    select correduria_id, import_ref from seguros.oportunidades
    where import_ref like 'recaptacion:%' group by 1, 2 having count(*) > 1) x;
  select count(*) into sin_fecha from seguros.oportunidades
    where import_ref like 'recaptacion:%' and fecha_fin_vigencia is null;
  select count(*) into sin_historial from seguros.oportunidades o
    where o.import_ref like 'recaptacion:%'
      and not exists (select 1 from seguros.oportunidad_historial h where h.oportunidad_id = o.id);
  select count(*) into relleno_mal from seguros.oportunidad_historial h
    join seguros.oportunidades o on o.id = h.oportunidad_id
    where h.accion = 'fecha_desde_recaptacion' and o.fecha_fin_vigencia is null;
  if dup > 0 or sin_fecha > 0 or sin_historial > 0 or relleno_mal > 0 then
    raise exception 'recaptación → oportunidades: % import_ref repetidos, % sin fecha, % sin historial, % rellenos sin fecha',
      dup, sin_fecha, sin_historial, relleno_mal;
  end if;
end $$;

-- Resumen de lo decidido (pólizas y clientes por motivo).
select decision, count(*) as polizas, count(distinct cliente_id) as clientes
from _recaptacion group by decision order by decision;

commit;

-- ─── Revertir (en este orden, en una transacción) ────────────────────────────────────────────────────────
-- Solo lo que nadie ha tocado: una con tarea, llamada, cotización o cambio posterior es trabajo de Alberto y se deja.
-- begin;
-- -- a) Las creadas: se descartan (no se borran: `oportunidad_historial` es append-only y su FK impide el DELETE).
-- with r as (
--   update seguros.oportunidades o
--      set estado = 'perdida', motivo_perdida = 'error_alta', cerrada_at = now(), updated_at = now(),
--          motivo_perdida_detalle = 'Revertida la conversión de Recaptación (SQL 2026-09-30)'
--    where o.import_ref like 'recaptacion:%' and o.estado = 'competencia'
--      and not exists (select 1 from seguros.gestiones g where g.oportunidad_id = o.id)
--      and not exists (select 1 from seguros.tarificaciones t where t.oportunidad_id = o.id)
--      and not exists (select 1 from seguros.oportunidad_historial h
--                      where h.oportunidad_id = o.id and h.accion <> 'creada_recaptacion')
--   returning o.id, o.correduria_id)
-- insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
-- select correduria_id, id, 'perder', 'competencia', 'perdida',
--        '{"motivo":"error_alta","origen":"recaptacion_revertida"}'::jsonb, 'sistema:recaptacion'
-- from r;
-- -- b) El relleno de fecha: vuelve a NULL solo si nadie la ha cambiado después.
-- with r as (
--   update seguros.oportunidades o set fecha_fin_vigencia = null, updated_at = now()
--     from seguros.oportunidad_historial h
--    where h.oportunidad_id = o.id and h.accion = 'fecha_desde_recaptacion'
--      and o.fecha_fin_vigencia = (h.detalle->'fechaFinVigencia'->>'despues')::date
--      and not exists (select 1 from seguros.oportunidad_historial e
--                      where e.oportunidad_id = o.id and e.accion = 'editada' and e.created_at > h.created_at)
--   returning o.id, o.correduria_id, o.estado, h.detalle->'fechaFinVigencia'->>'despues' as antes)
-- insert into seguros.oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
-- select correduria_id, id, 'editada', estado, estado,
--        jsonb_build_object('fechaFinVigencia', jsonb_build_object('antes', antes, 'despues', null), 'origen', 'recaptacion_revertida'),
--        'sistema:recaptacion'
-- from r;
-- commit;
