-- =============================================================================
-- Volcado de la correduría: ESTRUCTURA (schema `seguros` en la BD compartida)
-- =============================================================================
-- Origen: proyecto Supabase de Manuel Suárez `uijsgeocgdaxkhvwtjqs` (ASEGURA-prod-eu),
-- schema `public`, PostgreSQL 17.6. Destino: `wswbehlcuxqxyinousql`, schema `seguros`.
--
-- 🤖 GENERADO, NO ESCRITO A MANO: todo el DDL de abajo sale de consultas sobre los
--    catálogos del origen (pg_type/pg_enum, pg_attribute, pg_constraint, pg_index)
--    el 01/09/2026. Con 51 tablas y 199 índices, escribirlo a mano era garantía de
--    error silencioso. Si el origen cambia, se regenera; no se parchea a mano.
--
-- Contenido: 42 enums · 51 tablas · 67 constraints (PK/UNIQUE/CHECK) · 199 índices.
--
-- 🚨 LAS CLAVES FORÁNEAS NO ESTÁN AQUÍ, Y NO ES UN OLVIDO: van en
--    `2026-09-01_seguros_volcado_fks.sql`, que se aplica DESPUÉS de los datos.
--    El origen tiene **131 FKs** — no cero, como afirmaba
--    `docs/TRASPASO-CORREDURIA.md` hasta hoy. Crearlas antes de cargar obligaría
--    a un orden topológico que además no existe: hay autorreferencias
--    (`polizas.poliza_padre_id`, `clientes.merged_into_cliente_id`).
--
-- ⚠️ Las funciones del origen (132 en `public`) NO se traen: varias se apoyan en
--    `auth.uid()` de Supabase Auth, que es justo lo que se está quitando. Se
--    revisarán una a una si hacen falta.
--
-- ⚠️ Las columnas de datos personales (dni, telefono, email, direccion,
--    cuenta_bancaria, fecha_nacimiento…) llegan CIFRADAS y seguirán ilegibles
--    hasta que estén las dos claves (cifrado de campo + índice ciego). Los
--    `*_lookup_hash` se copian tal cual, pero sin la clave del índice ciego NO se
--    puede buscar a nadie por email ni DNI: la búsqueda devuelve vacío sin fallar.
--    Por eso el origen no se borra hasta verificar descifrar Y buscar.
--
-- Los datos van en `2026-09-01_seguros_volcado_datos.sql` (dblink, server-side).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS seguros;

-- `vector` (pgvector 0.8.0) ya está en central; `whatsapp_kb_chunks` la necesita.
CREATE EXTENSION IF NOT EXISTS vector;

-- Los enums de las tablas se referencian SIN cualificar (así los emite el origen),
-- así que el search_path tiene que ver `seguros` primero.
SET search_path = seguros, public;

-- =============================================================================
-- 1. ENUMS (42)
-- =============================================================================

CREATE TYPE seguros.bien_documento_tipo_enum AS ENUM ('ficha_tecnica', 'permiso_circulacion', 'titulo_propiedad', 'planos', 'foto', 'seguro_anterior', 'factura_compra', 'otro');
CREATE TYPE seguros.canal_recordatorio AS ENUM ('email', 'whatsapp', 'ambos');
CREATE TYPE seguros.cef_origen AS ENUM ('manual', 'cima');
CREATE TYPE seguros.cima_fichero_estado AS ENUM ('pending', 'persisted', 'confirmed', 'review', 'review_salud', 'deferred', 'error');
CREATE TYPE seguros.codeoscopic_document_tipo AS ENUM ('poliza', 'recibo', 'sepa', 'welcome', 'ipid', 'cond_generales', 'otros');
CREATE TYPE seguros.codeoscopic_participant_rol AS ENUM ('tomador', 'asegurado', 'conductor_habitual', 'beneficiario', 'representante', 'otros');
CREATE TYPE seguros.codeoscopic_price_fase AS ENUM ('cotizacion', 'preemision');
CREATE TYPE seguros.codeoscopic_price_tipo AS ENUM ('estimado', 'definitivo');
CREATE TYPE seguros.codeoscopic_product_form_fase AS ENUM ('preemision', 'emision');
CREATE TYPE seguros.codeoscopic_project_estado AS ENUM ('cotizacion', 'preemision', 'emitida', 'rechazada', 'riesgo_condicionado', 'vencida', 'error');
CREATE TYPE seguros.codeoscopic_webhook_event_type AS ENUM ('emision_ok', 'rechazada', 'vencida', 'error', 'otro');
CREATE TYPE seguros.estado_comercial AS ENUM ('en_negociacion', 'competencia', 'pendiente_cliente', 'ganada', 'perdida');
CREATE TYPE seguros.estado_cotizacion AS ENUM ('pendiente', 'enviada', 'aceptada', 'rechazada', 'expirada', 'emitida');
CREATE TYPE seguros.estado_oferta_automatica AS ENUM ('pendiente', 'aceptada', 'rechazada', 'expirada');
CREATE TYPE seguros.estado_peticion AS ENUM ('nueva', 'cotizando', 'ofertas_listas', 'emitida', 'descartada');
CREATE TYPE seguros.estado_poliza AS ENUM ('activa', 'vencida', 'cancelada', 'en_renovacion', 'en_vigor', 'fin_riesgo', 'recibo_devuelto', 'cambio_clave', 'anula_al_vencimiento', 'competencia');
CREATE TYPE seguros.estado_recordatorio AS ENUM ('programado', 'enviado', 'leido', 'respondido', 'fallido');
CREATE TYPE seguros.estado_siniestro AS ENUM ('abierto', 'en_tramitacion', 'cerrado', 'rechazado');
CREATE TYPE seguros.fraccionamiento AS ENUM ('anual', 'semestral', 'trimestral', 'mensual');
CREATE TYPE seguros.fuente_origen AS ENUM ('venta_directa', 'tarifas_blancas', 'ahorro_seguro', 'recomendacion', 'renovacion', 'otros');
CREATE TYPE seguros.gestion_estado AS ENUM ('pendiente', 'en_curso', 'cerrada');
CREATE TYPE seguros.gestion_prioridad AS ENUM ('alta', 'media', 'baja');
CREATE TYPE seguros.gestion_tipo AS ENUM ('tarea', 'llamada', 'email', 'whatsapp');
CREATE TYPE seguros.interviniente_origen AS ENUM ('manual', 'cima');
CREATE TYPE seguros.interviniente_rol AS ENUM ('propietario', 'conductor_habitual', 'conductor_ocasional', 'contacto', 'beneficiario', 'asegurado');
CREATE TYPE seguros.lead_estado AS ENUM ('nuevo', 'contactado', 'cualificado', 'propuesta', 'ganado', 'perdido');
CREATE TYPE seguros.liquidacion_estado AS ENUM ('liquidada', 'pendiente', 'parcial', 'anulada');
CREATE TYPE seguros.plan_suscripcion AS ENUM ('trial', 'basico', 'profesional', 'enterprise');
CREATE TYPE seguros.poliza_origen AS ENUM ('gestionada_correduria', 'declarada_usuario');
CREATE TYPE seguros.recibo_estado AS ENUM ('cobrado', 'pendiente', 'devuelto', 'anulado', 'emitido');
CREATE TYPE seguros.recibo_origen AS ENUM ('manual', 'cima');
CREATE TYPE seguros.segmento_cliente AS ENUM ('cliente', 'ex_cliente', 'prospecto');
CREATE TYPE seguros.siniestro_gravedad AS ENUM ('leve', 'moderado', 'grave', 'muy_grave');
CREATE TYPE seguros.siniestro_origen AS ENUM ('gestionado_correduria', 'cima');
CREATE TYPE seguros.tipo_bien_enum AS ENUM ('vehiculo', 'vivienda', 'otro', 'local');
CREATE TYPE seguros.tipo_cliente AS ENUM ('cliente', 'lead', 'beneficiario');
CREATE TYPE seguros.tipo_historial_interno AS ENUM ('nota', 'incidencia', 'siniestro', 'gestion', 'contacto');
CREATE TYPE seguros.tipo_persona AS ENUM ('fisica', 'juridica');
CREATE TYPE seguros.tipo_recordatorio AS ENUM ('vencimiento', 'oferta', 'renovacion', 'bienvenida');
CREATE TYPE seguros.tipo_seguro AS ENUM ('auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'otros');
CREATE TYPE seguros.trigger_oferta_automatica AS ENUM ('vencimiento_proximo_30d', 'vencimiento_proximo_15d', 'vencimiento_proximo_7d');
CREATE TYPE seguros.user_role AS ENUM ('admin', 'corredor', 'usuario');

-- =============================================================================
-- 2. TABLAS (51)
-- =============================================================================

CREATE TABLE seguros.bien_documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bien_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  tipo bien_documento_tipo_enum NOT NULL,
  blob_pathname text NOT NULL,
  file_name character varying(255) NOT NULL,
  mime_type character varying(100) NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by_usuario_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.bienes_asegurables (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid NOT NULL,
  tipo tipo_bien_enum NOT NULL,
  nombre character varying(120) NOT NULL,
  datos jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.bot_eval_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  run_label text,
  model_judge text,
  model_under_test text,
  n_casos integer,
  score_medio numeric(5,4),
  pass_rate numeric(5,4),
  metadata jsonb
);

CREATE TABLE seguros.bot_eval_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL,
  caso_id text,
  categoria text,
  score numeric(5,4),
  verdict text,
  rationale text,
  tokens_judge integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.bot_turn_traces (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  correduria_id uuid,
  conversacion_id uuid NOT NULL,
  role character varying(16) NOT NULL,
  resolved_autonomously boolean NOT NULL,
  handoff boolean NOT NULL,
  confidence numeric(4,3) NOT NULL,
  latency_ms integer NOT NULL,
  phone_last4 character varying(4),
  self_check_blocked text
);

CREATE TABLE seguros.channel_inbound_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  channel character varying(30) NOT NULL,
  direction character varying(20) DEFAULT 'inbound'::character varying NOT NULL,
  external_message_id character varying(255),
  event_type character varying(50) NOT NULL,
  message_type character varying(50),
  lead_phone character varying(30),
  lead_name character varying(255),
  message_text text,
  event_timestamp timestamp without time zone NOT NULL,
  received_at timestamp without time zone DEFAULT now() NOT NULL,
  processing_status character varying(30) DEFAULT 'processed'::character varying NOT NULL,
  processing_error text,
  correduria_id uuid,
  cliente_id uuid,
  conversacion_id uuid,
  mensaje_id uuid,
  payload jsonb NOT NULL
);

CREATE TABLE seguros.cima_ficheros (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  nombre_fichero character varying(255) NOT NULL,
  tipo_objeto character varying(8) NOT NULL,
  version_eiac character varying(16),
  codigo_entidad character varying(16),
  xml_hash character varying(64),
  zip_entry_count integer,
  estado cima_fichero_estado DEFAULT 'pending'::cima_fichero_estado NOT NULL,
  error_detalle text,
  poliza_id uuid,
  descargado_at timestamp without time zone DEFAULT now() NOT NULL,
  confirmado_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  polizas_count integer,
  polizas_persisted integer
);

CREATE TABLE seguros.cliente_carnets_conducir (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  fecha_carnet text,
  tipo character varying(4),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.cliente_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  email text NOT NULL,
  email_lookup_hash text,
  etiqueta character varying(30),
  es_principal boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.cliente_merge_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  merged_cliente_id uuid NOT NULL,
  surviving_cliente_id uuid NOT NULL,
  justificacion_identidad text NOT NULL,
  inherited_fields text[],
  usuario_id_movido uuid,
  cohort_movido boolean DEFAULT false NOT NULL,
  deps_repointed jsonb,
  snapshot_before jsonb NOT NULL,
  lote text,
  actor text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.cliente_relaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_a_id uuid NOT NULL,
  cliente_b_id uuid NOT NULL,
  tipo_relacion character varying(60) NOT NULL,
  puede_ver_polizas boolean DEFAULT false NOT NULL,
  observaciones text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.cliente_telefonos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  telefono text NOT NULL,
  telefono_lookup_hash text,
  etiqueta character varying(30),
  es_principal boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.clientes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  usuario_id uuid,
  nombre character varying(255) NOT NULL,
  apellidos character varying(255) NOT NULL,
  dni text,
  telefono text,
  email text,
  fecha_nacimiento text,
  direccion text,
  codigo_postal character varying(10),
  ciudad character varying(100),
  provincia character varying(100),
  wa_opt_in boolean DEFAULT false NOT NULL,
  wa_phone_number character varying(20),
  canal_preferido canal_recordatorio DEFAULT 'email'::canal_recordatorio,
  notas text,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  import_ref character varying(100),
  wa_opt_out_at timestamp without time zone,
  wa_opt_out_source character varying(30),
  email_opt_out_at timestamp without time zone,
  email_opt_out_source character varying(30),
  email_lookup_hash text,
  telefono_lookup_hash text,
  activo boolean DEFAULT true NOT NULL,
  segmento segmento_cliente DEFAULT 'prospecto'::segmento_cliente NOT NULL,
  tipo tipo_cliente DEFAULT 'cliente'::tipo_cliente NOT NULL,
  dni_lookup_hash text,
  tipo_persona tipo_persona,
  lead_estado lead_estado DEFAULT 'nuevo'::lead_estado NOT NULL,
  cohort_invited_at timestamp without time zone,
  comercial_id uuid,
  fuente fuente_origen,
  estado_civil character varying(40),
  ocupacion character varying(120),
  sector character varying(120),
  cuenta_bancaria text,
  saludo character varying(10),
  direccion_fiscal text,
  cp_fiscal character varying(10),
  ciudad_fiscal character varying(100),
  provincia_fiscal character varying(100),
  merged_into_cliente_id uuid
);

CREATE TABLE seguros.codeoscopic_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  tipo codeoscopic_document_tipo NOT NULL,
  compania character varying(255),
  blob_url text,
  external_url text,
  file_name character varying(255),
  mime_type character varying(100),
  size_bytes integer,
  visible_por_cliente boolean DEFAULT false NOT NULL,
  generated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.codeoscopic_offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  offer_id_codeoscopic character varying(50) NOT NULL,
  compania_principal character varying(255) NOT NULL,
  complementarias jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.codeoscopic_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  rol codeoscopic_participant_rol NOT NULL,
  cliente_id uuid,
  snapshot jsonb,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.codeoscopic_prices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  price_id_codeoscopic character varying(100) NOT NULL,
  fase codeoscopic_price_fase NOT NULL,
  compania character varying(255) NOT NULL,
  modalidad character varying(255),
  prima_cents integer NOT NULL,
  tipo codeoscopic_price_tipo DEFAULT 'estimado'::codeoscopic_price_tipo NOT NULL,
  expires_at timestamp without time zone,
  raw_payload jsonb,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.codeoscopic_product_forms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  fase codeoscopic_product_form_fase NOT NULL,
  schema_payload jsonb,
  answers_payload jsonb,
  submitted_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.codeoscopic_projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  project_id_codeoscopic character varying(50) NOT NULL,
  cliente_id uuid,
  cotizacion_id uuid,
  poliza_id uuid,
  producto tipo_seguro NOT NULL,
  aseguradora character varying(255),
  estado codeoscopic_project_estado DEFAULT 'cotizacion'::codeoscopic_project_estado NOT NULL,
  submit_attempt_id uuid DEFAULT gen_random_uuid(),
  error_mensaje text,
  info_adicional text,
  quote_data jsonb,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  polling_started_at timestamp without time zone,
  polling_next_at timestamp without time zone,
  polling_attempts integer DEFAULT 0 NOT NULL,
  oportunidad_id uuid,
  submittable_quote_id character varying(128),
  accepted_offer_id_codeoscopic character varying(50),
  submit_in_flight_at timestamp without time zone
);

CREATE TABLE seguros.codeoscopic_webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid,
  project_id_codeoscopic character varying(50),
  event_type codeoscopic_webhook_event_type DEFAULT 'otro'::codeoscopic_webhook_event_type NOT NULL,
  payload_hash character varying(64) NOT NULL,
  raw_payload jsonb NOT NULL,
  received_at timestamp without time zone DEFAULT now() NOT NULL,
  processed_at timestamp without time zone,
  processing_error text
);

CREATE TABLE seguros.consent_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  cliente_id uuid,
  cotizacion_id uuid,
  tipo_consentimiento text NOT NULL,
  granted boolean NOT NULL,
  clause_version text NOT NULL,
  source_user_agent text,
  source_ip inet,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.conversaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid,
  wa_thread_id character varying(255),
  estado character varying(50) DEFAULT 'abierta'::character varying NOT NULL,
  escalado_a uuid,
  fecha_escalado timestamp without time zone,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  lead_wa_phone character varying(30),
  wa_opt_out_at timestamp without time zone,
  cliente_verificado_at timestamp without time zone,
  verificacion_intentos integer DEFAULT 0 NOT NULL
);

CREATE TABLE seguros.corredurias (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nombre character varying(255) NOT NULL,
  cif character varying(20) NOT NULL,
  email character varying(255) NOT NULL,
  telefono character varying(20),
  direccion text,
  codigo_postal character varying(10),
  ciudad character varying(100),
  provincia character varying(100),
  logo_url text,
  web character varying(255),
  wa_phone_number_id character varying(100),
  wa_business_account_id character varying(100),
  wa_access_token text,
  plan plan_suscripcion DEFAULT 'trial'::plan_suscripcion NOT NULL,
  plan_expires_at timestamp without time zone,
  max_polizas integer DEFAULT 500 NOT NULL,
  recordatorios_dias jsonb DEFAULT '[30, 15, 7]'::jsonb,
  recordatorios_canal canal_recordatorio DEFAULT 'email'::canal_recordatorio,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.cotizaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid,
  poliza_origen_id uuid,
  tipo_seguro tipo_seguro NOT NULL,
  datos_cotizacion jsonb NOT NULL,
  resultados_api jsonb,
  mejor_oferta jsonb,
  estado estado_cotizacion DEFAULT 'pendiente'::estado_cotizacion NOT NULL,
  lead_nombre character varying(255),
  lead_email character varying(255),
  lead_telefono character varying(255),
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  lead_origen character varying(30) DEFAULT 'web'::character varying NOT NULL,
  lead_consent_at timestamp without time zone,
  web_lead_idempotency_key character varying(128),
  user_id uuid,
  poliza_resultante_id uuid,
  precio_exacto_amount_cents integer,
  precio_exacto_solicitado_at timestamp with time zone,
  precio_exacto_recibido_at timestamp with time zone,
  codeoscopic_response_hash character varying(64),
  broker_init_key character varying(128)
);

CREATE TABLE seguros.cotizaciones_anonimas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  tipo_seguro tipo_seguro NOT NULL,
  datos_cotizacion jsonb DEFAULT '{}'::jsonb NOT NULL,
  rango_orientativo jsonb,
  ip_address inet,
  user_agent text,
  merged_cotizacion_id uuid,
  merged_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.cuenta_efectivo (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  codigo_entidad_dgs text,
  periodo_inicio timestamp with time zone,
  periodo_fin timestamp with time zone,
  saldo_inicial text,
  saldo_final text,
  recibos_cobrados text,
  comisiones_recibos text,
  retencion_comisiones text,
  siniestros_pagados text,
  otros_conceptos text,
  retencion_otros text,
  remesas text,
  eiac_xml_hash text,
  origen cef_origen DEFAULT 'cima'::cef_origen NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.gestiones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  tipo gestion_tipo DEFAULT 'tarea'::gestion_tipo NOT NULL,
  prioridad gestion_prioridad DEFAULT 'media'::gestion_prioridad NOT NULL,
  estado gestion_estado DEFAULT 'pendiente'::gestion_estado NOT NULL,
  observaciones text NOT NULL,
  fecha_aviso timestamp with time zone,
  fecha_limite timestamp with time zone,
  destinada_a uuid,
  cliente_id uuid,
  poliza_id uuid,
  siniestro_id uuid,
  oportunidad_id uuid,
  origen_trigger character varying(60),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.historial_interno (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  poliza_id uuid,
  tipo tipo_historial_interno DEFAULT 'nota'::tipo_historial_interno NOT NULL,
  texto text NOT NULL,
  actor_user_id uuid,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone,
  deleted_at timestamp without time zone
);

CREATE TABLE seguros.lds_consent (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  correduria_id uuid,
  lds_version text NOT NULL,
  lds_doc_hash character varying(64) NOT NULL,
  ip_address inet,
  user_agent text,
  accepted_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.liquidacion_movimientos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  liquidacion_id uuid NOT NULL,
  numero_orden integer,
  fecha_movimiento timestamp with time zone,
  clase_importe text,
  importe text,
  recibo_id uuid,
  poliza_id uuid,
  id_recibo_eiac text,
  datos_extra jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.liquidaciones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cuenta_efectivo_id uuid NOT NULL,
  id_liquidacion_entidad text,
  codigo_entidad_dgs text,
  estado_liquidacion liquidacion_estado,
  fecha_liquidacion timestamp with time zone,
  fecha_pago timestamp with time zone,
  importe_remesa text,
  datos_extra jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.mediator_audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  submit_id text NOT NULL,
  poliza_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  cotizacion_id uuid,
  timestamp_emision timestamp with time zone DEFAULT now() NOT NULL,
  ip_origen inet NOT NULL,
  user_agent text,
  consentimiento_pre_contractual_visto_at timestamp with time zone NOT NULL,
  poder_digital_version text NOT NULL,
  codeoscopic_request_payload jsonb NOT NULL,
  codeoscopic_response_payload jsonb NOT NULL,
  hash_evidencia text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  legal_version text DEFAULT '2026-XX-v0-pre-governance'::text NOT NULL,
  lds_version_aceptada text
);

CREATE TABLE seguros.mensajes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversacion_id uuid NOT NULL,
  rol character varying(20) NOT NULL,
  contenido text NOT NULL,
  wa_message_id character varying(255),
  metadata jsonb,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.ofertas_automaticas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  poliza_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  cotizacion_id uuid,
  trigger trigger_oferta_automatica NOT NULL,
  aseguradora character varying(255) NOT NULL,
  prima_anual_oferta numeric(10,2) NOT NULL,
  prima_anual_actual numeric(10,2),
  ahorro_anual numeric(10,2),
  coberturas_resumen jsonb,
  estado estado_oferta_automatica DEFAULT 'pendiente'::estado_oferta_automatica NOT NULL,
  auto_submit_elegible boolean DEFAULT false NOT NULL,
  auto_submit_freeze_reason character varying(100),
  notificacion_in_app_at timestamp with time zone,
  notificacion_email_at timestamp with time zone,
  notificacion_whatsapp_at timestamp with time zone,
  fecha_expiracion timestamp with time zone NOT NULL,
  aceptada_at timestamp with time zone,
  rechazada_at timestamp with time zone,
  rechazo_motivo character varying(200),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.operational_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_name character varying(80) NOT NULL,
  lead_phone character varying(30),
  cotizacion_id uuid,
  correduria_id uuid,
  source_event_id character varying(255),
  source character varying(80) NOT NULL,
  state_from character varying(50),
  state_to character varying(50),
  missing_fields_count integer,
  payload jsonb,
  occurred_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.oportunidades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  comercial_id uuid,
  tipo tipo_seguro,
  fuente fuente_origen,
  estado estado_comercial DEFAULT 'en_negociacion'::estado_comercial NOT NULL,
  fecha_vigencia date,
  fecha_fin_vigencia date,
  auditar_seguimiento boolean DEFAULT false NOT NULL,
  aseguradora_ganadora character varying(255),
  numero_poliza character varying(100),
  prima_bruta numeric(10,2),
  fraccionamiento fraccionamiento,
  cuenta_bancaria text,
  poliza_competencia jsonb,
  info_riesgo jsonb,
  poliza_ganada_id uuid,
  import_ref character varying(100),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.peticiones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid,
  tipo character varying(40) NOT NULL,
  ramo tipo_seguro,
  estado estado_peticion DEFAULT 'nueva'::estado_peticion NOT NULL,
  origen character varying(30) DEFAULT 'portal'::character varying NOT NULL,
  descripcion text,
  lead_nombre character varying(255),
  cotizacion_id uuid,
  source_event_id uuid,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.poliza_coberturas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  poliza_id uuid NOT NULL,
  numero_orden integer,
  codigo text,
  descripcion text,
  capital_asegurado text,
  descripcion_capital text,
  franquicia text,
  fecha_inicio timestamp with time zone,
  fecha_fin timestamp with time zone,
  modalidad_valoracion text,
  datos_extra jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.poliza_documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  poliza_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  blob_pathname text NOT NULL,
  file_name character varying(255) NOT NULL,
  mime_type character varying(100) NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by_usuario_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  visible_por_cliente boolean DEFAULT false NOT NULL
);

CREATE TABLE seguros.poliza_intervinientes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  poliza_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  rol interviniente_rol NOT NULL,
  cliente_id uuid,
  tipo_relacion character varying(60),
  nif text,
  nif_lookup_hash text,
  nombre text,
  apellidos text,
  fecha_nacimiento text,
  telefono text,
  email text,
  fecha_carnet text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  responde_a character varying(120),
  antiguedad_carnet integer,
  origen interviniente_origen DEFAULT 'manual'::interviniente_origen NOT NULL
);

CREATE TABLE seguros.poliza_merge_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  merged_poliza_id uuid NOT NULL,
  surviving_poliza_id uuid NOT NULL,
  merged_cliente_id uuid,
  surviving_cliente_id uuid,
  numero_poliza text,
  lote text,
  inherited_keys text[],
  gestiones_repointed uuid[],
  snapshot_before jsonb NOT NULL,
  actor text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.poliza_recibos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  poliza_id uuid NOT NULL,
  id_recibo text,
  codigo_entidad_dgs text,
  situacion recibo_estado,
  clase_recibo text,
  fecha_efecto_inicial timestamp with time zone,
  fecha_efecto_actual timestamp with time zone,
  fecha_vencimiento timestamp with time zone,
  fecha_emision timestamp with time zone,
  fecha_situacion timestamp with time zone,
  prima_total text,
  prima_neta text,
  forma_pago text,
  iban text,
  comision_bruta text,
  comision_liquida text,
  datos_extra jsonb,
  eiac_xml_hash text,
  origen recibo_origen DEFAULT 'cima'::recibo_origen NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.polizas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  tipo tipo_seguro NOT NULL,
  aseguradora character varying(255) NOT NULL,
  numero_poliza character varying(100),
  fecha_inicio date,
  fecha_vencimiento date,
  prima_anual numeric(10,2),
  prima_mensual numeric(10,2),
  estado estado_poliza DEFAULT 'activa'::estado_poliza NOT NULL,
  datos_especificos jsonb,
  coberturas jsonb,
  documento_url text,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  import_ref character varying(100),
  origen poliza_origen DEFAULT 'gestionada_correduria'::poliza_origen NOT NULL,
  compania_declarada character varying(255),
  verificado_por_correduria boolean DEFAULT false NOT NULL,
  id_poliza_entidad character varying(50),
  codigo_entidad_dgs character varying(16),
  ramo_dgs character varying(8),
  situacion character varying(4),
  fecha_efecto_inicial date,
  eiac_xml_hash character varying(64),
  prima_bruta numeric(10,2),
  fraccionamiento fraccionamiento,
  cuenta_bancaria text,
  comercial_id uuid,
  poliza_padre_id uuid,
  auditar_seguimiento boolean DEFAULT false NOT NULL,
  oportunidad_origen_id uuid,
  poliza_competencia jsonb,
  poliza_sustituida jsonb,
  merged_into_poliza_id uuid
);

CREATE TABLE seguros.recordatorios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  poliza_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  cotizacion_id uuid,
  tipo tipo_recordatorio NOT NULL,
  canal canal_recordatorio NOT NULL,
  dias_antes integer NOT NULL,
  fecha_programada timestamp without time zone NOT NULL,
  fecha_envio timestamp without time zone,
  estado estado_recordatorio DEFAULT 'programado'::estado_recordatorio NOT NULL,
  asunto character varying(255),
  mensaje text,
  fecha_leido timestamp without time zone,
  fecha_respondido timestamp without time zone,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.siniestro_contrarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  siniestro_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  es_conductor boolean,
  nombre text,
  telefono text,
  marca_modelo character varying(120),
  compania character varying(255),
  matricula text,
  numero_poliza character varying(100),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.siniestro_lesionados (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  siniestro_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  nombre text,
  telefono text,
  iba_en_coche_cliente boolean,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.siniestro_testigos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  siniestro_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  nombre text,
  telefono text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.siniestros (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  poliza_id uuid NOT NULL,
  comercial_id uuid,
  estado estado_siniestro DEFAULT 'abierto'::estado_siniestro NOT NULL,
  tipo character varying(60),
  referencia character varying(100),
  fecha_hora timestamp with time zone,
  lugar_direccion text,
  lugar_cp character varying(10),
  lugar_ciudad character varying(100),
  lugar_provincia character varying(100),
  se_considera_culpable boolean,
  comentario text,
  tramitador_nombre character varying(255),
  tramitador_telefono character varying(30),
  tramitador_email character varying(255),
  perito_nombre character varying(255),
  perito_telefono character varying(30),
  perito_email character varying(255),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  origen siniestro_origen DEFAULT 'gestionado_correduria'::siniestro_origen NOT NULL,
  eiac_xml_hash character varying(64),
  id_siniestro_entidad character varying(50),
  codigo_entidad_dgs character varying(16),
  gravedad siniestro_gravedad,
  reserva_importe numeric(12,2),
  indemnizacion_importe numeric(12,2)
);

CREATE TABLE seguros.solicitud_cambio_documentos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  operational_event_id uuid NOT NULL,
  correduria_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  blob_pathname text NOT NULL,
  file_name character varying(255) NOT NULL,
  mime_type character varying(100) NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by_usuario_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.usuarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  auth_user_id uuid NOT NULL,
  email character varying(255) NOT NULL,
  nombre character varying(255) NOT NULL,
  apellidos character varying(255),
  telefono character varying(20),
  rol user_role DEFAULT 'usuario'::user_role NOT NULL,
  correduria_id uuid,
  activo boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  last_accepted_legal_version text DEFAULT '2026-XX-v0-pre-governance'::text NOT NULL
);

CREATE TABLE seguros.whatsapp_kb_chunks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kb_file character varying(255) NOT NULL,
  chunk_idx integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  tokens integer NOT NULL,
  audience character varying(20) NOT NULL,
  tags jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE seguros.whatsapp_outbound_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  idempotency_key character varying(128) NOT NULL,
  correduria_id uuid,
  to_phone character varying(30) NOT NULL,
  body_preview character varying(500),
  wamid character varying(255),
  status character varying(30) NOT NULL,
  http_status integer,
  provider_response jsonb,
  error_message text,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- =============================================================================
-- 3. CONSTRAINTS — CHECK
-- =============================================================================

ALTER TABLE seguros.bien_documentos ADD CONSTRAINT bien_documentos_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 27262976)));
ALTER TABLE seguros.bot_turn_traces ADD CONSTRAINT bot_turn_traces_role_check CHECK (((role)::text = ANY ((ARRAY['prospect'::character varying, 'cliente'::character varying, 'sensible'::character varying])::text[])));
ALTER TABLE seguros.cliente_relaciones ADD CONSTRAINT cliente_relaciones_distintos_ck CHECK ((cliente_a_id <> cliente_b_id));
ALTER TABLE seguros.consent_logs ADD CONSTRAINT consent_logs_at_least_one_fk CHECK (((cliente_id IS NOT NULL) OR (cotizacion_id IS NOT NULL)));
ALTER TABLE seguros.consent_logs ADD CONSTRAINT consent_logs_tipo_check CHECK ((tipo_consentimiento = ANY (ARRAY['gestion'::text, 'salud_sensible'::text, 'comercial'::text, 'art14_acuse_recibo'::text])));
ALTER TABLE seguros.conversaciones ADD CONSTRAINT conversaciones_cliente_or_lead_ck CHECK (((cliente_id IS NOT NULL) OR ((lead_wa_phone IS NOT NULL) AND (length(TRIM(BOTH FROM lead_wa_phone)) > 0))));
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_al_menos_un_ancla_ck CHECK (((cliente_id IS NOT NULL) OR (poliza_id IS NOT NULL) OR (siniestro_id IS NOT NULL) OR (oportunidad_id IS NOT NULL)));
ALTER TABLE seguros.lds_consent ADD CONSTRAINT lds_consent_hash_format CHECK (((lds_doc_hash)::text ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE seguros.poliza_documentos ADD CONSTRAINT poliza_documentos_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 27262976)));
ALTER TABLE seguros.solicitud_cambio_documentos ADD CONSTRAINT solicitud_cambio_documentos_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 27262976)));

-- =============================================================================
-- 4. CONSTRAINTS — PRIMARY KEY
-- =============================================================================

ALTER TABLE seguros.bien_documentos ADD CONSTRAINT bien_documentos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.bienes_asegurables ADD CONSTRAINT bienes_asegurables_pkey PRIMARY KEY (id);
ALTER TABLE seguros.bot_eval_runs ADD CONSTRAINT bot_eval_runs_pkey PRIMARY KEY (id);
ALTER TABLE seguros.bot_eval_scores ADD CONSTRAINT bot_eval_scores_pkey PRIMARY KEY (id);
ALTER TABLE seguros.bot_turn_traces ADD CONSTRAINT bot_turn_traces_pkey PRIMARY KEY (id);
ALTER TABLE seguros.channel_inbound_messages ADD CONSTRAINT channel_inbound_messages_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cima_ficheros ADD CONSTRAINT cima_ficheros_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cliente_carnets_conducir ADD CONSTRAINT cliente_carnets_conducir_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cliente_emails ADD CONSTRAINT cliente_emails_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cliente_merge_log ADD CONSTRAINT cliente_merge_log_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cliente_relaciones ADD CONSTRAINT cliente_relaciones_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cliente_telefonos ADD CONSTRAINT cliente_telefonos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.clientes ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_documents ADD CONSTRAINT codeoscopic_documents_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_offers ADD CONSTRAINT codeoscopic_offers_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_participants ADD CONSTRAINT codeoscopic_participants_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_prices ADD CONSTRAINT codeoscopic_prices_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_product_forms ADD CONSTRAINT codeoscopic_product_forms_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_projects ADD CONSTRAINT codeoscopic_projects_pkey PRIMARY KEY (id);
ALTER TABLE seguros.codeoscopic_webhook_events ADD CONSTRAINT codeoscopic_webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE seguros.consent_logs ADD CONSTRAINT consent_logs_pkey PRIMARY KEY (id);
ALTER TABLE seguros.conversaciones ADD CONSTRAINT conversaciones_pkey PRIMARY KEY (id);
ALTER TABLE seguros.corredurias ADD CONSTRAINT corredurias_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cotizaciones ADD CONSTRAINT cotizaciones_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cotizaciones_anonimas ADD CONSTRAINT cotizaciones_anonimas_pkey PRIMARY KEY (id);
ALTER TABLE seguros.cuenta_efectivo ADD CONSTRAINT cuenta_efectivo_pkey PRIMARY KEY (id);
ALTER TABLE seguros.gestiones ADD CONSTRAINT gestiones_pkey PRIMARY KEY (id);
ALTER TABLE seguros.historial_interno ADD CONSTRAINT historial_interno_pkey PRIMARY KEY (id);
ALTER TABLE seguros.lds_consent ADD CONSTRAINT lds_consent_pkey PRIMARY KEY (id);
ALTER TABLE seguros.liquidacion_movimientos ADD CONSTRAINT liquidacion_movimientos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.liquidaciones ADD CONSTRAINT liquidaciones_pkey PRIMARY KEY (id);
ALTER TABLE seguros.mediator_audit_log ADD CONSTRAINT mediator_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE seguros.mensajes ADD CONSTRAINT mensajes_pkey PRIMARY KEY (id);
ALTER TABLE seguros.ofertas_automaticas ADD CONSTRAINT ofertas_automaticas_pkey PRIMARY KEY (id);
ALTER TABLE seguros.operational_events ADD CONSTRAINT operational_events_pkey PRIMARY KEY (id);
ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_pkey PRIMARY KEY (id);
ALTER TABLE seguros.peticiones ADD CONSTRAINT peticiones_pkey PRIMARY KEY (id);
ALTER TABLE seguros.poliza_coberturas ADD CONSTRAINT poliza_coberturas_pkey PRIMARY KEY (id);
ALTER TABLE seguros.poliza_documentos ADD CONSTRAINT poliza_documentos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.poliza_intervinientes ADD CONSTRAINT poliza_intervinientes_pkey PRIMARY KEY (id);
ALTER TABLE seguros.poliza_merge_log ADD CONSTRAINT poliza_merge_log_pkey PRIMARY KEY (id);
ALTER TABLE seguros.poliza_recibos ADD CONSTRAINT poliza_recibos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_pkey PRIMARY KEY (id);
ALTER TABLE seguros.recordatorios ADD CONSTRAINT recordatorios_pkey PRIMARY KEY (id);
ALTER TABLE seguros.siniestro_contrarios ADD CONSTRAINT siniestro_contrarios_pkey PRIMARY KEY (id);
ALTER TABLE seguros.siniestro_lesionados ADD CONSTRAINT siniestro_lesionados_pkey PRIMARY KEY (id);
ALTER TABLE seguros.siniestro_testigos ADD CONSTRAINT siniestro_testigos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_pkey PRIMARY KEY (id);
ALTER TABLE seguros.solicitud_cambio_documentos ADD CONSTRAINT solicitud_cambio_documentos_pkey PRIMARY KEY (id);
ALTER TABLE seguros.usuarios ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);
ALTER TABLE seguros.whatsapp_kb_chunks ADD CONSTRAINT whatsapp_kb_chunks_pkey PRIMARY KEY (id);
ALTER TABLE seguros.whatsapp_outbound_messages ADD CONSTRAINT whatsapp_outbound_messages_pkey PRIMARY KEY (id);

-- =============================================================================
-- 5. CONSTRAINTS — UNIQUE
-- =============================================================================

ALTER TABLE seguros.corredurias ADD CONSTRAINT corredurias_cif_unique UNIQUE (cif);
ALTER TABLE seguros.ofertas_automaticas ADD CONSTRAINT ofertas_automaticas_poliza_id_trigger_key UNIQUE (poliza_id, trigger);
ALTER TABLE seguros.peticiones ADD CONSTRAINT peticiones_source_event_id_key UNIQUE (source_event_id);
ALTER TABLE seguros.usuarios ADD CONSTRAINT usuarios_email_unique UNIQUE (email);
ALTER TABLE seguros.usuarios ADD CONSTRAINT usuarios_auth_user_id_unique UNIQUE (auth_user_id);

-- =============================================================================
-- 6. ÍNDICES (199)
-- =============================================================================
-- Van al final del fichero, pero este DDL se ejecuta ENTERO antes de los datos.
-- Con ~75.000 filas eso cuesta segundos, no minutos, y a cambio la carga entra ya
-- validada contra los UNIQUE (que es lo que queremos: si el volcado duplica algo,
-- preferimos que falle ahora y no descubrirlo en producción).

CREATE INDEX idx_bien_documentos_bien ON seguros.bien_documentos USING btree (bien_id);
CREATE INDEX idx_bien_documentos_bien_tipo ON seguros.bien_documentos USING btree (bien_id, tipo);
CREATE UNIQUE INDEX idx_bien_documentos_blob_unique ON seguros.bien_documentos USING btree (blob_pathname);
CREATE INDEX idx_bien_documentos_cliente ON seguros.bien_documentos USING btree (cliente_id);
CREATE INDEX idx_bien_documentos_correduria_created ON seguros.bien_documentos USING btree (correduria_id, created_at DESC);
CREATE INDEX idx_bienes_cliente ON seguros.bienes_asegurables USING btree (cliente_id);
CREATE INDEX idx_bienes_cliente_tipo ON seguros.bienes_asegurables USING btree (cliente_id, tipo);
CREATE INDEX idx_bot_eval_runs_created ON seguros.bot_eval_runs USING btree (created_at);
CREATE INDEX idx_bot_eval_scores_run ON seguros.bot_eval_scores USING btree (run_id, created_at);
CREATE INDEX idx_bot_turn_traces_conversacion ON seguros.bot_turn_traces USING btree (conversacion_id, created_at);
CREATE INDEX idx_bot_turn_traces_correduria ON seguros.bot_turn_traces USING btree (correduria_id, created_at) WHERE (correduria_id IS NOT NULL);
CREATE INDEX idx_channel_inbound_channel ON seguros.channel_inbound_messages USING btree (channel, received_at);
CREATE INDEX idx_channel_inbound_cliente ON seguros.channel_inbound_messages USING btree (cliente_id, received_at) WHERE (cliente_id IS NOT NULL);
CREATE INDEX idx_channel_inbound_conversacion ON seguros.channel_inbound_messages USING btree (conversacion_id, received_at) WHERE (conversacion_id IS NOT NULL);
CREATE INDEX idx_channel_inbound_correduria ON seguros.channel_inbound_messages USING btree (correduria_id, received_at) WHERE (correduria_id IS NOT NULL);
CREATE INDEX idx_channel_inbound_lead ON seguros.channel_inbound_messages USING btree (lead_phone);
CREATE INDEX idx_channel_inbound_mensaje ON seguros.channel_inbound_messages USING btree (mensaje_id) WHERE (mensaje_id IS NOT NULL);
CREATE INDEX idx_channel_inbound_status ON seguros.channel_inbound_messages USING btree (processing_status);
CREATE UNIQUE INDEX uq_channel_inbound_external ON seguros.channel_inbound_messages USING btree (channel, direction, external_message_id);
CREATE INDEX idx_cima_ficheros_correduria_estado ON seguros.cima_ficheros USING btree (correduria_id, estado);
CREATE INDEX idx_cima_ficheros_poliza ON seguros.cima_ficheros USING btree (poliza_id) WHERE (poliza_id IS NOT NULL);
CREATE UNIQUE INDEX uq_cima_ficheros_nombre ON seguros.cima_ficheros USING btree (nombre_fichero);
CREATE UNIQUE INDEX uq_cima_ficheros_xml_hash ON seguros.cima_ficheros USING btree (xml_hash) WHERE (xml_hash IS NOT NULL);
CREATE INDEX idx_cliente_carnets_cliente ON seguros.cliente_carnets_conducir USING btree (cliente_id);
CREATE INDEX idx_cliente_carnets_correduria ON seguros.cliente_carnets_conducir USING btree (correduria_id);
CREATE INDEX idx_cliente_emails_cliente ON seguros.cliente_emails USING btree (cliente_id);
CREATE INDEX idx_cliente_emails_correduria ON seguros.cliente_emails USING btree (correduria_id);
CREATE INDEX idx_cliente_emails_lookup_hash ON seguros.cliente_emails USING btree (email_lookup_hash) WHERE (email_lookup_hash IS NOT NULL);
CREATE INDEX idx_cliente_merge_log_correduria ON seguros.cliente_merge_log USING btree (correduria_id);
CREATE INDEX idx_cliente_merge_log_merged ON seguros.cliente_merge_log USING btree (merged_cliente_id);
CREATE INDEX idx_cliente_merge_log_surviving ON seguros.cliente_merge_log USING btree (surviving_cliente_id);
CREATE INDEX idx_cliente_relaciones_a ON seguros.cliente_relaciones USING btree (cliente_a_id);
CREATE INDEX idx_cliente_relaciones_b ON seguros.cliente_relaciones USING btree (cliente_b_id);
CREATE INDEX idx_cliente_relaciones_correduria ON seguros.cliente_relaciones USING btree (correduria_id);
CREATE UNIQUE INDEX uq_cliente_relaciones_a_b_tipo ON seguros.cliente_relaciones USING btree (cliente_a_id, cliente_b_id, tipo_relacion);
CREATE INDEX idx_cliente_telefonos_cliente ON seguros.cliente_telefonos USING btree (cliente_id);
CREATE INDEX idx_cliente_telefonos_correduria ON seguros.cliente_telefonos USING btree (correduria_id);
CREATE INDEX idx_cliente_telefonos_lookup_hash ON seguros.cliente_telefonos USING btree (telefono_lookup_hash) WHERE (telefono_lookup_hash IS NOT NULL);
CREATE INDEX idx_clientes_cohort_invited ON seguros.clientes USING btree (correduria_id, cohort_invited_at) WHERE (cohort_invited_at IS NOT NULL);
CREATE INDEX idx_clientes_comercial ON seguros.clientes USING btree (comercial_id) WHERE (comercial_id IS NOT NULL);
CREATE INDEX idx_clientes_correduria ON seguros.clientes USING btree (correduria_id);
CREATE INDEX idx_clientes_correduria_created ON seguros.clientes USING btree (correduria_id, created_at);
CREATE INDEX idx_clientes_correduria_import_ref ON seguros.clientes USING btree (correduria_id, import_ref);
CREATE INDEX idx_clientes_email_opt_out ON seguros.clientes USING btree (email_opt_out_at) WHERE (email_opt_out_at IS NOT NULL);
CREATE INDEX idx_clientes_lead_estado ON seguros.clientes USING btree (correduria_id, lead_estado);
CREATE INDEX idx_clientes_merged_into ON seguros.clientes USING btree (merged_into_cliente_id) WHERE (merged_into_cliente_id IS NOT NULL);
CREATE INDEX idx_clientes_segmento ON seguros.clientes USING btree (correduria_id, segmento);
CREATE INDEX idx_clientes_telefono_lookup_hash ON seguros.clientes USING btree (telefono_lookup_hash) WHERE (telefono_lookup_hash IS NOT NULL);
CREATE INDEX idx_clientes_tipo ON seguros.clientes USING btree (correduria_id, tipo);
CREATE INDEX idx_clientes_wa_phone_opt_out ON seguros.clientes USING btree (wa_phone_number) WHERE (wa_opt_out_at IS NOT NULL);
CREATE UNIQUE INDEX uq_clientes_correduria_import_ref ON seguros.clientes USING btree (correduria_id, import_ref) WHERE (import_ref IS NOT NULL);
CREATE UNIQUE INDEX uq_clientes_dni_lookup_hash ON seguros.clientes USING btree (dni_lookup_hash) WHERE ((dni_lookup_hash IS NOT NULL) AND (tipo = 'cliente'::tipo_cliente));
CREATE UNIQUE INDEX uq_clientes_email_lookup_hash ON seguros.clientes USING btree (email_lookup_hash) WHERE (email_lookup_hash IS NOT NULL);
CREATE INDEX idx_codeoscopic_documents_project ON seguros.codeoscopic_documents USING btree (project_id);
CREATE INDEX idx_codeoscopic_documents_tipo ON seguros.codeoscopic_documents USING btree (tipo);
CREATE INDEX idx_codeoscopic_offers_project ON seguros.codeoscopic_offers USING btree (project_id);
CREATE UNIQUE INDEX uq_codeoscopic_offers_project_offerid ON seguros.codeoscopic_offers USING btree (project_id, offer_id_codeoscopic);
CREATE INDEX idx_codeoscopic_participants_cliente ON seguros.codeoscopic_participants USING btree (cliente_id);
CREATE INDEX idx_codeoscopic_participants_project ON seguros.codeoscopic_participants USING btree (project_id);
CREATE INDEX idx_codeoscopic_prices_expires ON seguros.codeoscopic_prices USING btree (expires_at);
CREATE INDEX idx_codeoscopic_prices_fase ON seguros.codeoscopic_prices USING btree (fase);
CREATE INDEX idx_codeoscopic_prices_project ON seguros.codeoscopic_prices USING btree (project_id);
CREATE UNIQUE INDEX uq_codeoscopic_prices_project_priceid ON seguros.codeoscopic_prices USING btree (project_id, price_id_codeoscopic);
CREATE INDEX idx_codeoscopic_product_forms_project ON seguros.codeoscopic_product_forms USING btree (project_id);
CREATE UNIQUE INDEX uq_codeoscopic_product_forms_project_fase ON seguros.codeoscopic_product_forms USING btree (project_id, fase);
CREATE INDEX idx_codeoscopic_projects_cliente ON seguros.codeoscopic_projects USING btree (cliente_id);
CREATE INDEX idx_codeoscopic_projects_correduria ON seguros.codeoscopic_projects USING btree (correduria_id);
CREATE INDEX idx_codeoscopic_projects_cotizacion ON seguros.codeoscopic_projects USING btree (cotizacion_id);
CREATE INDEX idx_codeoscopic_projects_estado ON seguros.codeoscopic_projects USING btree (estado);
CREATE INDEX idx_codeoscopic_projects_oportunidad ON seguros.codeoscopic_projects USING btree (oportunidad_id) WHERE (oportunidad_id IS NOT NULL);
CREATE INDEX idx_codeoscopic_projects_polling_next ON seguros.codeoscopic_projects USING btree (polling_next_at) WHERE (estado = 'riesgo_condicionado'::codeoscopic_project_estado);
CREATE UNIQUE INDEX uq_codeoscopic_projects_poliza ON seguros.codeoscopic_projects USING btree (poliza_id) WHERE (poliza_id IS NOT NULL);
CREATE UNIQUE INDEX uq_codeoscopic_projects_project_id ON seguros.codeoscopic_projects USING btree (project_id_codeoscopic);
CREATE UNIQUE INDEX uq_codeoscopic_projects_submit_attempt ON seguros.codeoscopic_projects USING btree (submit_attempt_id) WHERE (submit_attempt_id IS NOT NULL);
CREATE INDEX idx_codeoscopic_webhook_events_project ON seguros.codeoscopic_webhook_events USING btree (project_id);
CREATE INDEX idx_codeoscopic_webhook_events_received ON seguros.codeoscopic_webhook_events USING btree (received_at);
CREATE UNIQUE INDEX uq_codeoscopic_webhook_events_hash ON seguros.codeoscopic_webhook_events USING btree (payload_hash);
CREATE INDEX idx_consent_logs_cliente ON seguros.consent_logs USING btree (cliente_id) WHERE (cliente_id IS NOT NULL);
CREATE INDEX idx_consent_logs_cotizacion ON seguros.consent_logs USING btree (cotizacion_id) WHERE (cotizacion_id IS NOT NULL);
CREATE INDEX idx_consent_logs_granted_at ON seguros.consent_logs USING btree (granted_at DESC);
CREATE INDEX idx_consent_logs_tipo ON seguros.consent_logs USING btree (tipo_consentimiento, granted_at DESC);
CREATE INDEX idx_conversaciones_cliente ON seguros.conversaciones USING btree (cliente_id);
CREATE INDEX idx_conversaciones_correduria ON seguros.conversaciones USING btree (correduria_id);
CREATE INDEX idx_conversaciones_escalado_a ON seguros.conversaciones USING btree (escalado_a) WHERE (escalado_a IS NOT NULL);
CREATE INDEX idx_conversaciones_lead_wa ON seguros.conversaciones USING btree (correduria_id, lead_wa_phone);
CREATE INDEX idx_conversaciones_lead_wa_opt_out ON seguros.conversaciones USING btree (lead_wa_phone) WHERE (wa_opt_out_at IS NOT NULL);
CREATE UNIQUE INDEX uq_conversaciones_cliente_canonica ON seguros.conversaciones USING btree (correduria_id, cliente_id) WHERE ((cliente_id IS NOT NULL) AND (wa_thread_id IS NULL));
CREATE UNIQUE INDEX uq_conversaciones_correduria_lead_wa ON seguros.conversaciones USING btree (correduria_id, lead_wa_phone) WHERE ((lead_wa_phone IS NOT NULL) AND (cliente_id IS NULL));
CREATE INDEX idx_cotizaciones_cliente ON seguros.cotizaciones USING btree (cliente_id);
CREATE INDEX idx_cotizaciones_correduria ON seguros.cotizaciones USING btree (correduria_id);
CREATE INDEX idx_cotizaciones_correduria_created ON seguros.cotizaciones USING btree (correduria_id, created_at);
CREATE INDEX idx_cotizaciones_estado ON seguros.cotizaciones USING btree (estado);
CREATE INDEX idx_cotizaciones_poliza_origen ON seguros.cotizaciones USING btree (poliza_origen_id) WHERE (poliza_origen_id IS NOT NULL);
CREATE INDEX idx_cotizaciones_poliza_resultante ON seguros.cotizaciones USING btree (poliza_resultante_id) WHERE (poliza_resultante_id IS NOT NULL);
CREATE INDEX idx_cotizaciones_precio_exacto_recibido ON seguros.cotizaciones USING btree (user_id, precio_exacto_recibido_at) WHERE (precio_exacto_recibido_at IS NOT NULL);
CREATE INDEX idx_cotizaciones_user_id ON seguros.cotizaciones USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX uq_cotizaciones_correduria_broker_init ON seguros.cotizaciones USING btree (correduria_id, broker_init_key) WHERE (broker_init_key IS NOT NULL);
CREATE UNIQUE INDEX uq_cotizaciones_correduria_web_lead_idem ON seguros.cotizaciones USING btree (correduria_id, web_lead_idempotency_key) WHERE (web_lead_idempotency_key IS NOT NULL);
CREATE INDEX idx_cotizaciones_anonimas_correduria ON seguros.cotizaciones_anonimas USING btree (correduria_id);
CREATE INDEX idx_cotizaciones_anonimas_expires_at ON seguros.cotizaciones_anonimas USING btree (expires_at);
CREATE INDEX idx_cotizaciones_anonimas_merged ON seguros.cotizaciones_anonimas USING btree (merged_cotizacion_id) WHERE (merged_cotizacion_id IS NOT NULL);
CREATE INDEX idx_cuenta_efectivo_correduria ON seguros.cuenta_efectivo USING btree (correduria_id);
CREATE UNIQUE INDEX uq_cuenta_efectivo_correduria_entidad_periodo ON seguros.cuenta_efectivo USING btree (correduria_id, codigo_entidad_dgs, periodo_inicio, periodo_fin) WHERE (codigo_entidad_dgs IS NOT NULL);
CREATE INDEX idx_gestiones_cliente ON seguros.gestiones USING btree (cliente_id) WHERE (cliente_id IS NOT NULL);
CREATE INDEX idx_gestiones_correduria_estado ON seguros.gestiones USING btree (correduria_id, estado);
CREATE INDEX idx_gestiones_destinada_estado ON seguros.gestiones USING btree (destinada_a, estado, fecha_limite);
CREATE INDEX idx_gestiones_oportunidad ON seguros.gestiones USING btree (oportunidad_id) WHERE (oportunidad_id IS NOT NULL);
CREATE INDEX idx_gestiones_poliza ON seguros.gestiones USING btree (poliza_id) WHERE (poliza_id IS NOT NULL);
CREATE INDEX idx_gestiones_siniestro ON seguros.gestiones USING btree (siniestro_id) WHERE (siniestro_id IS NOT NULL);
CREATE INDEX idx_historial_interno_actor ON seguros.historial_interno USING btree (actor_user_id) WHERE (actor_user_id IS NOT NULL);
CREATE INDEX idx_historial_interno_cliente ON seguros.historial_interno USING btree (cliente_id, created_at DESC);
CREATE INDEX idx_historial_interno_correduria ON seguros.historial_interno USING btree (correduria_id, created_at DESC);
CREATE INDEX idx_historial_interno_poliza ON seguros.historial_interno USING btree (poliza_id, created_at DESC) WHERE (poliza_id IS NOT NULL);
CREATE INDEX idx_historial_interno_poliza_vivas ON seguros.historial_interno USING btree (poliza_id, created_at) WHERE ((deleted_at IS NULL) AND (poliza_id IS NOT NULL));
CREATE INDEX idx_lds_consent_accepted_at ON seguros.lds_consent USING btree (accepted_at DESC);
CREATE INDEX idx_lds_consent_correduria ON seguros.lds_consent USING btree (correduria_id) WHERE (correduria_id IS NOT NULL);
CREATE UNIQUE INDEX uq_lds_consent_user_version ON seguros.lds_consent USING btree (user_id, lds_version);
CREATE INDEX idx_liquidacion_movimientos_correduria ON seguros.liquidacion_movimientos USING btree (correduria_id);
CREATE INDEX idx_liquidacion_movimientos_liquidacion ON seguros.liquidacion_movimientos USING btree (liquidacion_id);
CREATE INDEX idx_liquidacion_movimientos_poliza ON seguros.liquidacion_movimientos USING btree (poliza_id);
CREATE INDEX idx_liquidacion_movimientos_recibo ON seguros.liquidacion_movimientos USING btree (recibo_id);
CREATE INDEX idx_liquidaciones_correduria ON seguros.liquidaciones USING btree (correduria_id);
CREATE INDEX idx_liquidaciones_cuenta ON seguros.liquidaciones USING btree (cuenta_efectivo_id);
CREATE INDEX idx_mediator_audit_log_cotizacion ON seguros.mediator_audit_log USING btree (cotizacion_id) WHERE (cotizacion_id IS NOT NULL);
CREATE INDEX idx_mediator_audit_log_legal_version ON seguros.mediator_audit_log USING btree (legal_version);
CREATE INDEX idx_mediator_audit_log_poliza ON seguros.mediator_audit_log USING btree (poliza_id);
CREATE INDEX idx_mediator_audit_log_submit ON seguros.mediator_audit_log USING btree (submit_id);
CREATE INDEX idx_mediator_audit_log_timestamp ON seguros.mediator_audit_log USING btree (timestamp_emision DESC);
CREATE INDEX idx_mediator_audit_log_usuario ON seguros.mediator_audit_log USING btree (usuario_id);
CREATE INDEX idx_mensajes_conversacion ON seguros.mensajes USING btree (conversacion_id);
CREATE INDEX idx_ofertas_automaticas_cliente ON seguros.ofertas_automaticas USING btree (cliente_id);
CREATE INDEX idx_ofertas_automaticas_correduria ON seguros.ofertas_automaticas USING btree (correduria_id);
CREATE INDEX idx_ofertas_automaticas_cotizacion ON seguros.ofertas_automaticas USING btree (cotizacion_id) WHERE (cotizacion_id IS NOT NULL);
CREATE INDEX idx_ofertas_automaticas_estado ON seguros.ofertas_automaticas USING btree (estado);
CREATE INDEX idx_ofertas_automaticas_fecha_expiracion ON seguros.ofertas_automaticas USING btree (fecha_expiracion);
CREATE INDEX idx_ofertas_automaticas_poliza ON seguros.ofertas_automaticas USING btree (poliza_id);
CREATE INDEX idx_ops_correduria ON seguros.operational_events USING btree (correduria_id, occurred_at) WHERE (correduria_id IS NOT NULL);
CREATE INDEX idx_ops_cotizacion ON seguros.operational_events USING btree (cotizacion_id, occurred_at);
CREATE INDEX idx_ops_event_name ON seguros.operational_events USING btree (event_name, occurred_at);
CREATE INDEX idx_ops_lead_phone ON seguros.operational_events USING btree (lead_phone, occurred_at);
CREATE UNIQUE INDEX uq_ops_source_event ON seguros.operational_events USING btree (event_name, source_event_id);
CREATE INDEX idx_oportunidades_cliente ON seguros.oportunidades USING btree (cliente_id);
CREATE INDEX idx_oportunidades_comercial ON seguros.oportunidades USING btree (comercial_id) WHERE (comercial_id IS NOT NULL);
CREATE INDEX idx_oportunidades_correduria ON seguros.oportunidades USING btree (correduria_id);
CREATE INDEX idx_oportunidades_correduria_estado ON seguros.oportunidades USING btree (correduria_id, estado);
CREATE INDEX idx_oportunidades_poliza_ganada ON seguros.oportunidades USING btree (poliza_ganada_id) WHERE (poliza_ganada_id IS NOT NULL);
CREATE UNIQUE INDEX uq_oportunidades_correduria_import_ref ON seguros.oportunidades USING btree (correduria_id, import_ref) WHERE (import_ref IS NOT NULL);
CREATE INDEX idx_peticiones_correduria_created ON seguros.peticiones USING btree (correduria_id, created_at DESC);
CREATE INDEX idx_peticiones_correduria_estado_created ON seguros.peticiones USING btree (correduria_id, estado, created_at DESC);
CREATE INDEX idx_poliza_coberturas_correduria ON seguros.poliza_coberturas USING btree (correduria_id);
CREATE INDEX idx_poliza_coberturas_poliza ON seguros.poliza_coberturas USING btree (poliza_id);
CREATE UNIQUE INDEX idx_poliza_documentos_blob_unique ON seguros.poliza_documentos USING btree (blob_pathname);
CREATE INDEX idx_poliza_documentos_cliente ON seguros.poliza_documentos USING btree (cliente_id);
CREATE INDEX idx_poliza_documentos_correduria_created ON seguros.poliza_documentos USING btree (correduria_id, created_at DESC);
CREATE INDEX idx_poliza_documentos_poliza ON seguros.poliza_documentos USING btree (poliza_id);
CREATE INDEX idx_intervinientes_cliente ON seguros.poliza_intervinientes USING btree (cliente_id) WHERE (cliente_id IS NOT NULL);
CREATE INDEX idx_intervinientes_correduria ON seguros.poliza_intervinientes USING btree (correduria_id);
CREATE INDEX idx_intervinientes_nif_hash ON seguros.poliza_intervinientes USING btree (nif_lookup_hash) WHERE (nif_lookup_hash IS NOT NULL);
CREATE INDEX idx_intervinientes_poliza ON seguros.poliza_intervinientes USING btree (poliza_id);
CREATE UNIQUE INDEX uq_intervinientes_correduria_poliza_nif_hash ON seguros.poliza_intervinientes USING btree (correduria_id, poliza_id, nif_lookup_hash) WHERE (nif_lookup_hash IS NOT NULL);
CREATE INDEX idx_poliza_merge_log_correduria ON seguros.poliza_merge_log USING btree (correduria_id);
CREATE INDEX idx_poliza_merge_log_merged ON seguros.poliza_merge_log USING btree (merged_poliza_id);
CREATE INDEX idx_poliza_merge_log_surviving ON seguros.poliza_merge_log USING btree (surviving_poliza_id);
CREATE INDEX idx_poliza_recibos_correduria ON seguros.poliza_recibos USING btree (correduria_id);
CREATE INDEX idx_poliza_recibos_poliza ON seguros.poliza_recibos USING btree (poliza_id);
CREATE UNIQUE INDEX uq_poliza_recibos_correduria_id_recibo ON seguros.poliza_recibos USING btree (correduria_id, id_recibo, codigo_entidad_dgs) WHERE (id_recibo IS NOT NULL);
CREATE INDEX idx_polizas_cliente ON seguros.polizas USING btree (cliente_id);
CREATE INDEX idx_polizas_comercial ON seguros.polizas USING btree (comercial_id) WHERE (comercial_id IS NOT NULL);
CREATE INDEX idx_polizas_correduria ON seguros.polizas USING btree (correduria_id);
CREATE INDEX idx_polizas_correduria_created ON seguros.polizas USING btree (correduria_id, created_at);
CREATE INDEX idx_polizas_correduria_import_ref ON seguros.polizas USING btree (correduria_id, import_ref);
CREATE INDEX idx_polizas_estado ON seguros.polizas USING btree (estado);
CREATE INDEX idx_polizas_merged_into ON seguros.polizas USING btree (merged_into_poliza_id) WHERE (merged_into_poliza_id IS NOT NULL);
CREATE INDEX idx_polizas_oportunidad_origen ON seguros.polizas USING btree (oportunidad_origen_id) WHERE (oportunidad_origen_id IS NOT NULL);
CREATE INDEX idx_polizas_origen ON seguros.polizas USING btree (origen);
CREATE INDEX idx_polizas_padre ON seguros.polizas USING btree (poliza_padre_id) WHERE (poliza_padre_id IS NOT NULL);
CREATE INDEX idx_polizas_vencimiento ON seguros.polizas USING btree (fecha_vencimiento);
CREATE UNIQUE INDEX uq_polizas_correduria_id_poliza_entidad ON seguros.polizas USING btree (correduria_id, id_poliza_entidad, codigo_entidad_dgs) WHERE (id_poliza_entidad IS NOT NULL);
CREATE UNIQUE INDEX uq_polizas_correduria_import_ref ON seguros.polizas USING btree (correduria_id, import_ref) WHERE (import_ref IS NOT NULL);
CREATE INDEX idx_recordatorios_cliente ON seguros.recordatorios USING btree (cliente_id);
CREATE INDEX idx_recordatorios_correduria ON seguros.recordatorios USING btree (correduria_id);
CREATE INDEX idx_recordatorios_cotizacion ON seguros.recordatorios USING btree (cotizacion_id) WHERE (cotizacion_id IS NOT NULL);
CREATE INDEX idx_recordatorios_estado ON seguros.recordatorios USING btree (estado);
CREATE INDEX idx_recordatorios_fecha ON seguros.recordatorios USING btree (fecha_programada);
CREATE INDEX idx_recordatorios_poliza ON seguros.recordatorios USING btree (poliza_id);
CREATE INDEX idx_siniestro_contrarios_correduria ON seguros.siniestro_contrarios USING btree (correduria_id);
CREATE INDEX idx_siniestro_contrarios_siniestro ON seguros.siniestro_contrarios USING btree (siniestro_id);
CREATE INDEX idx_siniestro_lesionados_correduria ON seguros.siniestro_lesionados USING btree (correduria_id);
CREATE INDEX idx_siniestro_lesionados_siniestro ON seguros.siniestro_lesionados USING btree (siniestro_id);
CREATE INDEX idx_siniestro_testigos_correduria ON seguros.siniestro_testigos USING btree (correduria_id);
CREATE INDEX idx_siniestro_testigos_siniestro ON seguros.siniestro_testigos USING btree (siniestro_id);
CREATE INDEX idx_siniestros_cliente ON seguros.siniestros USING btree (cliente_id);
CREATE INDEX idx_siniestros_correduria ON seguros.siniestros USING btree (correduria_id);
CREATE INDEX idx_siniestros_correduria_estado ON seguros.siniestros USING btree (correduria_id, estado);
CREATE INDEX idx_siniestros_poliza ON seguros.siniestros USING btree (poliza_id);
CREATE UNIQUE INDEX uq_siniestros_correduria_id_siniestro_entidad ON seguros.siniestros USING btree (correduria_id, id_siniestro_entidad, codigo_entidad_dgs) WHERE (id_siniestro_entidad IS NOT NULL);
CREATE UNIQUE INDEX idx_solicitud_cambio_documentos_blob_unique ON seguros.solicitud_cambio_documentos USING btree (blob_pathname);
CREATE INDEX idx_solicitud_cambio_documentos_cliente ON seguros.solicitud_cambio_documentos USING btree (cliente_id);
CREATE INDEX idx_solicitud_cambio_documentos_correduria_created ON seguros.solicitud_cambio_documentos USING btree (correduria_id, created_at DESC);
CREATE INDEX idx_solicitud_cambio_documentos_event ON seguros.solicitud_cambio_documentos USING btree (operational_event_id);
CREATE INDEX idx_usuarios_auth ON seguros.usuarios USING btree (auth_user_id);
CREATE INDEX idx_usuarios_correduria ON seguros.usuarios USING btree (correduria_id);
CREATE INDEX idx_usuarios_legal_version ON seguros.usuarios USING btree (last_accepted_legal_version);
CREATE INDEX idx_kb_chunks_audience ON seguros.whatsapp_kb_chunks USING btree (audience);
CREATE INDEX idx_kb_chunks_embedding_cosine ON seguros.whatsapp_kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');
CREATE UNIQUE INDEX uq_kb_chunks_file_idx ON seguros.whatsapp_kb_chunks USING btree (kb_file, chunk_idx);
CREATE INDEX idx_wa_outbound_correduria ON seguros.whatsapp_outbound_messages USING btree (correduria_id, created_at);
CREATE UNIQUE INDEX uq_wa_outbound_idempotency ON seguros.whatsapp_outbound_messages USING btree (idempotency_key);
