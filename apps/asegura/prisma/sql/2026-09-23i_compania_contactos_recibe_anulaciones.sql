-- 2026-09-23 — Qué buzón de cada compañía recibe las anulaciones (ASegura OS, pieza 2-d-3).
--
-- Deducirlo por `area` mandaba bajas a buzones equivocados con los datos reales (medido: C0058
-- «administración» es recibos impagados, C0157 rebota, C0723 es cobros). Lo elige Alberto en la
-- tarjeta de la cola de aprobaciones; al salir el correo se marca ese contacto (y se desmarca el
-- resto de la misma compañía) para que la siguiente anulación lo traiga preseleccionado.
--
-- ADITIVA. Reversible: ALTER TABLE seguros.compania_contactos DROP COLUMN recibe_anulaciones.

ALTER TABLE seguros.compania_contactos
  ADD COLUMN IF NOT EXISTS recibe_anulaciones boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN seguros.compania_contactos.recibe_anulaciones IS
  'Buzón al que se mandó la última anulación aprobada de esta compañía; preselección, nunca envío automático.';
