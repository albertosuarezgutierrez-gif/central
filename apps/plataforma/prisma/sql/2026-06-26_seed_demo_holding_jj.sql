-- SEED DEMO — Holding Joaquín Jaén (FICTICIO, para la reunión). Marcado [seed-demo].
-- APLICADO a la BD compartida (wswbehlcuxqxyinousql) el 26/06/2026 con OK de Alberto.
-- Login demo en plataforma: demo-jj@central.local / JJdemo2026
--
-- LIMPIEZA (cuando se metan los datos reales de JJ): basta borrar la cuenta, la cascada
-- elimina sociedades + negocios + operaciones_intercompany:
--   DELETE FROM cuentas WHERE id='0de50000-0000-4000-a000-000000000001';
--
-- Números del consolidado que produce este seed:
--   Bruto:        ingresos 770.000 · gastos 545.000 · resultado 225.000
--   Intercompany: 60.000 (Logística→Catering 40.000 flota + Materiales→Catering 20.000 menaje)
--   Consolidado:  ingresos 710.000 · gastos 485.000 · resultado 225.000 (el neto NO cambia)

INSERT INTO cuentas (id, nombre, email, password_hash) VALUES
  ('0de50000-0000-4000-a000-000000000001', 'Holding Joaquín Jaén (DEMO) [seed-demo]', 'demo-jj@central.local', '$2a$12$7tavTDoUulklEOcT24kZyO12M8dcjzORlWLVW/cubd5zJPK5f.jYS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sociedades (id, cuenta_id, nombre, cif) VALUES
  ('0de50000-0000-4000-a000-000000000010','0de50000-0000-4000-a000-000000000001','Catering JJ, S.L. [seed-demo]','B11000010'),
  ('0de50000-0000-4000-a000-000000000011','0de50000-0000-4000-a000-000000000001','Logística JJ, S.L. [seed-demo]','B11000011'),
  ('0de50000-0000-4000-a000-000000000012','0de50000-0000-4000-a000-000000000001','Eventos & Materiales JJ, S.L. [seed-demo]','B11000012')
ON CONFLICT (id) DO NOTHING;

INSERT INTO negocios (id, sociedad_id, nombre, sector, app, ingresos_manual, gastos_manual) VALUES
  ('0de50000-0000-4000-a000-000000000020','0de50000-0000-4000-a000-000000000010','Catering & eventos [seed-demo]','catering',NULL,600000,420000),
  ('0de50000-0000-4000-a000-000000000021','0de50000-0000-4000-a000-000000000011','Transporte / logística [seed-demo]','transporte',NULL,90000,70000),
  ('0de50000-0000-4000-a000-000000000022','0de50000-0000-4000-a000-000000000012','Alquiler de materiales [seed-demo]','materiales',NULL,80000,55000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO operaciones_intercompany (id, cuenta_id, sociedad_origen_id, sociedad_destino_id, importe, concepto, fecha, tipo, parent_type) VALUES
  ('0de50000-0000-4000-a000-000000000030','0de50000-0000-4000-a000-000000000001','0de50000-0000-4000-a000-000000000011','0de50000-0000-4000-a000-000000000010',40000,'Portes a eventos de catering [seed-demo]','2026-03-15','flota','porte'),
  ('0de50000-0000-4000-a000-000000000031','0de50000-0000-4000-a000-000000000001','0de50000-0000-4000-a000-000000000012','0de50000-0000-4000-a000-000000000010',20000,'Alquiler de menaje a eventos [seed-demo]','2026-04-10','materiales','alquiler')
ON CONFLICT (id) DO NOTHING;
