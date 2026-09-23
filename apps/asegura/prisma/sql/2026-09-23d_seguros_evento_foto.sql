-- 2026-09-23 — Eventos de cartera + foto (Fase 2 de ASegura OS, pieza 2-a).
--
-- La ingesta de CIMA vive FUERA de central, así que los eventos no se emiten en el origen: se
-- DEDUCEN comparando la foto de la cartera viva con la anterior (`detectarCambios` de
-- `@central/module-seguros`, puro y con test). El detector lo lanza plataforma después de cada
-- pull de CIMA por `POST /api/operador/eventos/detectar`.
--
--   · `evento`: lo que pasó (baja, anula al vencimiento, recibo devuelto, siniestro nuevo…), con
--     `clave` UNIQUE para que la misma transición vista dos veces sea UN evento. Sin datos
--     personales en `datos`: estados, fechas y si hay sustitución. Las bajas y desapariciones sin
--     sustitución son «pérdidas sin explicar» y esperan a que una persona las revise (`estado`).
--   · `cartera_foto`: la última foto (una fila por correduría). Sin foto previa, la primera pasada
--     solo ancla — no emite «110 pólizas nuevas».
--
-- ADITIVA. Reversible: DROP TABLE seguros.evento, seguros.cartera_foto.

CREATE TABLE IF NOT EXISTS seguros.evento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  correduria_id uuid NOT NULL REFERENCES seguros.corredurias(id),
  tipo          text NOT NULL,
  entidad       text NOT NULL CHECK (entidad IN ('poliza', 'recibo', 'siniestro')),
  entidad_id    uuid NOT NULL,
  cliente_id    uuid,
  datos         jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave         text NOT NULL UNIQUE,
  -- Revisión humana de las pérdidas. `resolucion`: 'perdida' (con `motivo`, la lista de
  -- MOTIVOS_PERDIDA) o 'no_es_perdida'. Sin texto libre a propósito.
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'revisado')),
  resolucion    text CHECK (resolucion IN ('perdida', 'no_es_perdida')),
  motivo        text,
  revisado_at   timestamptz,
  revisado_por  text,
  CONSTRAINT evento_revision_coherente CHECK (
    (estado = 'pendiente' AND resolucion IS NULL AND revisado_at IS NULL)
    OR (estado = 'revisado' AND resolucion IS NOT NULL AND revisado_at IS NOT NULL)
  ),
  CONSTRAINT evento_perdida_con_motivo CHECK (resolucion IS DISTINCT FROM 'perdida' OR motivo IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_evento_estado ON seguros.evento (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evento_cliente ON seguros.evento (cliente_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seguros.cartera_foto (
  correduria_id uuid PRIMARY KEY REFERENCES seguros.corredurias(id),
  foto          jsonb NOT NULL,
  tomada_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seguros.evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.cartera_foto ENABLE ROW LEVEL SECURITY;

-- El CRM de Manuel no lee ni escribe esto; asegura lee, inserta y actualiza (revisión), no borra.
REVOKE ALL ON seguros.evento, seguros.cartera_foto FROM crm_seguros;
REVOKE ALL ON seguros.evento, seguros.cartera_foto FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON seguros.evento FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.evento TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.cartera_foto TO prisma_seguros;
