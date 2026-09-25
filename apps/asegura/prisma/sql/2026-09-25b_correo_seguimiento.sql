-- Seguimiento de TODOS los correos a clientes (25/09/2026, Alberto: «de todos los correos… comprobación
-- de lo máximo posible de los envíos, por si algún cliente reclama»).
--
-- `correo_envio`: una fila por correo que sale, con el cliente, el tipo y el id de Resend (la llave que
-- casa los eventos del webhook). El destino va CIFRADO como el resto de datos personales de la cartera.
-- `correo_evento`: cada evento que Resend nos manda (enviado, entregado, retrasado, abierto, clic, rebote,
-- queja, fallo, suprimido) tal cual llega, con su hora. Es la PRUEBA: nunca se actualiza ni se borra.
-- La llave de idempotencia es `svix_id` (Resend reintenta; un reintento no duplica).
CREATE TABLE IF NOT EXISTS seguros.correo_envio (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id      uuid REFERENCES seguros.clientes (id),
  tipo            text NOT NULL,
  asunto          text NOT NULL,
  destino_cifrado text NOT NULL,
  resend_id       text UNIQUE,
  proveedor       text NOT NULL,
  estado          text NOT NULL DEFAULT 'enviado',
  error           text,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correo_envio_proveedor CHECK (proveedor IN ('resend_api', 'smtp')),
  CONSTRAINT correo_envio_estado CHECK (estado IN ('enviado', 'fallido'))
);
CREATE INDEX IF NOT EXISTS idx_correo_envio_cliente ON seguros.correo_envio (cliente_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS seguros.correo_evento (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id     text NOT NULL UNIQUE,
  resend_id   text NOT NULL,
  tipo        text NOT NULL,
  ocurrido_en timestamptz NOT NULL,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  recibido_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_correo_evento_resend ON seguros.correo_evento (resend_id, ocurrido_en);

ALTER TABLE seguros.correo_envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.correo_evento ENABLE ROW LEVEL SECURITY;
-- Los privilegios por defecto del schema se las darían al CRM de Manuel.
REVOKE ALL ON seguros.correo_envio FROM crm_seguros;
REVOKE ALL ON seguros.correo_evento FROM crm_seguros;
REVOKE ALL ON seguros.correo_envio FROM prisma_seguros;
REVOKE ALL ON seguros.correo_evento FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.correo_envio TO prisma_seguros;
GRANT UPDATE (resend_id, estado, error) ON seguros.correo_envio TO prisma_seguros;
-- La prueba no se toca: solo leer e insertar.
GRANT SELECT, INSERT ON seguros.correo_evento TO prisma_seguros;
