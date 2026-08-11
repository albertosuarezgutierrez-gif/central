-- FK real entre `facturas_drive` y `movimientos_bancarios` (11/08/2026).
--
-- POR QUÉ EXISTE
-- Hasta hoy las dos tablas no tenían ninguna relación: el único puente era
-- `movimientos_bancarios.factura_ref`, un TEXT libre que cada pasada del agente
-- `facturas-correo` rellenaba a su manera (URL de Drive, nota de EMASESA,
-- referencia de e-factura, texto suelto). Con eso, la pregunta «¿qué factura
-- archivada no tiene cargo?» no se podía contestar: cruzar por `factura_ref` da
-- falsos negativos en las filas viejas y cruzar por importe da falsos positivos
-- en los tres patrones conocidos (Endesa Dúplex suma +5,78€ de servicio,
-- PriceLabs factura en USD y cobra en EUR, y hay cargos agrupados).
--
-- Coste real de no tenerlo: 11 facturas archivadas desde enero se quedaron sin
-- cargo casado. Sus movimientos conservaron el `destino='personal'` por defecto,
-- así que ese gasto desapareció del radar de deducibles — y las pasadas diarias
-- seguían cerrando «sin novedades» porque solo miraban el correo nuevo.
--
-- TRES ESTADOS, NO DOS (regla de la casa: un NULL no es un «no hay»)
--   movimiento_id NOT NULL                        → casada con su cargo
--   movimiento_id NULL + sin_cargo_motivo NOT NULL → revisada, no hay cargo (y por qué)
--   ambas NULL                                     → SIN revisar todavía
-- Sin el motivo, «no tiene cargo» y «nadie lo ha mirado» volverían a ser el mismo
-- hueco, que es justo el fallo que este cambio viene a cerrar.

ALTER TABLE facturas_drive
  ADD COLUMN IF NOT EXISTS movimiento_id UUID
    REFERENCES movimientos_bancarios(id) ON DELETE SET NULL;

ALTER TABLE facturas_drive
  ADD COLUMN IF NOT EXISTS sin_cargo_motivo TEXT;

-- Un cargo puede cubrir VARIAS facturas (el Dúplex trae electricidad + servicio
-- en un solo débito; una liquidación de Booking agrupa reservas), así que la
-- relación es muchos-a-uno y el índice NO es único a propósito.
CREATE INDEX IF NOT EXISTS idx_facturas_drive_movimiento
  ON facturas_drive(movimiento_id);

-- Cola de trabajo del Paso 4.0 del agente: lo que aún no se ha mirado.
CREATE INDEX IF NOT EXISTS idx_facturas_drive_sin_revisar
  ON facturas_drive(anio, mes)
  WHERE movimiento_id IS NULL AND sin_cargo_motivo IS NULL;

COMMENT ON COLUMN facturas_drive.movimiento_id IS
  'Cargo bancario que paga esta factura. NULL no significa «no hay cargo»: mira sin_cargo_motivo para distinguir «revisada, no lo hay» de «sin revisar».';
COMMENT ON COLUMN facturas_drive.sin_cargo_motivo IS
  'Por qué esta factura NO tiene cargo, cuando ya se ha revisado. Valores en uso: sin_cargo_localizado (buscado y no aparece en ninguna cuenta del feed) · fuera_del_feed (se paga desde una cuenta que no importamos, p. ej. la SL) · impagada · duplicada (misma factura archivada dos veces; el cargo cuelga de la otra fila). NULL = todavía sin revisar.';

-- Vista canónica del barrido: la consulta que antes había que escribir a mano y
-- llevaba asteriscos. Se lee tal cual — no reimplementar el cruce por importe.
CREATE OR REPLACE VIEW v_facturas_sin_cargo AS
SELECT
  fd.id,
  fd.proveedor,
  fd.anio,
  fd.mes,
  fd.importe,
  fd.nombre_archivo,
  fd.drive_url,
  CASE
    WHEN fd.sin_cargo_motivo IS NOT NULL THEN 'revisada_sin_cargo'
    ELSE 'sin_revisar'
  END AS estado,
  fd.sin_cargo_motivo
FROM facturas_drive fd
WHERE fd.movimiento_id IS NULL;

COMMENT ON VIEW v_facturas_sin_cargo IS
  'Facturas archivadas sin cargo bancario casado, separando «revisada y no lo hay» de «sin revisar». Consumidor: Paso 4.0 del agente facturas-correo y el latido del escaneo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL de 2026 (ya aplicado el 11/08/2026). Idempotente: solo toca filas
-- cuyo `movimiento_id` sigue a NULL.
--
-- Paso automático: solo se enlaza cuando hay UN ÚNICO cargo conciliado del
-- importe exacto en una ventana razonable alrededor del mes de la factura. Con
-- dos candidatos no se adivina — se deja para que lo mire una persona.
WITH cand AS (
  SELECT fd.id AS fid, mb.id AS mid, count(*) OVER (PARTITION BY fd.id) AS n
  FROM facturas_drive fd
  JOIN cuentas_bancarias cb ON cb.cuenta_id = '4fdc993a-dde7-4200-8fc6-0e8840802ff1'::uuid
  JOIN movimientos_bancarios mb ON mb.cuenta_bancaria_id = cb.id
  WHERE fd.anio = 2026 AND fd.movimiento_id IS NULL
    AND mb.conciliado AND mb.importe < 0
    AND abs(mb.importe + fd.importe) < 0.02
    AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    AND mb.fecha_operacion BETWEEN make_date(fd.anio, fd.mes, 1) - 15
                               AND (make_date(fd.anio, fd.mes, 1) + interval '1 month')::date + 45
)
UPDATE facturas_drive fd SET movimiento_id = cand.mid
FROM cand WHERE cand.fid = fd.id AND cand.n = 1;

-- Los tres patrones que el cruce por importe NO puede casar, uno a uno:
--   · Endesa Dúplex — el cargo suma +5,78€ del servicio Electric Protección 360.
--     (Marzo queda A PROPÓSITO sin enlazar: su único candidato del mes se separa
--      9,70€, no 5,78€, así que no encaja en el patrón y necesita que alguien
--      abra el PDF. Dejarlo «sin revisar» es lo que lo mantiene en la cola.)
--   · PriceLabs — factura 64,96 USD contra cargo 56,38€: la diferencia es el cambio.
UPDATE facturas_drive SET movimiento_id = '54e8ae54-acd0-443e-a738-27e3ea6892d7'
  WHERE anio=2026 AND mes=4 AND proveedor='endesa_duplex' AND movimiento_id IS NULL;
UPDATE facturas_drive SET movimiento_id = 'e091b4c7-35d2-45da-a49f-b0d9f22ae925'
  WHERE anio=2026 AND mes=5 AND proveedor='endesa_duplex' AND movimiento_id IS NULL;
UPDATE facturas_drive SET movimiento_id = '4ed85a4a-b8de-4af9-b5f8-2baee2db602c'
  WHERE anio=2026 AND mes=6 AND proveedor='endesa_duplex' AND movimiento_id IS NULL;
UPDATE facturas_drive SET movimiento_id = '737b41f4-0137-4248-b7c9-761828d0eba3'
  WHERE anio=2026 AND mes=6 AND proveedor='pricelabs' AND movimiento_id IS NULL;

-- El ticket CREATE de junio está archivado DOS veces con distinto fichero de
-- Drive y el banco solo tiene UN cargo: el gasto cuelga de `create_ventilador`
-- (la fila que lleva el nº de factura) y esta queda marcada como duplicada.
UPDATE facturas_drive SET movimiento_id = NULL, sin_cargo_motivo = 'duplicada'
  WHERE anio=2026 AND mes=6 AND proveedor='create-socorro';

-- Buscadas en TODAS las cuentas del feed y sin ningún cargo: Pepephone de enero
-- a junio (probablemente domiciliado en la cuenta de la SL, fuera del feed) y la
-- lavandería Giraldillo de mayo. Revisadas, no es que falten por mirar.
UPDATE facturas_drive SET sin_cargo_motivo = 'sin_cargo_localizado'
  WHERE anio=2026 AND movimiento_id IS NULL AND sin_cargo_motivo IS NULL
    AND (proveedor='pepephone' OR (proveedor='giraldillo' AND mes=5));
