-- 2026-09-24 — Formación continua IDD (Directiva (UE) 2016/97 art. 10.2: ≥15 h/año por persona que
-- distribuye). Un registro por curso terminado; la regla (mínimo, estados) vive en
-- `@central/module-seguros` (formacion.ts). `documento_id` enlaza el certificado si se ha subido.
--
-- ADITIVA. Reversible: DROP TABLE seguros.formacion.

CREATE TABLE IF NOT EXISTS seguros.formacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  persona        text NOT NULL CHECK (length(btrim(persona)) BETWEEN 1 AND 120),
  curso          text NOT NULL CHECK (length(btrim(curso)) BETWEEN 1 AND 200),
  entidad        text,
  fecha          date NOT NULL CHECK (fecha >= date '2000-01-01'),
  horas          numeric(6,2) NOT NULL CHECK (horas > 0 AND horas <= 200),
  documento_id   uuid REFERENCES seguros.documentos(id) ON DELETE SET NULL,
  creada_por     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_formacion_fecha ON seguros.formacion (correduria_id, fecha);

REVOKE ALL ON seguros.formacion FROM crm_seguros;
REVOKE ALL ON seguros.formacion FROM anon, authenticated;
REVOKE ALL ON seguros.formacion FROM prisma_asegura_portal;
REVOKE UPDATE, TRUNCATE ON seguros.formacion FROM prisma_seguros;
GRANT SELECT, INSERT, DELETE ON seguros.formacion TO prisma_seguros;
