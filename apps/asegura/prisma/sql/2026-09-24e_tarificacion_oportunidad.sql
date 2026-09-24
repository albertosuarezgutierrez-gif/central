-- Un presupuesto cuelga de su oportunidad (24/09/2026). Aplicada como migración
-- `seguros_tarificacion_oportunidad`. Lo escribe `lib/codeoscopic/oportunidad-presupuesto.ts`
-- tras guardar la cotización; NULL = anterior al enlace, simulado o no enlazado.
alter table seguros.tarificaciones add column if not exists oportunidad_id uuid references seguros.oportunidades(id);
create index if not exists tarificaciones_oportunidad_idx on seguros.tarificaciones (oportunidad_id) where oportunidad_id is not null;
comment on column seguros.tarificaciones.oportunidad_id is 'Oportunidad de la que cuelga este presupuesto (24/09/2026). NULL = anterior al enlace, simulado, o no se pudo enlazar.';
