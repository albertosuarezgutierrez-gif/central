-- 2026-09-23 — Expediente de anulación de póliza (Fase 2 de ASegura OS, pieza 2-d).
--
-- solicitada → firmada → comunicada → confirmada; desistida desde cualquier estado abierto.
-- Reglas en `@central/module-seguros` (`anulacion.ts`): sin firma no se comunica a la compañía.
-- Un expediente ABIERTO por póliza (índice parcial). `confirmada` la pone el detector de cartera
-- cuando CIMA trae la póliza como no vigente.
--
-- ADITIVA. Reversible: DROP TABLE seguros.anulacion.

CREATE TABLE IF NOT EXISTS seguros.anulacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  poliza_id      uuid NOT NULL REFERENCES seguros.polizas(id),
  cliente_id     uuid NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('no_renovacion', 'inmediata', 'sustitucion')),
  solicitada_por text NOT NULL CHECK (solicitada_por IN ('cliente', 'correduria', 'compania')),
  motivo         text NOT NULL CHECK (motivo IN ('precio', 'competidor', 'coberturas', 'venta_del_bien', 'cliente_desiste', 'impago', 'otro')),
  motivo_texto   text CHECK (motivo_texto IS NULL OR length(motivo_texto) <= 500),
  fecha_efecto   date NOT NULL,
  estado         text NOT NULL DEFAULT 'solicitada'
                 CHECK (estado IN ('solicitada', 'firmada', 'comunicada', 'confirmada', 'desistida')),
  creada_por     text NOT NULL,
  -- Cómo consta la firma (hoy: nota del corredor; con la firma del portal, el id de `seguros.firma`).
  firmada_at     timestamptz,
  firma_nota     text,
  firma_id       uuid,
  comunicada_at  timestamptz,
  confirmada_at  timestamptz,
  desistida_at   timestamptz,
  CONSTRAINT anulacion_otro_con_texto CHECK (motivo <> 'otro' OR motivo_texto IS NOT NULL),
  -- Cada estado lleva su marca de tiempo, y no se comunica sin haber firmado.
  CONSTRAINT anulacion_estado_coherente CHECK (
    (estado <> 'firmada' OR firmada_at IS NOT NULL)
    AND (estado <> 'comunicada' OR (firmada_at IS NOT NULL AND comunicada_at IS NOT NULL))
    AND (estado <> 'confirmada' OR confirmada_at IS NOT NULL)
    AND (estado <> 'desistida' OR desistida_at IS NOT NULL)
    AND (comunicada_at IS NULL OR firmada_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_anulacion_abierta_por_poliza
  ON seguros.anulacion (poliza_id) WHERE estado IN ('solicitada', 'firmada', 'comunicada');
CREATE INDEX IF NOT EXISTS idx_anulacion_correduria_estado ON seguros.anulacion (correduria_id, estado);

ALTER TABLE seguros.anulacion ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seguros.anulacion FROM crm_seguros;
REVOKE ALL ON seguros.anulacion FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON seguros.anulacion FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.anulacion TO prisma_seguros;
