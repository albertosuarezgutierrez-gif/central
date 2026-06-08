-- QR · "Llamar al camarero" configurable por el dueño
-- Algunos locales son 100% autoservicio (sin camareros, barra/recogida) y no
-- quieren el botón de llamar al camarero en la pantalla del cliente.
-- Por defecto ACTIVADO (true) para no cambiar el comportamiento de los que ya lo usan.

ALTER TABLE cobro_config
  ADD COLUMN IF NOT EXISTS qr_llamar_camarero BOOLEAN NOT NULL DEFAULT true;
