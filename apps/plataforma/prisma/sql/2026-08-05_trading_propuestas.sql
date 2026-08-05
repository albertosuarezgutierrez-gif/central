-- Propuestas de órdenes REALES del agente de trading (escalera de tramos, pre-registro 05/08/2026).
-- Una fila por instrucción creada en IBKR vía MCP (create_order_instruction). La escribe la sesión
-- de trading al proponer; el webhook de Telegram (botón ❌, callback `trd_no:<id>`) marca el rechazo
-- para que la sesión borre la instrucción en su siguiente check-in (el servidor NO tiene acceso a
-- IBKR). Tres estados y el NULL de decidido_en significa «Alberto aún no ha decidido», no «no».
CREATE TABLE IF NOT EXISTS trading_propuestas (
  instruccion_id text PRIMARY KEY,          -- id de la instrucción en IBKR (p. ej. '100')
  simbolo        text,
  detalle        jsonb,                     -- {lado, cantidad, limite, motivo, tramo}
  estado         text NOT NULL DEFAULT 'propuesta',  -- propuesta | rechazada | enviada | caducada
  creado_en      timestamptz NOT NULL DEFAULT now(),
  decidido_en    timestamptz
);
