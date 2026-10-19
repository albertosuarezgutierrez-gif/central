-- 2026-10-19c_correduria_f2_adjuntos.sql — Adjuntos de la RESPUESTA de un lead en su hilo (spec 2026-10-19 lead →
-- propuesta, F2). SIN APLICAR: lo aplica Alberto. Requiere antes `2026-10-19b_correduria_f1.sql` (correduria_hilo).
--
-- Foto o PDF del DNI, ficha técnica, póliza anterior… que el cliente adjunta al contestar. Decisión de Alberto: NO se
-- leen (ni IA ni OCR) y nunca se reenvían a Telegram; solo se archivan ligados a su ficha. Van CIFRADOS enteros con la
-- clave PII de la cartera (`cifrarJsonEstricto`, AES-256-GCM, sobre `v1:`), también el nombre del fichero (suele
-- llevar el nombre de la persona). Fail-closed: sin `PII_ENCRYPTION_KEY` la app no escribe aquí, y el CHECK impide
-- que entre nada en claro.
--
-- Por qué tabla propia y no `seguros.documentos`: `documentos.contenido` lo leen en claro una veintena de sitios
-- (portal, lector de pólizas con IA, PDF de póliza…); un binario cifrado ahí se serviría o se leería como basura.
-- Sin esta tabla, el puerto contesta `sin_tabla` y plataforma lo dice en Telegram («adjuntos NO guardados»).
-- Idempotente.

CREATE TABLE IF NOT EXISTS seguros.correduria_adjunto (
  id                 bigserial PRIMARY KEY,
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id         uuid NOT NULL REFERENCES seguros.clientes (id),
  oportunidad_id     uuid REFERENCES seguros.oportunidades (id) ON DELETE SET NULL,
  hilo_id            bigint REFERENCES seguros.correduria_hilo (id) ON DELETE SET NULL,
  gmail_message_id   text NOT NULL,
  nombre_cifrado     text NOT NULL CHECK (nombre_cifrado LIKE 'v1:%'),
  mime_type          text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')),
  size_bytes         integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2500000),
  sha256             text NOT NULL,
  contenido_cifrado  text NOT NULL CHECK (contenido_cifrado LIKE 'v1:%'),
  -- Sin leer por nadie hasta que Alberto lo abra (NULL = sin revisar).
  revisado_at        timestamptz,
  revisado_por       text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- El mismo adjunto del mismo correo, una vez (el triaje puede reprocesar).
CREATE UNIQUE INDEX IF NOT EXISTS correduria_adjunto_unico ON seguros.correduria_adjunto (correduria_id, gmail_message_id, sha256);
CREATE INDEX IF NOT EXISTS correduria_adjunto_cliente ON seguros.correduria_adjunto (correduria_id, cliente_id, created_at DESC);

ALTER TABLE seguros.correduria_adjunto ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.correduria_adjunto TO prisma_seguros;
GRANT USAGE, SELECT ON SEQUENCE seguros.correduria_adjunto_id_seq TO prisma_seguros;
REVOKE ALL ON seguros.correduria_adjunto FROM anon, authenticated;

COMMENT ON TABLE seguros.correduria_adjunto IS
  'Adjuntos de la respuesta de un lead en su hilo (19/10/2026, F2). Cifrados enteros (v1:), sin leer por IA. Ligados a la ficha.';
