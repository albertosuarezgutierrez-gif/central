-- 2026-07-12 · Los traspasos internos no necesitan revisión (limpieza de la bandeja de ingresos).
--
-- CONTEXTO: la bandeja «🔎 Ingresos por revisar» de /banca (PR #840) mostraba los pagos del recibo de
-- la tarjeta ("PAGO RECIBO 4662032019750300 / …650302", importes altos: 2.698€, 1.355€, 1.389€…) como
-- si fueran ingresos a clasificar. Son `traspaso_interno` (movimiento entre cuenta y tarjeta): el gasto
-- real ya está en el detalle de la tarjeta, no son ingreso ni tienen negocio que asignar. El flag
-- `requiere_revision` les había quedado puesto por la incertidumbre de CATEGORÍA de la IA al ingestar
-- (distinto del destino, que ya era el correcto). `lib/destino.ts` marca traspaso_interno como
-- determinista (revisar:false), así que el flag sobra.
--
-- El código ya excluye `traspaso_interno` de la bandeja (`lib/banca.ts::listarIngresosPorRevisar`).
-- Esto limpia el dato histórico. Aplicada en prod vía Supabase MCP (28 filas). Idempotente.

UPDATE movimientos_bancarios
SET requiere_revision = false
WHERE destino = 'traspaso_interno'
  AND requiere_revision = true;
