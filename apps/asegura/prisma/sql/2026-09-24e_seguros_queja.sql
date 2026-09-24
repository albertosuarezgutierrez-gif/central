-- 2026-09-24 — Registro de quejas y reclamaciones del Servicio de Atención al Cliente (SAC).
--
-- El portal y la web publican que el SAC contesta en un mes (`CANALES_RECLAMACION`). Hasta hoy no
-- había dónde anotar una queja: la que llegaba por correo vencía sin que nada la mirase. Esta tabla
-- es ese reloj. La regla (plazo, estados, informe anual) vive en `@central/module-seguros` (queja.ts).
--
-- `detalle` y `respuesta` van CIFRADOS (encryptField): cuentan lo que le pasó a una persona concreta
-- y a menudo traen datos de salud o de un siniestro.
--
-- ADITIVA. Reversible: DROP TABLE seguros.queja.

CREATE TABLE IF NOT EXISTS seguros.queja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id     uuid REFERENCES seguros.clientes(id),
  poliza_id      uuid REFERENCES seguros.polizas(id),
  reclamante     text NOT NULL,
  canal          text NOT NULL CHECK (canal IN ('correo', 'telefono', 'presencial', 'carta', 'portal')),
  motivo         text NOT NULL CHECK (motivo IN ('siniestro', 'cobro_recibo', 'anulacion', 'informacion', 'atencion', 'datos_personales', 'otro')),
  detalle        text NOT NULL,
  recibida_el    date NOT NULL,
  plazo_el       date NOT NULL,
  estado         text NOT NULL DEFAULT 'recibida'
                 CHECK (estado IN ('recibida', 'en_tramite', 'resuelta_favorable', 'resuelta_parcial', 'resuelta_desfavorable', 'desistida')),
  respuesta      text,
  resuelta_el    date,
  creada_por     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queja_plazo_tras_recepcion CHECK (plazo_el > recibida_el),
  -- Resuelta = con la respuesta que se dio y la fecha. Desistida = con fecha; la respuesta es opcional.
  CONSTRAINT queja_resuelta_con_respuesta CHECK (
    estado NOT IN ('resuelta_favorable', 'resuelta_parcial', 'resuelta_desfavorable')
    OR (respuesta IS NOT NULL AND resuelta_el IS NOT NULL)),
  CONSTRAINT queja_cerrada_con_fecha CHECK (estado <> 'desistida' OR resuelta_el IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_queja_abiertas
  ON seguros.queja (correduria_id, plazo_el)
  WHERE estado IN ('recibida', 'en_tramite');
CREATE INDEX IF NOT EXISTS idx_queja_cliente ON seguros.queja (cliente_id) WHERE cliente_id IS NOT NULL;

REVOKE ALL ON seguros.queja FROM crm_seguros;
REVOKE ALL ON seguros.queja FROM anon, authenticated;
REVOKE ALL ON seguros.queja FROM prisma_asegura_portal;
REVOKE DELETE, TRUNCATE ON seguros.queja FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.queja TO prisma_seguros;
