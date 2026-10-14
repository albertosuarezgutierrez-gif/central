-- Campaña «presentación de la app» a los LEADS antiguos (14/10/2026). Aditivo. NO APLICADO todavía.
--
-- Por qué NO reutiliza `recaptacion_envios`: aquella cola decide cooldown y DESCARTE por silencio
-- (`descartarLeadsSilenciosos` pone `activo=false` tras 3 correos sin abrir) contando TODO correo de la
-- tabla; meter aquí otra campaña cambiaría en silencio a quién descarta la recaptación. Además exige
-- `poliza_id` y no tiene dónde poner el enlace `?r=`. Lo que SÍ se reutiliza: la baja de correo de la ficha
-- (`clientes.email_opt_out_at`, que ya respetan la recaptación y esta campaña), `correo_envio`/`correo_evento`
-- (los eventos de Resend del webhook de siempre) y el transporte (`enviarEmailResend`).
--
-- ORDEN: el código puede ir antes que este SQL (el cron arranca APAGADO y, sin la tabla, contesta
-- `sin_migracion`; el portal trata la tabla ausente como «enlace que no cuenta»). Aplicar ANTES de
-- encender `ASEGURA_PRESENTACION_APP_ACTIVA=1`.
BEGIN;
SET LOCAL search_path = seguros, public;

-- Una fila por PERSONA y campaña (se reserva ANTES de enviar: el índice único impide el doble envío).
CREATE TABLE IF NOT EXISTS seguros.campana_envio (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- token de la BAJA (en el correo)
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id         uuid NOT NULL REFERENCES seguros.clientes(id),
  campana            text NOT NULL,
  -- Índice ciego del correo al que salió (deduplica entre fichas y entre pasadas). NULL = la ficha no lo tenía.
  email_lookup_hash  text,
  -- 🔒 SHA-256 del `?r=` (`presentacion-app-ref.ts`); el ref en claro solo existe dentro del correo.
  ref_hash           text NOT NULL,
  -- Goteo medido (15/10/2026): cada día con envíos es un LOTE numerado (1, 2, 3…) con su fecha (Madrid),
  -- y cada envío lleva la VARIANTE A/B del texto que recibió, para comparar día a día y mensaje a mensaje.
  lote               integer NOT NULL,
  lote_fecha         date NOT NULL,
  variante           text NOT NULL,
  estado             text NOT NULL DEFAULT 'reservado',
  resend_message_id  text,
  error              text,
  creado_por         text NOT NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  -- Primera visita al portal con ese `?r=` (la escribe el portal). NULL = no ha entrado (o sin JS).
  visita_en          timestamptz,
  baja_en            timestamptz,
  CONSTRAINT campana_envio_campana CHECK (campana ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT campana_envio_estado CHECK (estado IN ('reservado', 'enviado', 'fallido')),
  CONSTRAINT campana_envio_lote CHECK (lote >= 1),
  CONSTRAINT campana_envio_variante CHECK (variante ~ '^[A-Z]$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campana_envio_cliente ON seguros.campana_envio (campana, cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campana_envio_email ON seguros.campana_envio (campana, email_lookup_hash)
  WHERE email_lookup_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_campana_envio_ref ON seguros.campana_envio (ref_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_campana_envio_resend ON seguros.campana_envio (resend_message_id)
  WHERE resend_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campana_envio_dia ON seguros.campana_envio (correduria_id, campana, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_campana_envio_lote ON seguros.campana_envio (correduria_id, campana, lote);

-- El ORIGEN del alta en el portal: UNA fila por identidad, escrita al crear la identidad si el navegador
-- traía la cookie del `?r=`. Es la atribución «este registro vino de este correo de esta campaña».
CREATE TABLE IF NOT EXISTS seguros.portal_alta_origen (
  identidad_id   uuid PRIMARY KEY REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  campana        text NOT NULL,
  envio_id       uuid NOT NULL REFERENCES seguros.campana_envio(id),
  registrado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_alta_origen_envio ON seguros.portal_alta_origen (envio_id);

-- El portal (`prisma_asegura_portal`) NO tiene BYPASSRLS: igual que `portal_invitacion_enlace`, sin RLS
-- y con privilegios mínimos por COLUMNA. Nadie más (API de Supabase, CRM de Manuel) las ve.
ALTER TABLE seguros.campana_envio DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_alta_origen DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.campana_envio FROM crm_seguros;
REVOKE ALL ON seguros.portal_alta_origen FROM crm_seguros;
REVOKE ALL ON seguros.campana_envio FROM PUBLIC, anon, authenticated, prisma_seguros, prisma_asegura_portal;
REVOKE ALL ON seguros.portal_alta_origen FROM PUBLIC, anon, authenticated, prisma_seguros, prisma_asegura_portal;

-- asegura: reserva, envía, anota el resultado y la baja. Sin DELETE: el registro es la prueba.
GRANT SELECT, INSERT ON seguros.campana_envio TO prisma_seguros;
GRANT UPDATE (estado, resend_message_id, error, baja_en) ON seguros.campana_envio TO prisma_seguros;
GRANT SELECT ON seguros.portal_alta_origen TO prisma_seguros;

-- portal: resuelve el `?r=` por su hash, sella la primera visita y anota el origen del alta.
GRANT SELECT (id, campana, ref_hash, visita_en) ON seguros.campana_envio TO prisma_asegura_portal;
GRANT UPDATE (visita_en) ON seguros.campana_envio TO prisma_asegura_portal;
GRANT SELECT, INSERT ON seguros.portal_alta_origen TO prisma_asegura_portal;

COMMIT;

-- Marcha atrás (antes, apagar el cron y revertir el código):
--   DROP TABLE IF EXISTS seguros.portal_alta_origen; DROP TABLE IF EXISTS seguros.campana_envio;
