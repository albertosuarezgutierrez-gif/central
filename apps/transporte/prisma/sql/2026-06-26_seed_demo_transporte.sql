-- Seed DEMO de la vertical Transporte para la cuenta del holding JJ (demo).
-- Aplicado en la BD compartida (wswbehlcuxqxyinousql) el 26/06/2026. Idempotente (ON CONFLICT).
-- Marcadores [seed-demo] en los nombres. Requiere el esquema 2026-06-26_transporte_schema.sql.
--
-- Cuenta:    0de50000-0000-4000-a000-000000000001  (demo-jj@central.local / JJdemo2026)
-- Sociedades: Catering 0de5...010 · Logística 0de5...011 · Eventos&Materiales 0de5...012
--
-- Demo: 2 vehículos + 1 conductor + 3 documentos (semáforo: ITV por caducar, ITV caducada,
-- seguro vigente) + 3 servicios (2 a terceros = ingreso real, 1 interno Logística->Catering =
-- intercompany) + 3 portes. En el dashboard: ingresos a terceros 2.050€, intercompany 40.000€.

insert into flota_vehiculos (id, cuenta_id, nombre, matricula, tipo, capacidad_kg, capacidad_m3, es_propio, tarifa_km, tarifa_fija, activo) values
 ('0de50000-0000-4000-a000-0000000a0001','0de50000-0000-4000-a000-000000000001','Camión frigorífico JJ-01 [seed-demo]','1234 KLM','frigorifico',8000,30,true,1.2,30,true),
 ('0de50000-0000-4000-a000-0000000a0002','0de50000-0000-4000-a000-000000000001','Furgón JJ-02 [seed-demo]','5678 NOP','furgon',1200,8,true,0.8,15,true)
on conflict (id) do nothing;

insert into flota_conductores (id, cuenta_id, nombre, dni, permiso, caducidad_permiso, telefono, activo) values
 ('0de50000-0000-4000-a000-0000000b0001','0de50000-0000-4000-a000-000000000001','Manuel Reyes [seed-demo]','12345678Z','C+E, CAP','2028-03-01','600111222',true)
on conflict (id) do nothing;

insert into flota_documentos (id, vehiculo_id, tipo, fecha_emision, fecha_caducidad, importe) values
 ('0de50000-0000-4000-a000-0000000e0001','0de50000-0000-4000-a000-0000000a0001','itv','2025-07-08','2026-07-08',120),
 ('0de50000-0000-4000-a000-0000000e0002','0de50000-0000-4000-a000-0000000a0001','seguro','2026-02-01','2027-02-01',1400),
 ('0de50000-0000-4000-a000-0000000e0003','0de50000-0000-4000-a000-0000000a0002','itv','2025-05-20','2026-05-20',110)
on conflict (id) do nothing;

insert into transporte_servicios (id, cuenta_id, cliente_nombre, a_terceros, origen, destino, fecha, estado, importe, sociedad_origen_id, sociedad_destino_id) values
 ('0de50000-0000-4000-a000-0000000c0001','0de50000-0000-4000-a000-000000000001','Bodega Real, S.L. [seed-demo]',true,'Sevilla','Jerez','2026-06-18','facturado',1200,null,null),
 ('0de50000-0000-4000-a000-0000000c0003','0de50000-0000-4000-a000-000000000001','Eventos Costa [seed-demo]',true,'Sevilla','Cádiz','2026-06-24','entregado',850,null,null),
 ('0de50000-0000-4000-a000-0000000c0002','0de50000-0000-4000-a000-000000000001','Reparto interno catering [seed-demo]',false,'Cocina central','Hacienda (evento)','2026-06-22','entregado',40000,'0de50000-0000-4000-a000-000000000011','0de50000-0000-4000-a000-000000000010')
on conflict (id) do nothing;

insert into transporte_portes (id, servicio_id, vehiculo_id, conductor_id, estado, km_estimados, km_reales, importe_facturado, es_interno, sociedad_origen_id, sociedad_destino_id) values
 ('0de50000-0000-4000-a000-0000000d0001','0de50000-0000-4000-a000-0000000c0001','0de50000-0000-4000-a000-0000000a0001','0de50000-0000-4000-a000-0000000b0001','completado',200,210,1200,false,null,null),
 ('0de50000-0000-4000-a000-0000000d0003','0de50000-0000-4000-a000-0000000c0003','0de50000-0000-4000-a000-0000000a0002','0de50000-0000-4000-a000-0000000b0001','completado',80,90,850,false,null,null),
 ('0de50000-0000-4000-a000-0000000d0002','0de50000-0000-4000-a000-0000000c0002','0de50000-0000-4000-a000-0000000a0001','0de50000-0000-4000-a000-0000000b0001','completado',5000,5200,40000,true,'0de50000-0000-4000-a000-000000000011','0de50000-0000-4000-a000-000000000010')
on conflict (id) do nothing;

-- ─── TEARDOWN (cuando entren datos reales o quieras quitar el demo) ──────────────
-- Borra SOLO lo de transporte de la cuenta demo (hijos primero por las FK):
--   delete from transporte_paradas where porte_id in (select p.id from transporte_portes p join flota_vehiculos v on v.id=p.vehiculo_id where v.cuenta_id='0de50000-0000-4000-a000-000000000001');
--   delete from transporte_portes where vehiculo_id in (select id from flota_vehiculos where cuenta_id='0de50000-0000-4000-a000-000000000001');
--   delete from transporte_servicios where cuenta_id='0de50000-0000-4000-a000-000000000001';
--   delete from flota_documentos where vehiculo_id in (select id from flota_vehiculos where cuenta_id='0de50000-0000-4000-a000-000000000001');
--   delete from flota_mantenimientos where vehiculo_id in (select id from flota_vehiculos where cuenta_id='0de50000-0000-4000-a000-000000000001');
--   delete from flota_repostajes where vehiculo_id in (select id from flota_vehiculos where cuenta_id='0de50000-0000-4000-a000-000000000001');
--   delete from flota_conductores where cuenta_id='0de50000-0000-4000-a000-000000000001';
--   delete from flota_vehiculos where cuenta_id='0de50000-0000-4000-a000-000000000001';
-- (Si vas a borrar la cuenta demo entera con DELETE FROM cuentas, ejecuta ANTES este teardown:
--  el FK transporte_portes.vehiculo_id no es ON DELETE CASCADE y bloquearía el borrado.)
