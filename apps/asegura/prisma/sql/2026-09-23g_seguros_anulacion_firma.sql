-- 2026-09-23 — Firma del cliente de la anulación en el portal (ASegura OS, pieza 2-d-2).
--
-- `carta_texto`: el texto EXACTO que el tomador firmó (se guarda al firmar). Es lo que se manda a la
-- compañía y lo que permite recomprobar la huella de `seguros.firma.doc_hash`; recomponerlo después
-- con otra redacción daría otra huella.
-- `firma_otp_*`: el código de un solo uso que se envía al correo de la ficha para firmar (10 min,
-- 5 intentos, hasheado). Refuerza el control exclusivo (eIDAS art. 26.c): la sesión del portal dura
-- 30 días y no basta para firmar una anulación.
--
-- ADITIVA. Reversible: ALTER TABLE seguros.anulacion DROP COLUMN … (las cuatro).

ALTER TABLE seguros.anulacion
  ADD COLUMN IF NOT EXISTS carta_texto        text,
  ADD COLUMN IF NOT EXISTS firma_otp_hash     text,
  ADD COLUMN IF NOT EXISTS firma_otp_expira   timestamptz,
  ADD COLUMN IF NOT EXISTS firma_otp_intentos smallint NOT NULL DEFAULT 0;

-- Segunda parte (migración `seguros_anulacion_firma_tipo_y_envios`, aplicada el mismo día, tras la
-- revisión del PR #3375): `seguros.firma` solo admitía 'presupuesto' y 'carta_mediador', así que
-- TODA firma de anulación moría en el CHECK. Y un tope de códigos por anulación y día: pedir otro
-- código reinicia los 5 intentos, y sin tope acumulado eso eran ~7.200 pruebas al día.
ALTER TABLE seguros.firma DROP CONSTRAINT firma_documento_tipo_check;
ALTER TABLE seguros.firma ADD CONSTRAINT firma_documento_tipo_check CHECK (documento_tipo IN ('presupuesto', 'carta_mediador', 'anulacion'));
ALTER TABLE seguros.anulacion
  ADD COLUMN IF NOT EXISTS firma_otp_envios     smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS firma_otp_envios_dia date;
