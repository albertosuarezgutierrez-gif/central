-- 2026-10-19e_correduria_pendiente_discrepancia.sql — F3b de la correduría (19/10/2026). SIN APLICAR: lo aplica Alberto.
--
-- Un dato del correo de un lead que NO cuadra con lo que ya había (ficha o respuesta anterior) espera a que Alberto elija
-- en Telegram (📇 lo que había · ✉️ el del correo, `clp_dis:<p>:<i>:f|c`). Ese mensaje es un pendiente más de
-- `correduria_pendiente_tg` con `tipo = 'discrepancia'` (no envía nada al cliente; se purga entero al cerrarse).
--
-- Código ANTES que el SQL: sin él, el INSERT del pendiente falla, el aviso sale SIN botones («elige en su ficha») y el
-- expediente sigue sin estar completo (asegura no lo da por completo). Idempotente: se puede pasar dos veces.

ALTER TABLE correduria_pendiente_tg DROP CONSTRAINT IF EXISTS correduria_pendiente_tg_tipo_check;
ALTER TABLE correduria_pendiente_tg ADD CONSTRAINT correduria_pendiente_tg_tipo_check
  CHECK (tipo IN ('peticion_datos', 'repregunta', 'recordatorio_cliente', 'tarificar', 'propuesta', 'contacto_sugerido', 'discrepancia'));
