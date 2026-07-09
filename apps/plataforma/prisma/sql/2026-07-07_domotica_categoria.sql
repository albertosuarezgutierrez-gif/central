-- 2026-07-07_domotica_categoria.sql — guardar la categoría Tuya del dispositivo
-- (la devuelve tuyaListDevices; hoy se descarta). Permite pintar la tarjeta correcta
-- (ventilador vs control de acceso) sin volver a llamar a Tuya.
ALTER TABLE domotica_dispositivos ADD COLUMN IF NOT EXISTS categoria text;
