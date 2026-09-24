-- 2026-09-24l — El cliente puede subir documentos por el enlace de datos (DNI, carné,
-- papeles del vehículo, su póliza). El fichero se archiva en `documentos` (su ficha);
-- aquí solo queda lo que la IA leyó de cada uno, CIFRADO, para proponer valores y
-- contrastarlos con lo declarado. Nada de eso se escribe en la ficha.
ALTER TABLE seguros.solicitud_datos ADD COLUMN IF NOT EXISTS lecturas text;
ALTER TABLE seguros.solicitud_datos ADD COLUMN IF NOT EXISTS documentos_subidos int NOT NULL DEFAULT 0;
