-- 2026-10-14 — Eventos de correo de compañías (siniestro, pre-anulación, impago, anulación, suplemento).
--
-- El triaje de correo de plataforma lee los avisos de las compañías (`leerCorreoEventoAseguradora` de
-- @central/module-seguros) y los manda a `POST /api/operador/correo/evento`. Esta tabla guarda UNA fila
-- por correo + tipo + elemento (nº de siniestro, póliza/recibo o póliza) con lo que se hizo:
--   · aplicado        — nota/tarea/siniestro escritos en la cartera;
--   · duplicado_cima  — CIMA ya lo sabía (siniestro de CIMA, póliza ya no vigente): solo nota o nada;
--   · sin_resolver    — la póliza no casa (o casa con dos): NO se toca la cartera; sale en la bandeja
--                       «Correos de compañía» de Mi mesa y en la cola de avisos;
--   · procesando      — reservada y sin desenlace confirmado (un fallo a mitad): se mira a mano, no se
--                       reintenta sola (reintentar podría duplicar un siniestro).
--
-- Idempotencia: el triaje RELEE correos; la llave única (correduría, Message-ID, tipo, clave) hace que
-- el segundo intento devuelva lo que ya se hizo sin escribir nada.
--
-- Sin datos personales: ni IBAN ni NIF ni nombres (el lector ya los quita y el puerto vuelve a pasar
-- `sinDatosSensibles`). `detalle` guarda el elemento leído tal cual (nº, fechas, importe, acción).
--
-- ADITIVA: tabla nueva. Código ANTES que el SQL: sin la tabla, el puerto responde 503 `sin_migracion`
-- (el triaje sigue con su nota de siempre) y la cola de avisos sale como «no se ha podido comprobar».
--
-- Reversible: DROP TABLE seguros.correo_evento_entrante;

CREATE TABLE IF NOT EXISTS seguros.correo_evento_entrante (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL,
  mensaje_id         text NOT NULL CHECK (mensaje_id <> '' AND char_length(mensaje_id) <= 300),
  tipo               text NOT NULL CHECK (tipo IN ('siniestro', 'pre_anulacion', 'impago', 'anulacion', 'suplemento')),
  subtipo            text CHECK (subtipo IS NULL OR subtipo IN ('apertura', 'actualizacion', 'cierre')),
  -- Nº de siniestro, «póliza/recibo», o nº de póliza: lo que distingue el elemento dentro del correo.
  clave              text NOT NULL CHECK (clave <> '' AND char_length(clave) <= 100),
  compania           text NOT NULL,
  codigo_entidad_dgs varchar(16) NOT NULL,
  numero_poliza      text,
  estado             text NOT NULL DEFAULT 'procesando'
                       CHECK (estado IN ('aplicado', 'duplicado_cima', 'sin_resolver', 'procesando')),
  -- Por qué no se aplicó / qué se sabía ya.
  motivo             text,
  -- Lo que se hizo, en corto («tarea creada, vence 15/10/2026»).
  resumen            text,
  -- Una tarea por póliza/recibo (`claveTareaDe`): la siguiente fila de esa clave no crea otra.
  clave_tarea        text,
  poliza_id          uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,
  cliente_id         uuid,
  siniestro_id       uuid,
  gestion_id         uuid,
  fecha_limite       date,
  importe            numeric(12, 2),
  detalle            jsonb,
  -- Para cuando Alberto la dé por mirada desde la bandeja (aún sin botón).
  revisado_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correo_evento_entrante_unico UNIQUE (correduria_id, mensaje_id, tipo, clave)
);

CREATE INDEX IF NOT EXISTS correo_evento_entrante_reciente
  ON seguros.correo_evento_entrante (correduria_id, created_at DESC);
CREATE INDEX IF NOT EXISTS correo_evento_entrante_tarea
  ON seguros.correo_evento_entrante (correduria_id, clave_tarea) WHERE clave_tarea IS NOT NULL;

ALTER TABLE seguros.correo_evento_entrante ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON seguros.correo_evento_entrante TO prisma_seguros;

COMMENT ON TABLE seguros.correo_evento_entrante IS
  'Avisos de compañías leídos del correo por el triaje (14/10/2026) y lo que se hizo con cada uno. Sin IBAN/NIF/nombres.';
