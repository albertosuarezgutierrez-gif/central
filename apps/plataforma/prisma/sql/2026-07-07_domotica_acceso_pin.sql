-- Fase 2 de accesos NIVIAN: PIN temporal por reserva de Smoobu.
-- Idempotencia = índice único (dispositivo_id, reserva_ref): un PIN vivo por reserva y puerta.
-- Una cerradura puede colgar de VARIOS pisos (BustoTavera), por eso el smoobu_apartment_id va por fila.
CREATE TABLE IF NOT EXISTS domotica_acceso_pin (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id      uuid NOT NULL REFERENCES domotica_dispositivos(id) ON DELETE CASCADE,
  smoobu_apartment_id integer,
  property_id         text,
  reserva_ref         text NOT NULL,
  pin                 text,             -- el código (online: elegido; offline: devuelto por Tuya)
  tuya_password_id    text,             -- id del password en Tuya (para poder borrarlo)
  modo                text,             -- 'online' | 'offline'
  valido_desde        timestamptz NOT NULL,
  valido_hasta        timestamptz NOT NULL,
  estado              text NOT NULL DEFAULT 'activo',  -- activo | caducado | borrado | error
  entregado           boolean NOT NULL DEFAULT false,
  detalle             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS domotica_acceso_pin_idem
  ON domotica_acceso_pin (dispositivo_id, reserva_ref);

CREATE INDEX IF NOT EXISTS domotica_acceso_pin_disp
  ON domotica_acceso_pin (dispositivo_id, estado);

-- BD compartida: nunca accesible por los roles públicos de Supabase.
REVOKE ALL ON domotica_acceso_pin FROM anon, authenticated;
