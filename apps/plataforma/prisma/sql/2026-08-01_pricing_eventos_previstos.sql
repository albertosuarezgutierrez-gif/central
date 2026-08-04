-- Eventos PREVISTOS: adelantarse a lo que aún no tiene entradas a la venta.
--
-- POR QUÉ (01/08/2026, idea de Alberto). Las dos fuentes automáticas solo ven el presente:
-- Ticketmaster enseña lo que YA está a la venta, y el prompt de búsqueda web pide explícitamente
-- eventos "CONFIRMADOS". Pero los eventos que más mueven el precio se saben MESES antes de que
-- exista una entrada: la sede de la final de la Copa del Rey se adjudica con medio año de margen,
-- un congreso de FIBES se anuncia al cerrar el contrato, una gira publica ciudades antes que fechas.
-- Justo esa ventana —cuando todavía se puede subir el precio sin prisa y el raíl de ±%/día da tiempo
-- a llegar— es la que estábamos perdiendo entera.
--
-- LA ASIMETRÍA QUE JUSTIFICA TODO ESTO. Un evento previsto NO es un evento: es una apuesta. Así que
-- no se le deja tocar el precio objetivo (inflar por un rumor de prensa sería inventarse demanda,
-- y el centinela #7 tendría razón al saltar). Lo que SÍ hace es:
--   · PROTEGER EL SUELO — impedir que esa noche se venda al mínimo mientras se confirma. Equivocarse
--     aquí cuesta unas noches sin vender a precio bajo; NO hacerlo cuesta la final de Copa vendida a
--     precio de sábado corriente, que no se recupera.
--   · ENTRAR EN EL BARRIDO de mercado, para que el dato real llegue y decida.
--   · AVISAR a Alberto, que es quien confirma.
--
-- `estado` NO admite NULL a propósito: las filas que ya existen son todas de fuentes que solo
-- publican lo confirmado, así que 'confirmado' es el valor correcto para el histórico, no un
-- «no se sabe» disfrazado.
ALTER TABLE pricing_eventos_auto
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'confirmado';

ALTER TABLE pricing_eventos_auto
  DROP CONSTRAINT IF EXISTS pricing_eventos_auto_estado_chk;
ALTER TABLE pricing_eventos_auto
  ADD CONSTRAINT pricing_eventos_auto_estado_chk
  CHECK (estado IN ('confirmado', 'previsto', 'descartado'));

-- Fuente de la que salió la previsión y qué la respalda, para poder juzgarla sin volver a buscar.
ALTER TABLE pricing_eventos_auto
  ADD COLUMN IF NOT EXISTS confianza numeric,
  ADD COLUMN IF NOT EXISTS evidencia text,
  ADD COLUMN IF NOT EXISTS avisado_at timestamptz;

COMMENT ON COLUMN pricing_eventos_auto.estado IS
  'confirmado = hay entradas/fecha oficial, mueve precio y suelo. previsto = solo prensa, NO mueve el precio objetivo: solo protege el suelo, entra en el barrido de mercado y avisa a Alberto. descartado = revisado y falso (no vuelve a proponerse).';
COMMENT ON COLUMN pricing_eventos_auto.confianza IS
  '0-1, solo en previstos. Lo estima la búsqueda; por debajo de SIVRA_EVENTOS_CONFIANZA_MIN ni siquiera se guarda.';
COMMENT ON COLUMN pricing_eventos_auto.evidencia IS
  'Titular/medio en el que se apoya la previsión. Es lo que Alberto lee para confirmar o descartar.';
COMMENT ON COLUMN pricing_eventos_auto.avisado_at IS
  'Cuándo se avisó por Telegram. NULL = pendiente de avisar (dedupe del aviso, no del evento).';

-- Los previstos se consultan por fecha y estado en cada pasada del motor y del barrido.
CREATE INDEX IF NOT EXISTS pricing_eventos_auto_estado_fecha_idx
  ON pricing_eventos_auto (estado, rate_date);
