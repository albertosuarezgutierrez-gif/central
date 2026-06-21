-- Vista de resumen financiero anual por local, para que apps/plataforma
-- consolide el financiero de ia-rest (HITO 3). Solo lectura.
-- Alineada en forma a v_contab_pyg de ialimp: importes en BASE IMPONIBLE (neto de IVA).
--   ingresos_base = facturas_verifactu.base_imponible (facturas no anuladas)
--   gastos_base   = facturas_compra.importe_base
-- La consume apps/plataforma/lib/financiero.ts (getResumenIaRest) vía service_role.
create or replace view public.v_resumen_financiero_anual as
with ingresos as (
  select local_id,
         extract(year from fecha_expedicion)::int as anio,
         sum(base_imponible) as ingresos_base
  from public.facturas_verifactu
  where anulada is not true
  group by local_id, extract(year from fecha_expedicion)
),
gastos as (
  select local_id,
         extract(year from fecha_factura)::int as anio,
         sum(importe_base) as gastos_base
  from public.facturas_compra
  group by local_id, extract(year from fecha_factura)
)
select
  coalesce(i.local_id, g.local_id)                                   as local_id,
  coalesce(i.anio, g.anio)                                           as anio,
  coalesce(i.ingresos_base, 0)::float                               as ingresos_base,
  coalesce(g.gastos_base, 0)::float                                 as gastos_base,
  (coalesce(i.ingresos_base, 0) - coalesce(g.gastos_base, 0))::float as resultado
from ingresos i
full outer join gastos g
  on i.local_id = g.local_id and i.anio = g.anio;
