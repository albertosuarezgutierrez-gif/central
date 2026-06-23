-- Limpieza de duplicados técnicos PSD2: BBVA y Kutxa devuelven cada transacción dos veces
-- en sus feeds (entry_reference distinto por llamada → dos hashes distintos → dos filas en BD).
-- Se conserva la entrada con menor created_at (primera recibida) y se borra la segunda.
-- Aplicado el 2026-06-23 vía Supabase MCP execute_sql. 16 filas eliminadas.
--
-- Patrones afectados:
--   CUOTA PTMO 856289293-5       (hipoteca Montecarmelo, 3 meses)
--   TARJ.CRDTO 4662032019650302  (tarjeta, 3 meses)
--   TARJ.CRDTO 4662032019750300  (tarjeta, 3 meses)
--   KUTXABANK SEG. VIDA          (2 meses)
--   COMISION POR EMISION DE C    (1 mes)
--   RECIBO AYTO. SEVILLA         (1 mes)
--   LIQ. DE INT.HASTA 31.03.26   (1 mes, importe 0)
--   TRANSF. DEVOLUCIONES TRIB. AEAT (2 meses, abono deducción maternidad)
--
-- Para evitar recurrencia: lib/psd2.ts añade dedup secundario por contenido
-- (fecha+importe+concepto) dentro de cada llamada de sincronización.
-- lib/banca.ts::getDuplicadosSospechosos excluye además pares psd2+psd2 mismo
-- concepto+fecha (backstop) y pares cross-origen psd2↔norma43/xls.

DELETE FROM movimientos_bancarios
WHERE id = ANY(ARRAY[
  '826a6511-99d6-481b-a4fa-ece89050acdd',
  '24261f06-93e3-4413-9b0b-a03238eb65f4',
  '0990b7a8-9955-4a75-af3b-f101f02fa075',
  '3d5fd637-60c5-49ca-b33b-d10315308aa0',
  '00bc72cc-4c46-46bd-a27d-e9b2fbc76be0',
  '62b0e915-c605-42ca-9dc2-0a618fa29757',
  'd0ef7256-03c7-4599-be50-d6f77b07074b',
  '1d90ea13-0dae-4bb5-836e-e1b9e4edbb72',
  '72f379da-c591-4e1a-b40b-ca8224eaf499',
  'd0ddc82c-bb70-426c-baf5-ddcb23266f08',
  'c702dc34-8d6c-42ae-975f-fc3804a4edf5',
  'c021be5c-25cd-4488-a868-7317a025c920',
  'b4f9e04a-546f-4192-9eb8-80ce351c3343',
  '48306b90-a8da-40db-9968-8c57427af450',
  'ef219cec-3ad7-4e9e-aa14-aecad7222b6a',
  '947a1dda-1bbf-4276-acd9-d792904838f5'
]::uuid[]);
