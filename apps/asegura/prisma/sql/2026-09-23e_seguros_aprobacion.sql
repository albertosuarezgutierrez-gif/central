-- 2026-09-23 — Cola única de aprobaciones (Fase 2 de ASegura OS, pieza 2-c).
--
-- Lo que el sistema PROPONE hacer y solo se hace con el OK de Alberto (política en
-- `@central/module-seguros` → `POLITICA`). Primer productor: el recibo devuelto, que propone un
-- correo al cliente. `clave` UNIQUE: la misma propuesta vista dos veces es UNA.
--
-- Estados: pendiente → enviando → ejecutada | fallida; pendiente → rechazada | caducada.
-- `enviando` es el reclamo atómico ANTES de mandar: un doble clic no manda dos correos, y si el
-- proceso muere a mitad la fila queda en `enviando` (no se reenvía sola: no se sabe si salió).
--
-- ADITIVA. Reversible: DROP TABLE seguros.aprobacion.

CREATE TABLE IF NOT EXISTS seguros.aprobacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  correduria_id uuid NOT NULL REFERENCES seguros.corredurias(id),
  accion        text NOT NULL CHECK (accion IN ('enviar_correo_cliente')),
  origen        text NOT NULL,
  clave         text NOT NULL UNIQUE,
  cliente_id    uuid NOT NULL,
  poliza_id     uuid,
  evento_id     uuid,
  -- Asunto y texto propuestos (y los que se mandaron, si Alberto los retocó). Sin el destinatario:
  -- la dirección se lee de la ficha al enviar, nunca se guarda aquí.
  propuesta     jsonb NOT NULL,
  urgente       boolean NOT NULL DEFAULT false,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'enviando', 'ejecutada', 'rechazada', 'caducada', 'fallida')),
  caduca_at     timestamptz NOT NULL,
  decidida_at   timestamptz,
  decidida_por  text,
  resultado     text,
  CONSTRAINT aprobacion_decision_coherente CHECK (
    (estado = 'pendiente' AND decidida_at IS NULL) OR (estado <> 'pendiente' AND decidida_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_aprobacion_pendiente ON seguros.aprobacion (correduria_id, estado, created_at DESC);

ALTER TABLE seguros.aprobacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seguros.aprobacion FROM crm_seguros;
REVOKE ALL ON seguros.aprobacion FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON seguros.aprobacion FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.aprobacion TO prisma_seguros;
