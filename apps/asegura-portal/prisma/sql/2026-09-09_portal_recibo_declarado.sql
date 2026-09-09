-- «Forma de pago» de una póliza declarada + la obligación de RECIBO (09/09/2026).
--
-- Alberto, mirando el alta a mano: pedir «forma de pago» y avisar antes de que
-- pasen el recibo, no solo de la renovación anual. Dos piezas:
--
--   1. `periodicidad_pago`: cada cuánto se le pasa el recibo. Mismo vocabulario
--      que `FRACCIONES` de `@central/module-seguros` (anual/semestral/
--      trimestral/mensual) — dos listas de las mismas cuatro palabras habrían
--      divergido el día que se añadiera una quinta.
--   2. Ensanchar la unicidad de `portal_obligacion` para admitir DOS filas por
--      póliza declarada: una `tipo = 'poliza'` (la renovación, ya existía) y
--      una `tipo = 'recibo'` (el próximo cobro, nueva). Antes de hoy la
--      constraint era `(identidad_id, poliza_declarada_id)` a secas, así que
--      solo cabía una obligación por póliza — quien tuviera vencimiento Y
--      periodicidad solo podía avisar de una de las dos cosas.
--
-- 🚨 GRANT por columna ANTES de declararla en Prisma: declarar sin conceder
-- rompe TODAS las lecturas del modelo con 42501 (lección de `titular_tipo`,
-- `eiac_xml_hash`… repetida ya varias veces en este repo).

alter table seguros.portal_poliza_declarada
  add column if not exists periodicidad_pago text;

alter table seguros.portal_poliza_declarada
  drop constraint if exists portal_poliza_declarada_periodicidad_pago;
alter table seguros.portal_poliza_declarada
  add constraint portal_poliza_declarada_periodicidad_pago
  check (periodicidad_pago is null or periodicidad_pago in ('anual', 'semestral', 'trimestral', 'mensual'));

grant select (periodicidad_pago),
      insert (periodicidad_pago),
      update (periodicidad_pago)
  on seguros.portal_poliza_declarada to prisma_asegura_portal;

-- El corredor no gestiona estas pólizas (no son de la cartera), pero SÍ las ve
-- en la ficha del cliente cuando las revisa: mismo criterio que el resto de
-- columnas de `portal_poliza_declarada` que ya lee `prisma_seguros`.
grant select (periodicidad_pago)
  on seguros.portal_poliza_declarada to prisma_seguros;

-- La unicidad ensanchada: una póliza declarada puede tener una obligación de
-- CADA tipo, nunca dos del mismo tipo (eso seguiría siendo un upsert, no un
-- alta libre — la idempotencia del derivador no se toca, solo se le añade una
-- dimensión).
alter table seguros.portal_obligacion
  drop constraint if exists portal_obligacion_una_por_declarada;
alter table seguros.portal_obligacion
  add constraint portal_obligacion_una_por_declarada_tipo
  unique (identidad_id, poliza_declarada_id, tipo);
