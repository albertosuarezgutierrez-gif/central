-- Cursor incremental de las alertas de portales inmobiliarios (Idealista/Fotocasa).
--
-- POR QUÉ UNA TABLA PROPIA Y NO `correo_cursor`: esa es la del triaje de correo, y
-- su latido se mide con `SELECT max(updated_at) FROM correo_cursor`. Meter aquí
-- una fila que se refresca UNA vez al día (cuando el triaje corre cada 10 min)
-- haría que un triaje muerto siguiera pareciendo fresco — un vigía que miente.
--
-- `last_uid` = último UID YA PROCESADO de ese remitente (at-least-once: se
-- confirma tras ingerir el lote, así que un fallo a mitad reprocesa, no salta).
-- `uidvalidity` detecta que Gmail renumeró el buzón: si cambia, los UID viejos
-- no significan nada y hay que rebootstrapear por ventana de días.
CREATE TABLE IF NOT EXISTS subastas_correo_cursor (
  remitente     TEXT PRIMARY KEY,
  last_uid      INTEGER NOT NULL DEFAULT 0,
  uidvalidity   BIGINT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
