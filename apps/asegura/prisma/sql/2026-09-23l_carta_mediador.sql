-- 2026-09-23 — Carta de nombramiento de mediador (presupuesto, «salida B», PR 6).
--
-- pendiente (pidió el código) → firmada → enviada (la manda Alberto) → aceptada | rechazada;
-- desistida desde cualquier abierta. Reglas en `@central/module-seguros` (`carta-mediador.ts`).
-- Una carta ABIERTA por póliza (índice parcial). Sin firma no hay «enviada» (CHECK).
--
-- ADITIVA. Reversible: DROP TABLE seguros.carta_mediador.

CREATE TABLE IF NOT EXISTS seguros.carta_mediador (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id      uuid NOT NULL,
  poliza_id       uuid NOT NULL REFERENCES seguros.polizas(id),
  presupuesto_id  uuid REFERENCES seguros.presupuesto(id),
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'firmada', 'enviada', 'aceptada', 'rechazada', 'desistida')),
  carta_texto     text,
  firma_id        uuid,
  firmada_at      timestamptz,
  enviada_at      timestamptz,
  aceptada_at     timestamptz,
  rechazada_at    timestamptz,
  rechazo_motivo  text CHECK (rechazo_motivo IS NULL OR length(rechazo_motivo) <= 500),
  desistida_at    timestamptz,
  firma_otp_hash       text,
  firma_otp_expira     timestamptz,
  firma_otp_intentos   int NOT NULL DEFAULT 0,
  firma_otp_envios     int NOT NULL DEFAULT 0,
  firma_otp_envios_dia date,
  -- Cada estado con su sello; lo firmado lleva su texto y su firma; no se envía sin firmar.
  CONSTRAINT carta_mediador_coherente CHECK (
    (firmada_at IS NULL OR (carta_texto IS NOT NULL AND firma_id IS NOT NULL))
    AND (estado NOT IN ('firmada', 'enviada', 'aceptada', 'rechazada') OR firmada_at IS NOT NULL)
    AND (estado NOT IN ('enviada', 'aceptada', 'rechazada') OR enviada_at IS NOT NULL)
    AND (estado <> 'aceptada' OR aceptada_at IS NOT NULL)
    AND (estado <> 'rechazada' OR (rechazada_at IS NOT NULL AND rechazo_motivo IS NOT NULL))
    AND (estado <> 'desistida' OR desistida_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_carta_mediador_abierta_por_poliza
  ON seguros.carta_mediador (poliza_id) WHERE estado IN ('pendiente', 'firmada', 'enviada');
CREATE INDEX IF NOT EXISTS idx_carta_mediador_cliente ON seguros.carta_mediador (correduria_id, cliente_id);

ALTER TABLE seguros.carta_mediador ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seguros.carta_mediador FROM crm_seguros;
REVOKE ALL ON seguros.carta_mediador FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON seguros.carta_mediador FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.carta_mediador TO prisma_seguros;
