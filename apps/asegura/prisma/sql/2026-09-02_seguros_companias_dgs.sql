-- Compañías por código DGS (02/09/2026). Aplicada en la BD compartida como migración
-- `portal_grant_cliente_emails_y_companias_dgs` (junto con un grant del portal).
--
-- Por qué existe: Codeoscopic habla en CÓDIGO DGS (su catálogo `/car/insurance-companies` devuelve
-- el código) y CIMA habla en NOMBRE (el legacy casa una póliza por `numero_poliza` + `aseguradora`
-- EXACTA). Para que una póliza emitida por nosotros case con lo que CIMA traiga después hay que
-- escribirla con el texto que CIMA usa para ese código — y ese texto solo se sabe mirando la cartera
-- (`select distinct aseguradora where codigo_entidad_dgs = X`). Spec
-- docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md, D2.
--
--   nombre_cima  = texto EXACTO de `polizas.aseguradora` que CIMA escribe para ese código.
--                  NULL = no se ha visto ninguna póliza de CIMA de esa compañía: NO se inventa, y una
--                  emisión sobre una compañía sin `nombre_cima` se marca «sin nombre CIMA conocido».
--   nombre_comun = cómo la llamamos en pantalla.
--   en_cima      = la correduría tiene acceso CIMA a esa entidad (las 5 adheridas).
--
-- Semilla: 3 con pólizas vivas confirmadas (nombre medido), 2 adheridas a CIMA sin vivas (Generali,
-- Reale) y 10 códigos verificados contra el catálogo del vendor por el CRM legacy
-- (`previous-insurance-prefill.ts`). La tabla es reversible (DROP); los valores de enum de la
-- migración hermana `seguros_enums_fuente_web_y_origen_emitida` NO (Postgres no tiene DROP VALUE).
create table if not exists seguros.companias_dgs (
  codigo_dgs    varchar(16) primary key,
  nombre_comun  varchar(255) not null,
  nombre_cima   varchar(255),
  en_cima       boolean not null default false,
  activa        boolean not null default true,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table seguros.companias_dgs is 'Compañías por código DGS. nombre_cima = texto exacto que CIMA escribe en polizas.aseguradora (NULL = no visto aún); es la llave para que una emitida por Codeoscopic case con lo que CIMA traiga.';

insert into seguros.companias_dgs (codigo_dgs, nombre_comun, nombre_cima, en_cima, notas)
select v.codigo_dgs, v.nombre_comun, v.nombre_cima, v.en_cima, v.notas from (values
  ('C0058', 'Mapfre',            'Mapfre',   true,  '30 vivas activas (02/09/2026)'),
  ('C0109', 'Allianz',           'Allianz',  true,  '20 vivas activas'),
  ('C0468', 'Occident',          'Occident', true,  '17 vivas activas'),
  ('C0072', 'Generali',          null,       true,  'adherida a CIMA, sin pólizas vivas confirmadas'),
  ('C0613', 'Reale',             null,       true,  'adherida el 01/09/2026, sin pólizas vivas confirmadas'),
  ('M0050', 'Pelayo',            null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0517', 'Plus Ultra',        null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0730', 'Direct Seguros',    null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0157', 'Helvetia',          null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0723', 'AXA',               null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('M0083', 'Mutua Madrileña',   null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0467', 'Liberty',           null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('E0118', 'Fidelidade',        null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0121', 'Metrópolis',        null,       false, 'código verificado en el catálogo de Codeoscopic'),
  ('C0682', 'AMIC',              null,       false, 'código verificado en el catálogo de Codeoscopic')
) as v(codigo_dgs, nombre_comun, nombre_cima, en_cima, notas)
on conflict (codigo_dgs) do nothing;

grant select, insert, update, delete on seguros.companias_dgs to prisma_seguros;
grant select on seguros.companias_dgs to crm_seguros;
