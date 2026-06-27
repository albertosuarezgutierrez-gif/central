-- Seed DEMO de la vertical Alquiler para la cuenta del holding JJ (demo).
-- Aplicado en la BD compartida (wswbehlcuxqxyinousql) el 27/06/2026. Idempotente (ON CONFLICT).
-- Requiere el esquema 2026-06-27_alquiler_schema.sql. Marcadores [seed-demo].
--
-- Cuenta:    0de50000-0000-4000-a000-000000000001 (demo-jj@central.local / JJdemo2026)
-- Sociedades: Catering 0de5...010 · Logística 0de5...011 · Eventos&Materiales 0de5...012
--
-- Demo: 5 materiales + 3 alquileres (1 interno Eventos&Materiales→Catering = intercompany 20.000€,
-- que casa con la operación materiales→catering del consolidado de plataforma; 2 a terceros = 3.900€)
-- + 6 líneas. En el dashboard: ingresos a terceros 3.900€, intercompany 20.000€.

insert into alquiler_materiales (id, cuenta_id, nombre, categoria, stock_total, tarifa_dia, fianza_unit, activo) values
 ('0de50000-0000-4000-a000-0000000f0001','0de50000-0000-4000-a000-000000000001','Silla Chiavari [seed-demo]','mobiliario',500,4,5,true),
 ('0de50000-0000-4000-a000-0000000f0002','0de50000-0000-4000-a000-000000000001','Mesa redonda 10 pax [seed-demo]','mobiliario',60,20,null,true),
 ('0de50000-0000-4000-a000-0000000f0003','0de50000-0000-4000-a000-000000000001','Mantelería [seed-demo]','textil',400,2,null,true),
 ('0de50000-0000-4000-a000-0000000f0004','0de50000-0000-4000-a000-000000000001','Vajilla (set) [seed-demo]','menaje',600,1,null,true),
 ('0de50000-0000-4000-a000-0000000f0005','0de50000-0000-4000-a000-000000000001','Carpa 10x10 [seed-demo]','estructura',5,150,500,true)
on conflict (id) do nothing;

insert into alquiler_alquileres (id, cuenta_id, cliente_nombre, a_terceros, fecha_inicio, fecha_fin, estado, fianza, sociedad_origen_id, sociedad_destino_id) values
 ('0de50000-0000-4000-a000-00000a1c0001','0de50000-0000-4000-a000-000000000001','Menaje boda interna [seed-demo]',false,'2026-06-18','2026-06-22','entregado',null,'0de50000-0000-4000-a000-000000000012','0de50000-0000-4000-a000-000000000010'),
 ('0de50000-0000-4000-a000-00000a1c0002','0de50000-0000-4000-a000-000000000001','Bodas del Sur, S.L. [seed-demo]',true,'2026-06-25','2026-06-27','entregado',500,null,null),
 ('0de50000-0000-4000-a000-00000a1c0003','0de50000-0000-4000-a000-000000000001','Ayuntamiento (feria) [seed-demo]',true,'2026-06-10','2026-06-12','devuelto',null,null,null)
on conflict (id) do nothing;

insert into alquiler_lineas (id, alquiler_id, material_id, nombre, cantidad, tarifa_dia) values
 -- A1 interno (5 días): 500x4x5 + 60x20x5 + 400x2x5 = 20.000€
 ('0de50000-0000-4000-a000-00000a1d0001','0de50000-0000-4000-a000-00000a1c0001','0de50000-0000-4000-a000-0000000f0001','Silla Chiavari',500,4),
 ('0de50000-0000-4000-a000-00000a1d0002','0de50000-0000-4000-a000-00000a1c0001','0de50000-0000-4000-a000-0000000f0002','Mesa redonda 10 pax',60,20),
 ('0de50000-0000-4000-a000-00000a1d0003','0de50000-0000-4000-a000-00000a1c0001','0de50000-0000-4000-a000-0000000f0003','Mantelería',400,2),
 -- A2 terceros (3 días): 2x150x3 + 100x4x3 = 2.100€
 ('0de50000-0000-4000-a000-00000a1d0004','0de50000-0000-4000-a000-00000a1c0002','0de50000-0000-4000-a000-0000000f0005','Carpa 10x10',2,150),
 ('0de50000-0000-4000-a000-00000a1d0005','0de50000-0000-4000-a000-00000a1c0002','0de50000-0000-4000-a000-0000000f0001','Silla Chiavari',100,4),
 -- A3 terceros (3 días): 30x20x3 = 1.800€
 ('0de50000-0000-4000-a000-00000a1d0006','0de50000-0000-4000-a000-00000a1c0003','0de50000-0000-4000-a000-0000000f0002','Mesa redonda 10 pax',30,20)
on conflict (id) do nothing;

-- ─── TEARDOWN (hijos primero por las FK) ─────────────────────────────────────────
--   delete from alquiler_lineas where alquiler_id in (select id from alquiler_alquileres where cuenta_id='0de50000-0000-4000-a000-000000000001');
--   delete from alquiler_alquileres where cuenta_id='0de50000-0000-4000-a000-000000000001';
--   delete from alquiler_materiales where cuenta_id='0de50000-0000-4000-a000-000000000001';
-- (Antes de DELETE FROM cuentas, ejecuta esto: alquiler_lineas.material_id no es ON DELETE CASCADE.)
