-- Pedir los datos de OTRA persona del riesgo (un familiar que es figura) por enlace (29/09/2026).
-- `cliente_id` pasa a ser DE QUIÉN son los datos (el cliente o esa figura); `tercero` lo dice, y
-- `consentimiento_at` guarda cuándo quien contestó marcó que era esa persona o tenía su permiso.
alter table seguros.solicitud_datos add column if not exists tercero boolean not null default false;
alter table seguros.solicitud_datos add column if not exists consentimiento_at timestamptz;
-- Una viva por persona y oportunidad (antes, una por oportunidad).
drop index if exists seguros.solicitud_datos_una_viva;
create unique index if not exists solicitud_datos_una_viva on seguros.solicitud_datos (oportunidad_id, cliente_id) where estado = 'pendiente';
-- Un tercero sin consentimiento no puede quedar completado.
alter table seguros.solicitud_datos drop constraint if exists solicitud_datos_tercero_consiente;
alter table seguros.solicitud_datos add constraint solicitud_datos_tercero_consiente
  check (not tercero or estado <> 'completada' or consentimiento_at is not null);
