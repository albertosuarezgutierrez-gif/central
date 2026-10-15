-- 2026-10-15 — Consultas a compañías por correo desde la oportunidad (fase 1).
-- Spec: docs/superpowers/specs/2026-10-15-correduria-consultas-companias-design.md
--
-- Alberto consulta a comerciales/técnicos de compañías (p. ej. una RC que Codeoscopic no tarifica): la IA redacta
-- un borrador POR COMPAÑÍA, él lo edita y lo aprueba uno a uno, y asegura lo envía por el SMTP de Gmail como
-- hola@grupoasegura.es. Nada sale solo.
--
-- 🚨 Identidad: `cuerpo` guarda los marcadores {{NOMBRE_TOMADOR}}/{{DOC_TOMADOR}}, NUNCA el DNI en claro. Asegura los
-- sustituye en su servidor justo antes de enviar. `identidad_incluida` = el correo enviado lleva nombre y documento
-- (trazabilidad RGPD; base: medidas precontractuales a petición del cliente).
--
-- 🚨 NULL ≠ vacío:
--   · `compania_contactos.ramos` NULL = «sin clasificar» (NUNCA «todos»); '{}' = revisado y sin ramos.
--   · `responder_antes` NULL = sin fecha (sin vencimiento conocido no se inventa).
--   · `enviada_at`/`respondida_at`/`recordatorio_avisado_at` NULL = no ha ocurrido.
--
-- Modelo «paquete» (decisión 15/10/2026): una consulta puede abarcar VARIAS oportunidades del MISMO cliente (2 coches
-- + 1 moto a una compañía pidiendo descuento adicional; se usa en fase 4). Por eso la consulta lleva `cliente_id` y
-- `tipo`, y las oportunidades van en `consulta_compania_oportunidad` (fase 1 siempre inserta UNA fila).
--
-- Multi-tenant: las tablas nuevas llevan `correduria_id` (la de oportunidades lo hereda de su consulta por FK). El
-- rol que las lee tiene BYPASSRLS: el aislamiento lo da el código (`correduriaUnica()` + filtro en cada consulta).
--
-- ADITIVA e IDEMPOTENTE (se puede correr dos veces). Código ANTES que el SQL: sin estas tablas el puerto responde
-- 503 `sin_migracion`; sin la columna `ramos`, los contactos salen con `ramos: null` (sin clasificar).
--
-- Reversible:
--   DROP TABLE seguros.consulta_compania_mensaje, seguros.consulta_compania_oportunidad, seguros.consulta_compania;
--   DROP TYPE seguros.consulta_compania_estado, seguros.consulta_compania_tipo;
--   ALTER TABLE seguros.compania_contactos DROP COLUMN ramos;
--
-- PENDIENTE DE APLICAR (preview → prod, con OK de Alberto).

-- ─── Contactos: qué ramos lleva cada uno ─────────────────────────────────────
-- NULLABLE y sin DEFAULT a propósito (tres estados). No se declara en el modelo Prisma `CompaniaContacto`: Prisma no
-- admite listas NULL, y `GET /api/operador/companias` hace `include: { contactos }` (se caería si el código saliera
-- antes que este SQL). Se lee y se escribe por SQL crudo en `lib/consulta-compania-bd.ts`.
ALTER TABLE seguros.compania_contactos ADD COLUMN IF NOT EXISTS ramos seguros.tipo_seguro[];
COMMENT ON COLUMN seguros.compania_contactos.ramos IS
  'Ramos que lleva el contacto. NULL = sin clasificar (nunca «todos»); {} = revisado y sin ramos. Solo ORDENA/etiqueta el panel; nunca premarca.';

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE seguros.consulta_compania_estado AS ENUM
    ('borrador', 'enviada', 'respondida', 'pide_info', 'rechazada', 'sin_respuesta', 'descartada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE seguros.consulta_compania_tipo AS ENUM ('consulta', 'paquete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Una fila por compañía consultada ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.consulta_compania (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id            uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id               uuid NOT NULL REFERENCES seguros.clientes (id),
  tipo                     seguros.consulta_compania_tipo NOT NULL DEFAULT 'consulta',
  compania_codigo_dgs      varchar(16) NOT NULL REFERENCES seguros.companias_dgs (codigo_dgs),
  -- `compania_contactos.id`: ≥1 y todos de `compania_codigo_dgs` (regla `validarDestinatarios` de
  -- @central/module-seguros, aplicada en el puerto). Sin FK sobre el array: la valida el código.
  destinatarios            uuid[] NOT NULL CHECK (cardinality(destinatarios) >= 1),
  asunto                   text NOT NULL CHECK (char_length(asunto) <= 300),
  -- Con marcadores {{NOMBRE_TOMADOR}}/{{DOC_TOMADOR}}; nunca el DNI en claro.
  cuerpo                   text NOT NULL CHECK (char_length(cuerpo) <= 20000),
  estado                   seguros.consulta_compania_estado NOT NULL DEFAULT 'borrador',
  codigo_ref               text NOT NULL CHECK (codigo_ref ~ '^ASG-[A-Z0-9]{4}$'),
  gmail_message_id         text,
  gmail_thread_id          text,
  identidad_incluida       boolean NOT NULL,
  competencia_incluida     boolean NOT NULL DEFAULT false,
  responder_antes          date,
  -- [{documentoId, nombre, competencia}] elegidos de la ficha/oportunidad. Lo realmente enviado queda en historial.
  adjuntos                 jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(adjuntos) = 'array'),
  enviada_at               timestamptz,
  respondida_at            timestamptz,
  recordatorio_avisado_at  timestamptz,
  creado_por               text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consulta_compania_codigo_ref_uq UNIQUE (codigo_ref),
  CONSTRAINT consulta_compania_enviada_ck CHECK (estado = 'borrador' OR estado = 'cancelada' OR enviada_at IS NOT NULL)
);
COMMENT ON TABLE seguros.consulta_compania IS
  'Consulta por correo a UNA compañía (fase 1, 15/10/2026). cuerpo con marcadores de identidad, nunca el DNI. identidad_incluida = trazabilidad RGPD.';

CREATE INDEX IF NOT EXISTS consulta_compania_cliente_idx
  ON seguros.consulta_compania (correduria_id, cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consulta_compania_abiertas_idx
  ON seguros.consulta_compania (correduria_id, estado) WHERE estado = 'enviada';
CREATE UNIQUE INDEX IF NOT EXISTS consulta_compania_message_id_uq
  ON seguros.consulta_compania (gmail_message_id) WHERE gmail_message_id IS NOT NULL;

-- ─── Qué oportunidades abarca cada consulta (1 en fase 1; varias en un paquete) ───
CREATE TABLE IF NOT EXISTS seguros.consulta_compania_oportunidad (
  consulta_id      uuid NOT NULL REFERENCES seguros.consulta_compania (id),
  oportunidad_id   uuid NOT NULL REFERENCES seguros.oportunidades (id),
  -- La tarificación de referencia de esa oportunidad en el paquete (NULL = ninguna).
  tarificacion_id  uuid REFERENCES seguros.tarificaciones (id),
  -- NULL = no se sabe / no se ha fijado; nunca 0.
  prima_base       numeric(12, 2) CHECK (prima_base IS NULL OR prima_base >= 0),
  prima_objetivo   numeric(12, 2) CHECK (prima_objetivo IS NULL OR prima_objetivo >= 0),
  -- NULL hasta que la compañía acepta (fase 4, spec §3.2 ter).
  prima_pactada    numeric(12, 2) CHECK (prima_pactada IS NULL OR prima_pactada >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consulta_id, oportunidad_id)
);
COMMENT ON TABLE seguros.consulta_compania_oportunidad IS
  'Oportunidades de una consulta (fase 1: una; paquete: varias del MISMO cliente). primas NULL = no se sabe.';

CREATE INDEX IF NOT EXISTS consulta_compania_oportunidad_op_idx
  ON seguros.consulta_compania_oportunidad (oportunidad_id);

-- ─── Respuestas entrantes (las escribe el triaje en la fase 2) ───────────────
CREATE TABLE IF NOT EXISTS seguros.consulta_compania_mensaje (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  consulta_id    uuid NOT NULL REFERENCES seguros.consulta_compania (id),
  -- Message-ID RFC del correo entrante: idempotencia del triaje.
  message_id     text NOT NULL CHECK (message_id <> '' AND char_length(message_id) <= 300),
  de             text,
  fecha          timestamptz,
  resumen        text,
  -- Rutas en storage (`core-storage`).
  adjuntos       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(adjuntos) = 'array'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consulta_compania_mensaje_message_id_uq UNIQUE (message_id)
);
COMMENT ON TABLE seguros.consulta_compania_mensaje IS 'Respuestas de compañías a una consulta (fase 2). message_id único = idempotencia.';

CREATE INDEX IF NOT EXISTS consulta_compania_mensaje_consulta_idx
  ON seguros.consulta_compania_mensaje (consulta_id, created_at);

-- ─── Permisos ────────────────────────────────────────────────────────────────
-- El schema `seguros` tiene default privileges (`prisma_seguros=arwd`, y DML a `crm_seguros`): una tabla nueva NACE
-- con SELECT/INSERT/UPDATE/DELETE aunque el GRANT de abajo sea más corto (ver 2026-10-06c_tarificador_formador_revoke.sql).
-- Por eso se revoca TODO primero y se concede después lo justo:
--   · `crm_seguros` (CRM de Manuel), PUBLIC/anon/authenticated y `prisma_asegura_portal` (el cliente no ve las
--     consultas): nada;
--   · `prisma_seguros`: SELECT/INSERT/UPDATE, SIN DELETE (una consulta se cancela o se descarta, no se borra);
--   · `backup_seguros`: SELECT (copia semanal), si el rol existe.
ALTER TABLE seguros.consulta_compania             ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.consulta_compania_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.consulta_compania_mensaje     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seguros.consulta_compania, seguros.consulta_compania_oportunidad, seguros.consulta_compania_mensaje
  FROM PUBLIC, anon, authenticated, crm_seguros, prisma_seguros;
DO $portal$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_asegura_portal') THEN
    EXECUTE 'REVOKE ALL ON seguros.consulta_compania, seguros.consulta_compania_oportunidad, seguros.consulta_compania_mensaje FROM prisma_asegura_portal';
  END IF;
END
$portal$;

GRANT SELECT, INSERT, UPDATE ON seguros.consulta_compania, seguros.consulta_compania_oportunidad,
                                seguros.consulta_compania_mensaje
  TO prisma_seguros;
DO $backup$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_seguros') THEN
    EXECUTE 'GRANT SELECT ON seguros.consulta_compania, seguros.consulta_compania_oportunidad, seguros.consulta_compania_mensaje TO backup_seguros';
  END IF;
END
$backup$;

-- Verificación tras aplicar (debe salir SOLO prisma_seguros con SELECT/INSERT/UPDATE y backup_seguros con SELECT):
--   SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'seguros' AND table_name LIKE 'consulta_compania%' AND grantee <> 'postgres'
--   GROUP BY 1, 2 ORDER BY 1, 2;
