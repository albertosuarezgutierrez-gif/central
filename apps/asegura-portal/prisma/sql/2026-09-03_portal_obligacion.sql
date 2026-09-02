-- Obligaciones con fecha del portal — v1 del calendario de vencimientos.
-- Spec: docs/superpowers/specs/2026-09-02-asegura-portal-calendario-clientes-design.md
-- Plan: docs/superpowers/plans/2026-09-02-asegura-portal-calendario-v1.md
--
-- Cuelga del BIEN, no de la póliza: `poliza_id` es opcional a propósito para
-- que el mismo motor sirva luego a ITV, carnet o revisión de gas de alguien que
-- no tiene ninguna póliza con la correduría.
--
-- 🚨 Quién escribe y quién lee, que NO es lo mismo:
--   · `prisma_asegura_portal` (el portal, SIN BYPASSRLS) escribe las obligaciones
--     de la identidad que tiene sesión, y las lee para pintarlas.
--   · `prisma_seguros` (el panel del corredor, BYPASSRLS) las LEE todas para
--     mandar el aviso, porque es el único rol que puede leer `cliente_emails`.
--     El portal nunca ve un email: `portal_canal` guarda solo el hash.

CREATE TYPE seguros.portal_obligacion_tipo AS ENUM (
  'poliza', 'itv', 'carnet', 'recibo', 'mantenimiento', 'revision_gas', 'libre'
);

CREATE TABLE seguros.portal_obligacion (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id           uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  bien_id                uuid REFERENCES seguros.portal_bien(id),

  -- La póliza de la CARTERA que la originó. Sin FK a propósito: `polizas` es del
  -- volcado y el rol del portal no puede escribir en ella; una FK ataría el borrado.
  poliza_id              uuid,
  poliza_declarada_id    uuid REFERENCES seguros.portal_poliza_declarada(id) ON DELETE CASCADE,

  tipo                   seguros.portal_obligacion_tipo NOT NULL,
  titulo                 text NOT NULL,

  -- La fecha del hecho. NUNCA se rellena con un valor de cortesía: si no se
  -- sabe, la obligación no se crea. NULL sería «no se sabe», no «no vence».
  fecha_evento           date NOT NULL,
  -- Calculada por `fechaAccionable()` (art. 22 LCS). Se persiste para que el
  -- cron filtre en SQL sin recalcular decenas de miles de filas en memoria.
  fecha_accionable       date NOT NULL,

  procedencia            seguros.portal_procedencia NOT NULL,
  confirmada_at          timestamptz,
  avisada_at             timestamptz,

  creada_at              timestamptz NOT NULL DEFAULT now(),
  actualizada_at         timestamptz NOT NULL DEFAULT now(),

  -- Idempotencia del derivador: una póliza de la cartera produce UNA obligación
  -- por identidad, se recargue la página las veces que se recargue.
  CONSTRAINT portal_obligacion_una_por_poliza UNIQUE (identidad_id, poliza_id)
);

CREATE INDEX portal_obligacion_identidad_idx ON seguros.portal_obligacion (identidad_id);
-- El índice que usa el cron: pendientes de avisar, por fecha accionable.
CREATE INDEX portal_obligacion_pendientes_idx
  ON seguros.portal_obligacion (fecha_accionable)
  WHERE avisada_at IS NULL;

-- El portal: escribe y lee lo suyo.
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.portal_obligacion TO prisma_asegura_portal;
-- El corredor: lee todas para avisar, y sella `avisada_at`.
GRANT SELECT, UPDATE ON seguros.portal_obligacion TO prisma_seguros;
