-- ⏳ PENDIENTE DE APLICAR. Se aplica ANTES de desplegar el código que la usa:
-- es aditiva y el código viejo sigue funcionando sobre ella (escribe siempre
-- `caduca_en` con fecha y nunca usa `total`).
--
-- ── QUÉ CAMBIA (25/09/2026, decisión de Alberto) ─────────────────────────────
--
-- 1. **Las autorizaciones dejan de caducar.** «Mejor no caduca, es un lío luego
--    volver a pedir acceso». `caduca_en` NULL = no caduca; con fecha sigue
--    significando lo de siempre (filas viejas ya caducadas). A cambio, el
--    otorgante recibe una vez al año la pregunta «¿lo mantienes?»
--    (`revisado_en`, ver `pideRevision` en `@central/module-seguros-portal`).
--    Si no contesta, el acceso SIGUE: la revisión recuerda, no corta.
--
-- 2. **Dos permisos: «Solo ver» (`ver_economico`) y «Acceso total» (`total`).**
--    `total` es ver y hacer TODO lo que el titular — también en una persona
--    física, incluidos su DNI y su IBAN (decisión expresa de Alberto, con su
--    propio texto de consentimiento). Lo único que no da es autorizar a un
--    cuarto. No exige `titulo_representacion` en BD: en una persona física no
--    se representa a nadie; en una sociedad el título lo exige el código.
--
-- Las invitaciones y las peticiones siguen caducando: lo que caduca ahí es el
-- ENLACE o la PETICIÓN, no el acceso. Y se quedan en «Solo ver» a propósito:
-- `total` (DNI, IBAN, partes) no se reparte por un enlace de correo, donde una
-- errata en la dirección se lo daría a un desconocido. Se concede sobre un
-- acceso que ya existe y cuya persona ya ha probado quién es («Pasar a acceso
-- total»), y esa persona tiene que aceptarlo.

SET search_path = seguros, public;

BEGIN;

-- 1. Sin caducidad. El CHECK `caduca_despues` ya tolera NULL (un CHECK con NULL
--    pasa), así que no hace falta tocarlo.
ALTER TABLE seguros.portal_autorizacion ALTER COLUMN caduca_en DROP NOT NULL;
ALTER TABLE seguros.portal_autorizacion ADD COLUMN IF NOT EXISTS revisado_en timestamptz;

-- Las vivas (pendientes y aceptadas) pasan a no caducar. Las que ya caducaron
-- se quedan con su fecha: dejaron de valer y resucitarlas sería conceder algo
-- que nadie ha vuelto a conceder.
UPDATE seguros.portal_autorizacion
   SET caduca_en = NULL
 WHERE revocado_en IS NULL
   AND caduca_en > now();

-- 2. El alcance `total`.
ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_alcance_check;
ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_alcance_check
  CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos', 'total'));


COMMIT;
