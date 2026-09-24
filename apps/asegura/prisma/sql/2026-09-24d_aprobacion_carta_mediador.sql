-- 2026-09-24 — La carta de nombramiento de mediador sale por la cola de aprobaciones (PR 6, cierre).
--
-- Mismo camino que la anulación firmada (2-d-3): la carta que el cliente firmó en el portal se
-- propone como `enviar_correo_compania` y sale adjunta al buzón de SU compañía que elige Alberto;
-- al salir, la carta pasa a `enviada`. `carta_mediador_id` ata la propuesta a su carta.
--
-- Una propuesta para la compañía apunta a UNA cosa: anulación O carta, nunca las dos ni ninguna
-- (el CHECK viejo exigía `anulacion_id` y se sustituye).
--
-- `recibe_nombramientos`: el buzón que recibió la última carta de esa compañía, para preseleccionarlo.
-- Va aparte de `recibe_anulaciones` porque el departamento que tramita bajas no tiene por qué ser el
-- que cambia de mediador.
--
-- ADITIVA. Reversible: DROP INDEX idx_aprobacion_carta_viva; DROP CONSTRAINT aprobacion_compania_con_objeto;
-- DROP COLUMN carta_mediador_id; volver a aprobacion_compania_con_anulacion; DROP COLUMN recibe_nombramientos.

ALTER TABLE seguros.aprobacion ADD COLUMN IF NOT EXISTS carta_mediador_id uuid REFERENCES seguros.carta_mediador(id);

ALTER TABLE seguros.aprobacion DROP CONSTRAINT IF EXISTS aprobacion_compania_con_anulacion;
ALTER TABLE seguros.aprobacion ADD CONSTRAINT aprobacion_compania_con_objeto
  CHECK (accion <> 'enviar_correo_compania' OR num_nonnulls(anulacion_id, carta_mediador_id) = 1);

-- Una sola propuesta VIVA por carta (mismo motivo que idx_aprobacion_anulacion_viva).
CREATE UNIQUE INDEX IF NOT EXISTS idx_aprobacion_carta_viva
  ON seguros.aprobacion (carta_mediador_id)
  WHERE carta_mediador_id IS NOT NULL AND estado IN ('pendiente', 'enviando');

ALTER TABLE seguros.compania_contactos
  ADD COLUMN IF NOT EXISTS recibe_nombramientos boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN seguros.compania_contactos.recibe_nombramientos IS
  'Buzón al que se mandó la última carta de nombramiento aprobada de esta compañía; preselección, nunca envío automático.';
