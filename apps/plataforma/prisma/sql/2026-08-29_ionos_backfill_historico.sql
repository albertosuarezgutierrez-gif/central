-- 29/08/2026 — IONOS: importar las 55 facturas del Gmail (mar-2023 → ago-2026).
--
-- Continuación de 2026-08-29_ionos_correduria.sql. Aquel arregló el NEGOCIO (los cargos se
-- repartían entre pisos y correduría) y la huella partida por el NIF mal leído. Lo que queda es
-- el agujero de verdad: en `gastos` solo había SEIS filas de IONOS y una sola imputada.
--
-- El agente de correo solo mira lo NUEVO, así que todo lo anterior a su estreno (11/07/2026) no
-- estaba en ningún sitio: el extracto de tarjeta solo cubre dic-2025→jul-2026, de modo que ni
-- siquiera había un cargo bancario que delatara la falta. «El agente no avisó» no era «no hay
-- nada»: la fuente completa de un proveedor es su buzón, no la bandeja.
--
-- Barrido del Gmail: 55 facturas, todas de IONOS Cloud S.L.U. (NIF B-85049435), 1.111,70 € en
-- total — 210,54 € (2023) · 260,15 € (2024) · 270,52 € (2025) · 370,49 € (2026).
-- OJO al buscarlas: el asunto cambió de formato. Hasta ago-2023 es «Su factura N del DD/MM/AAAA
-- de su contrato C» y desde sep-2023 «Tu factura N con fecha de DD/MM/AAAA»; buscar solo por el
-- segundo deja fuera 9 facturas (y así se contaron 46 en la primera pasada, no 55).
--
-- Cuatro contratos vivos bajo el mismo cliente 861075916: 95495065 (Servidor Virtual Cloud M +
-- Plesk, mensual día 11), 96517384 (SSL Ilimitado, anual el 31/05), y 111849515 / 112356828
-- (Domain Pack + Correo, desde abr-2026). Por eso los importes van de 1,82 € a 145,20 €.
--
-- 🚨 base_imponible e iva van DERIVADOS del total al 21 %, no leídos del PDF: el correo de IONOS
-- solo publica el importe total. Se comprobó contra las 5 facturas que el agente sí llegó a leer
-- por OCR (10,89 → 9,00+1,89 · 24,19 → 19,99+4,20 · 11,71 → 9,68+2,03 · 1,82 → 1,50+0,32 ·
-- 145,20 → 120,00+25,20): coinciden al céntimo con round(total/1,21). Queda anotado en
-- `raw_extraction.iva_derivado` para que aguas abajo nadie lo tome por un dato leído.
--
-- Los 12 cargos que el banco SÍ tiene (feb–jul 2026) casan uno a uno con su factura: 11 de ellos
-- exactamente 4 días después de la emisión (PayPal cobra tras facturar). El 12º va AL REVÉS —
-- el cargo de 18,15 € del 28/04/2026 es de la factura 202786276376, emitida el 29/04— así que un
-- cruce que solo mire hacia atrás lo deja sin casar; la ventana tiene que ser simétrica.
-- Cuadre 12/12.

BEGIN;

-- 1) Las 49 facturas que no existían en `gastos`.
--    `revisado = true`: no son candidatas a revisar, son histórico ya decidido (correduría,
--    igual que Vercel/Anthropic). `propiedad = NULL` = no se imputa a ningún piso, así que el
--    P&L por piso (lib/sivra/pl-mensual.ts) las excluye por construcción.
WITH f(fecha, numero, contrato, total, tarifa) AS (VALUES
  ('2023-03-10'::date, '202774752338', '95495065',  7.26::numeric,  'Servidor Virtual Cloud M'),
  ('2023-03-11', '202774893369', '95495065',   2.42, 'Servidor Virtual Cloud M'),
  ('2023-04-11', '202775195327', '95495065',   2.42, 'Servidor Virtual Cloud M'),
  ('2023-05-11', '202775504194', '95495065',   2.42, 'Servidor Virtual Cloud M'),
  ('2023-05-24', '202775641636', '95495065',  36.30, 'Servidor Virtual Cloud M'),
  ('2023-05-31', '202775706581', '96517384', 121.00, 'IONOS SSL Ilimitado'),
  ('2023-06-11', '202775820061', '95495065',   2.42, 'Servidor Virtual Cloud M'),
  ('2023-07-11', '202776126410', '95495065',   9.68, 'Servidor Virtual Cloud M'),
  ('2023-08-11', '202776429118', '95495065',   2.42, 'Servidor Virtual Cloud M'),
  ('2023-09-11', '202776729037', '95495065',   6.05, 'Servidor Virtual Cloud M'),
  ('2023-10-11', '202777036228', '95495065',   6.05, 'Servidor Virtual Cloud M'),
  ('2023-11-11', '202777348348', '95495065',   6.05, 'Servidor Virtual Cloud M'),
  ('2023-12-11', '202777660247', '95495065',   6.05, 'Servidor Virtual Cloud M'),
  ('2024-01-11', '202777969747', '95495065',  13.31, 'Servidor Virtual Cloud M'),
  ('2024-02-11', '202778292256', '95495065',  16.94, 'Servidor Virtual Cloud M'),
  ('2024-03-11', '202778605940', '95495065',  18.15, 'Servidor Virtual Cloud M'),
  ('2024-04-11', '202778918731', '95495065',   6.05, 'Servidor Virtual Cloud M'),
  ('2024-05-11', '202779228655', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2024-05-31', '202779426700', '96517384', 145.20, 'IONOS SSL Ilimitado'),
  ('2024-06-11', '202779538004', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2024-07-11', '202779843522', '95495065',  18.15, 'IONOS Servidor Virtual Cloud M'),
  ('2024-08-11', '202780144956', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2024-09-11', '202780443012', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2024-10-11', '202780750037', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2024-11-11', '202781060068', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2024-12-11', '202781366819', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-01-11', '202781680511', '95495065',  18.15, 'IONOS Servidor Virtual Cloud M'),
  ('2025-02-11', '202781993540', '95495065',  24.20, 'IONOS Servidor Virtual Cloud M'),
  ('2025-03-11', '202782315794', '95495065',  18.15, 'IONOS Servidor Virtual Cloud M'),
  ('2025-05-11', '202782917061', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-05-31', '202783107999', '96517384', 145.20, 'IONOS SSL Ilimitado'),
  ('2025-06-11', '202783215336', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-07-11', '202783506704', '95495065',  18.15, 'IONOS Servidor Virtual Cloud M'),
  ('2025-08-11', '202783791121', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-09-11', '202784070425', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-10-11', '202784359467', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-11-11', '202784654063', '95495065',   6.05, 'IONOS Servidor Virtual Cloud M'),
  ('2025-12-11', '202784947038', '95495065',  10.37, 'IONOS Servidor Virtual Cloud M'),
  ('2026-01-11', '202785236465', '95495065',  24.20, 'IONOS Servidor Virtual Cloud M'),
  ('2026-02-11', '202785535237', '95495065',  30.27, 'IONOS Servidor Virtual Cloud M'),
  ('2026-03-11', '202785827210', '95495065',  24.18, 'IONOS Servidor Virtual Cloud M'),
  ('2026-04-29', '202786276376', '111849515', 18.15, 'IONOS Domain Pack'),
  ('2026-05-11', '202786384249', '95495065',  12.09, 'IONOS Servidor Virtual Cloud M'),
  ('2026-05-29', '202786522956', '111849515', 10.89, 'IONOS Domain Pack'),
  ('2026-05-31', '202786539613', '96517384', 145.20, 'IONOS SSL Ilimitado'),
  ('2026-06-01', '202786545922', '112356828',  9.08, 'IONOS Domain Pack'),
  ('2026-06-11', '202786622605', '95495065',  12.11, 'IONOS Servidor Virtual Cloud M'),
  ('2026-06-29', '202786733855', '111849515', 10.89, 'IONOS Domain Pack'),
  ('2026-07-01', '202786746731', '112356828',  1.82, 'IONOS Domain Pack')
)
INSERT INTO gastos
  (fecha, proveedor, nif_proveedor, numero_factura, concepto, categoria, propiedad,
   base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total,
   fingerprint, origen, revisado, confianza, raw_extraction)
SELECT
  f.fecha, 'IONOS Cloud S.L.U.', 'B-85049435', f.numero,
  f.tarifa || ' (contrato ' || f.contrato || ')', 'PLATAFORMAS', NULL,
  round(f.total / 1.21, 2), f.total - round(f.total / 1.21, 2), 21, 0, 0, f.total,
  'B85049435', 'backfill-gmail', true, 1.0,
  jsonb_build_object(
    'fuente', 'gmail:noreply@ionos.es',
    'cliente_ionos', '861075916',
    'contrato', f.contrato,
    'tarifa', f.tarifa,
    'total', f.total,
    'iva_derivado', true,
    'nota', 'base_imponible e iva DERIVADOS del total al 21%: el correo de IONOS solo publica el importe total. Verificado contra las 5 facturas leidas por OCR.'
  )
FROM f
WHERE NOT EXISTS (SELECT 1 FROM gastos g WHERE g.numero_factura = f.numero);

-- 2) La fila de abr-2026 se metió a mano antes de que existiera el agente: sin nº de factura,
--    sin NIF, sin huella y con `propiedad='prop_multi_apartamentos'` (los pisos). Es la factura
--    202786116617 del 11/04/2026, así que se reconcilia en vez de duplicarse — y se saca de los
--    pisos, que es la decisión del PR anterior.
UPDATE gastos
SET proveedor      = 'IONOS Cloud S.L.U.',
    nif_proveedor  = 'B-85049435',
    numero_factura = '202786116617',
    fingerprint    = 'B85049435',
    categoria      = 'PLATAFORMAS',
    propiedad      = NULL,
    base_imponible = round(12.11 / 1.21, 2),
    iva            = 12.11 - round(12.11 / 1.21, 2),
    iva_porcentaje = 21
WHERE fecha = '2026-04-11' AND total = 12.11
  AND concepto ILIKE '%IONOS%' AND numero_factura IS NULL;

-- 3) Las 5 que el agente sí leyó seguían en la bandeja sin confirmar. Son el mismo proveedor y
--    la misma decisión que las 50 anteriores.
UPDATE gastos
SET revisado = true, motivo_revision = NULL, propiedad = NULL, categoria = 'PLATAFORMAS'
WHERE proveedor ILIKE '%IONOS%' AND revisado = false;

-- 4) Regla aprendida, con banda ANCHA a propósito.
--    `evaluar()` (lib/agente-facturas/reglas.ts) exige vistas >= MIN_VISTAS (2) Y que el total
--    caiga dentro de [importe_min, importe_max], que por defecto es ±10% del esperado. IONOS
--    factura por CONTRATO con importes de 1,82 € a 145,20 €, así que con la banda por defecto
--    volvería a la bandeja cada mes por mucho que se confirme. 1–200 € cubre los cuatro contratos
--    y deja fuera un salto de precio que sí merece una mirada.
--    `reforzarRegla` solo ENSANCHA la banda (LEAST/GREATEST), nunca la estrecha.
INSERT INTO gastos_reglas
  (fingerprint, proveedor, nif_proveedor, propiedad, categoria,
   iva_porcentaje, irpf_porcentaje, importe_esperado, importe_min, importe_max,
   periodicidad, vistas, ultima_fecha, activa)
VALUES
  ('B85049435', 'IONOS Cloud S.L.U.', 'B-85049435', NULL, 'PLATAFORMAS',
   21, 0, 12.11, 1.00, 200.00, 'mensual', 2, '2026-08-29'::date, true)
ON CONFLICT (fingerprint) DO UPDATE SET
  proveedor = EXCLUDED.proveedor, nif_proveedor = EXCLUDED.nif_proveedor,
  categoria = EXCLUDED.categoria, iva_porcentaje = EXCLUDED.iva_porcentaje,
  importe_min = LEAST(gastos_reglas.importe_min, EXCLUDED.importe_min),
  importe_max = GREATEST(gastos_reglas.importe_max, EXCLUDED.importe_max),
  vistas = GREATEST(gastos_reglas.vistas, EXCLUDED.vistas),
  activa = true, updated_at = now();

COMMIT;
