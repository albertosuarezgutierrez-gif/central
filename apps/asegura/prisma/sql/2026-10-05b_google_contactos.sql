-- Sincronización CRM ↔ Google Contacts (05/10/2026, decisión de Alberto).
--
-- El CRM es la FUENTE DE VERDAD: un cron horario (`/api/cron/google-contactos`) empuja la cartera
-- en vigor y los leads de Vencimientos (la MISMA selección que el .vcf del móvil) al grupo
-- «Grupo ASegura» de la cuenta de Google de Alberto. Solo se tocan contactos de ese grupo.
-- Lógica pura y reglas: `packages/module-seguros/src/google-contactos.ts`.
--
--   · `google_contactos_conexion`: UNA por correduría. El refresh token va CIFRADO con
--     `encryptField` (PII_ENCRYPTION_KEY) y el CHECK lo exige (`v1:`): un token en claro no entra
--     ni por error. Nunca en una env ni en un log.
--   · `google_contactos_vinculo`: ficha ↔ contacto de Google (`resourceName`), con el hash de lo
--     último ENVIADO: así se distingue «cambió el CRM» de «lo cambiaron en Google».
--   · `google_contactos_revision`: la cola. Lo que se editó en Google sobre un campo gestionado
--     (el CRM lo vuelve a pisar, pero el valor de Google se guarda aquí, CIFRADO), los borrados y
--     sacados del grupo a mano, los teléfonos ambiguos y los contactos NUEVOS del grupo
--     (propuesta de lead: nunca un alta automática). `huella` hace idempotente la detección horaria.
--
-- 🚪 Permisos: solo `prisma_seguros` (el puerto de asegura). Ni el portal del cliente, ni la
-- ingesta de Manuel (`crm_seguros`, que recibe DML en `seguros` por privilegios por defecto: se le
-- QUITA aquí), ni `anon`/`authenticated`. RLS activada sin políticas, como las hermanas.
--
-- 🚨 GATE DDL: no aplicar sin PR-review + segundo par de ojos. Sin estas tablas el cron responde
-- error `esquema` (500) y no escribe nada en Google.

CREATE TABLE IF NOT EXISTS seguros.google_contactos_conexion (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id            uuid NOT NULL UNIQUE REFERENCES seguros.corredurias (id),
  cuenta_google            text,
  refresh_token_cifrado    text NOT NULL CHECK (refresh_token_cifrado LIKE 'v1:%'),
  scopes                   text[] NOT NULL DEFAULT '{}',
  grupo_resource_name      text,
  sync_token               text,
  estado                   text NOT NULL DEFAULT 'conectada'
                             CHECK (estado IN ('conectada', 'revocada', 'error')),
  ultimo_error             text,
  conectado_por            text,
  conectado_en             timestamptz NOT NULL DEFAULT now(),
  ultima_sync_en           timestamptz,
  ultima_sync_completa_en  timestamptz,
  actualizado_en           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seguros.google_contactos_vinculo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id      uuid NOT NULL REFERENCES seguros.clientes (id) ON DELETE CASCADE,
  resource_name   text NOT NULL,
  etag            text,
  hash_enviado    text NOT NULL,
  origen          text NOT NULL CHECK (origen IN ('creado', 'vinculado_id', 'vinculado_telefono', 'fusion')),
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'fuera_del_grupo')),
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_contactos_vinculo_cliente UNIQUE (correduria_id, cliente_id),
  CONSTRAINT google_contactos_vinculo_recurso UNIQUE (correduria_id, resource_name)
);

CREATE TABLE IF NOT EXISTS seguros.google_contactos_revision (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias (id),
  -- SET NULL y no CASCADE: la constancia de lo que pasó en Google no se borra con la ficha.
  cliente_id         uuid REFERENCES seguros.clientes (id) ON DELETE SET NULL,
  resource_name      text NOT NULL,
  tipo               text NOT NULL CHECK (tipo IN ('cambio_en_google', 'borrado_en_google', 'sacado_del_grupo', 'propuesta_lead', 'duplicado_ambiguo')),
  campos             text[] NOT NULL DEFAULT '{}',
  propuesta_cifrada  text CHECK (propuesta_cifrada IS NULL OR propuesta_cifrada LIKE 'v1:%'),
  huella             text NOT NULL,
  estado             text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'descartada')),
  -- El BOTÓN que la cerró (`efectoResolucion` de module-seguros). Ninguno toca el vínculo ni Google:
  -- «mantener_crm» sobre un contacto sacado del grupo solo cierra, no lo recrea.
  resolucion         text CHECK (resolucion IN ('aceptar_lead', 'descartar', 'mantener_crm')),
  resuelto_por       text,
  resuelto_en        timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_contactos_revision_huella UNIQUE (correduria_id, huella),
  -- Pendiente ⇔ sin resolver; resuelta ⇔ con botón, quién y cuándo.
  CONSTRAINT google_contactos_revision_resuelta CHECK (
    (estado = 'pendiente') = (resolucion IS NULL AND resuelto_por IS NULL AND resuelto_en IS NULL)
    AND (estado = 'pendiente' OR (resolucion IS NOT NULL AND resuelto_por IS NOT NULL AND resuelto_en IS NOT NULL))
  )
);
CREATE INDEX IF NOT EXISTS google_contactos_revision_pendiente
  ON seguros.google_contactos_revision (correduria_id, creado_en DESC) WHERE estado = 'pendiente';

ALTER TABLE seguros.google_contactos_conexion ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.google_contactos_vinculo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.google_contactos_revision ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seguros.google_contactos_conexion FROM PUBLIC, anon, authenticated, crm_seguros;
REVOKE ALL ON seguros.google_contactos_vinculo  FROM PUBLIC, anon, authenticated, crm_seguros;
REVOKE ALL ON seguros.google_contactos_revision FROM PUBLIC, anon, authenticated, crm_seguros;

GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.google_contactos_conexion TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.google_contactos_vinculo  TO prisma_seguros;
-- La cola se lee, se inserta y se RESUELVE; no se borra (es la constancia). `cliente_id` se
-- actualiza solo al «aceptar como lead» (la propuesta queda enlazada a la ficha que se creó).
GRANT SELECT, INSERT ON seguros.google_contactos_revision TO prisma_seguros;
GRANT UPDATE (estado, resolucion, resuelto_por, resuelto_en, cliente_id) ON seguros.google_contactos_revision TO prisma_seguros;

COMMENT ON TABLE seguros.google_contactos_conexion IS
  'Conexión OAuth con Google Contacts (una por correduría). refresh_token_cifrado con encryptField; nunca en claro.';
COMMENT ON TABLE seguros.google_contactos_vinculo IS
  'Ficha del CRM ↔ contacto de Google (resourceName) con el hash de lo último enviado. Solo contactos del grupo «Grupo ASegura».';
COMMENT ON TABLE seguros.google_contactos_revision IS
  'Cola de revisión de la sincronización con Google: cambios hechos en Google (CRM gana), borrados, ambiguos y propuestas de lead.';
