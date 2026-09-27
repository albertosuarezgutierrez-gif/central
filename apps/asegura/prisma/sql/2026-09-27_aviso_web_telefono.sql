-- «Avísame antes de que venza»: móvil OPCIONAL, 27/09/2026.
--
-- Solo se guarda si la persona marcó además la casilla de que le LLAMEMOS (consentimiento
-- `web-aviso-v2`): el de «escribirme» no cubre una llamada comercial (Ley 11/2022, art. 66). Así que
-- `telefono IS NOT NULL` en una fila v2 = consentimiento de llamada dado. Cifrado (`v1:`) como el correo.
-- Nadie verifica el número: al confirmar se AÑADE a la ficha ya decidida por el correo, nunca se usa
-- para buscar ni fundir fichas.
ALTER TABLE seguros.aviso_web ADD COLUMN IF NOT EXISTS telefono text;
ALTER TABLE seguros.aviso_web DROP CONSTRAINT IF EXISTS aviso_web_telefono_cifrado;
ALTER TABLE seguros.aviso_web ADD CONSTRAINT aviso_web_telefono_cifrado CHECK (telefono IS NULL OR telefono LIKE 'v1:%');
