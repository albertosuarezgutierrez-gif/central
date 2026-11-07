-- N3 — 0034: la fila del outbox `rrhh.hechos_nominas` guarda la empresa de CONTABILIDAD destino vigente al confirmar la nómina.
-- Antes el cron la sacaba con un JOIN a `empresa_modulos` en el momento del envío: re-vincular la empresa cambiaba a dónde iban hechos ya encolados.
-- ADITIVA e IDEMPOTENTE (ADD COLUMN IF NOT EXISTS; el UPDATE solo toca filas aún sin destino). Requiere 0031 y 0033. No edita 0033.
-- Se aplica a mano como `postgres` ANTES de desplegar la app que escribe/lee la columna.
BEGIN;

ALTER TABLE rrhh.hechos_nominas ADD COLUMN IF NOT EXISTS contabilidad_empresa_id uuid;

-- Relleno SOLO de lo pendiente/en error (lo enviado/rechazado es histórico y no se reenvía) con el vínculo actual del módulo.
UPDATE rrhh.hechos_nominas h
   SET contabilidad_empresa_id = m.contabilidad_empresa_id
  FROM rrhh.empresa_modulos m
 WHERE m.empresa_id = h.empresa_id AND m.modulo = 'contabilidad_nominas'
   AND h.contabilidad_empresa_id IS NULL AND h.estado IN ('pendiente', 'error')
   AND m.contabilidad_empresa_id IS NOT NULL;

COMMIT;
