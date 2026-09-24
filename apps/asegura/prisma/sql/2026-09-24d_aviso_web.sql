-- «Avísame antes de que venza» de la web pública (grupoasegura.es), 24/09/2026.
--
-- Una fila por suscripción: alguien deja nombre, correo, ramo y fecha de vencimiento en una página
-- de ramo, recibe un correo de confirmación (doble opt-in) y, al confirmar, se le crea la ficha como
-- LEAD y una oportunidad. Después el cron `avisos-web` le escribe a 70 y 45 días del vencimiento.
--
-- Hasta que confirma NO hay ficha (`cliente_id` NULL): un correo sin confirmar puede ser de un
-- tercero que alguien tecleó, y no se mete en la cartera.
--
-- La llave de confirmar se guarda solo como SHA-256. El correo va cifrado (`v1:`) con su índice
-- ciego, igual que en `clientes`.
CREATE TABLE IF NOT EXISTS seguros.aviso_web (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id           uuid NOT NULL REFERENCES seguros.corredurias (id),
  nombre                  text NOT NULL,
  email                   text NOT NULL,
  email_lookup_hash       text NOT NULL,
  ramo                    seguros.tipo_seguro NOT NULL,
  ramo_web                text NOT NULL,
  -- La fecha tal y como la escribió: el ciclo de cada año se calcula a partir de su día y mes.
  vence                   date NOT NULL,
  -- Qué texto de consentimiento aceptó (versión, no el texto): la prueba es versión + fechas.
  consentimiento_version  text NOT NULL,
  token_confirmacion_hash text NOT NULL,
  confirmacion_expira_en  timestamptz NOT NULL,
  confirmado_en           timestamptz,
  -- La llave de baja va en CADA aviso, así que tiene que poder rehacerse: cifrada (`v1:`) para
  -- componer el enlace y en SHA-256 para buscarla al canjear. Solo sirve para darse de baja.
  token_baja              text NOT NULL,
  token_baja_hash         text NOT NULL,
  baja_en                 timestamptz,
  cliente_id              uuid REFERENCES seguros.clientes (id),
  oportunidad_id          uuid REFERENCES seguros.oportunidades (id),
  -- El vencimiento del ciclo para el que ya salió cada aviso (idempotencia de la pasada diaria).
  aviso1_para             date,
  aviso2_para             date,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aviso_web_token_confirmacion_unico UNIQUE (token_confirmacion_hash),
  CONSTRAINT aviso_web_token_baja_unico UNIQUE (token_baja_hash),
  CONSTRAINT aviso_web_hashes_sha256 CHECK (token_confirmacion_hash ~ '^[0-9a-f]{64}$' AND token_baja_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT aviso_web_email_cifrado CHECK (email LIKE 'v1:%' AND token_baja LIKE 'v1:%'),
  CONSTRAINT aviso_web_confirmado_con_ficha CHECK (confirmado_en IS NULL OR cliente_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_aviso_web_email ON seguros.aviso_web (email_lookup_hash, creado_en);
CREATE INDEX IF NOT EXISTS idx_aviso_web_creado ON seguros.aviso_web (creado_en);
CREATE INDEX IF NOT EXISTS idx_aviso_web_activos ON seguros.aviso_web (correduria_id) WHERE confirmado_en IS NOT NULL AND baja_en IS NULL;

-- 🚨 Los privilegios por defecto del schema dan DML a `crm_seguros` (el CRM de Manuel) y lectura a
-- `backup_seguros`. Aquí hay correos de gente que aún no es cliente: se revoca todo y se concede solo
-- lo que usa asegura. El portal no la toca.
REVOKE ALL ON seguros.aviso_web FROM crm_seguros;
REVOKE ALL ON seguros.aviso_web FROM backup_seguros;
REVOKE ALL ON seguros.aviso_web FROM prisma_seguros;
-- DELETE solo para purgar las solicitudes que nunca se confirmaron (lo promete la web).
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.aviso_web TO prisma_seguros;
