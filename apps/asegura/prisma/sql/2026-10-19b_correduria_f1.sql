-- 2026-10-19b_correduria_f1.sql — Lead por correo → petición de datos EN EL HILO (spec 2026-10-19 lead → propuesta, F1).
--
-- `seguros.correduria_hilo`: ata el Message-ID RAÍZ del correo de un lead a su(s) oportunidad(es) (hueco H3: hoy la
-- respuesta se casa con «algún lead», no con SU oportunidad). La escribe asegura al enviar la petición de datos
-- (`lib/correo-lead.ts`, `POST /api/operador/correo/lead`); la leerá la F2 para casar la respuesta del cliente.
-- Sin el email en claro: `email_cliente_ciego` es el índice ciego (`computeEmailLookupHash`).
-- `estado_datos`: sin_pedir → pedida → incompleta → lista_para_tarificar → tarificando → tarificada | fallo (§1.4).
--
-- El PENDIENTE de Telegram (`correduria_pendiente_tg`, §5.2) NO vive aquí: solo lo leen y escriben el triaje y el
-- webhook de Telegram de plataforma (como `mensajes_pendientes_tg` y `correduria_bots_propuesta`), y plataforma no
-- entra en el schema `seguros`. Va en `apps/plataforma/prisma/sql/2026-10-19b_correduria_pendiente_tg.sql`.
--
-- Orden: el código va ANTES que el SQL y sin la tabla el envío sale igual (`hilo: 'sin_tabla'`). Idempotente.

CREATE TABLE IF NOT EXISTS seguros.correduria_hilo (
  id                          bigserial PRIMARY KEY,
  correduria_id               uuid NOT NULL REFERENCES seguros.corredurias (id),
  oportunidad_id              uuid REFERENCES seguros.oportunidades (id) ON DELETE SET NULL,
  cliente_id                  uuid NOT NULL REFERENCES seguros.clientes (id),
  message_id_raiz             text NOT NULL CHECK (message_id_raiz ~ '^<[^<>[:space:]]+>$'),
  -- Los nuestros y los suyos (In-Reply-To/References), para casar una respuesta con este hilo y no con otro.
  message_ids                 text[] NOT NULL DEFAULT '{}',
  email_cliente_ciego         text,
  estado_datos                text NOT NULL DEFAULT 'sin_pedir' CHECK (estado_datos IN
                                ('sin_pedir', 'pedida', 'incompleta', 'lista_para_tarificar', 'tarificando', 'tarificada', 'fallo')),
  ultimo_contacto_cliente_at  timestamptz,
  ultima_peticion_at          timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Un hilo por (cliente, raíz, oportunidad). El `cliente_id` va en la clave (revisión 19/10/2026): la raíz sale de
-- `References[0]` del correo, que escribe el remitente, y sin él dos clientes con la misma raíz fundirían sus hilos.
-- `oportunidad_id` NULL (lead sin oportunidad) cuenta como un valor más.
CREATE UNIQUE INDEX IF NOT EXISTS correduria_hilo_unico
  ON seguros.correduria_hilo (correduria_id, cliente_id, message_id_raiz, (coalesce(oportunidad_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX IF NOT EXISTS correduria_hilo_ids ON seguros.correduria_hilo USING gin (message_ids);
CREATE INDEX IF NOT EXISTS correduria_hilo_cliente ON seguros.correduria_hilo (correduria_id, cliente_id);

ALTER TABLE seguros.correduria_hilo ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON seguros.correduria_hilo TO prisma_seguros;
GRANT USAGE, SELECT ON SEQUENCE seguros.correduria_hilo_id_seq TO prisma_seguros;

COMMENT ON TABLE seguros.correduria_hilo IS
  'Hilo de correo de un lead ↔ su oportunidad (19/10/2026). Sin email en claro (índice ciego). Lo escribe asegura al responder en el hilo.';
