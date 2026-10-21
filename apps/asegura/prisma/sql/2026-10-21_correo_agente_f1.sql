-- 2026-10-21 — F1 del agente corredor de correo (docs/CORREDURIA-AGENTE-CORREO.md §4.1, §4.2, §4.3, §4.8, §7).
-- SIN APLICAR: lo aplica Alberto.
--
-- Qué añade (todo ADITIVO e idempotente):
--   1. `seguros.documentos` acepta los PDF adjuntos de los correos de compañía:
--        · `subido_por = 'correo'` (nuevo valor del CHECK);
--        · `mensaje_id` (Message-ID del correo: rastro y dedupe);
--        · un documento de correo puede quedar SIN colgar de nada (pendiente de asignar en la bandeja «Correos de
--          compañía»): el CHECK `documentos_colgado_de_algo` se relaja SOLO para `subido_por = 'correo'`;
--        · dedupe: el MISMO fichero (sha256) del correo, una vez por cliente + póliza (NULL de cada uno = UUID cero).
--   2. `seguros.solicitud_compania`: una fila por (correduría, compañía DGS, nº de solicitud) con su estado normalizado,
--      el literal de la compañía, la póliza emitida y la oportunidad. Los hitos son las filas de `correo_evento_entrante`
--      (columna nueva `solicitud_id`).
--   3. `seguros.correo_cruce_aviso`: idempotencia de los avisos de cruce con CIMA (emitida y CIMA no la trae, anulación
--      que CIMA no refleja, devolución sin recibo, enlace ambiguo póliza↔oportunidad). Un aviso por clave; se marca
--      `avisado_at` SOLO cuando el Telegram salió.
--
-- Orden: el CÓDIGO va antes que el SQL. Sin esta migración:
--   · alta de documento desde correo → 503 `sin_migracion` (el triaje lo cuenta y sigue; no se guarda nada);
--   · la solicitud sigue como hasta hoy (el seguimiento en `solicitud_compania` se salta, sin error);
--   · el cruce con CIMA → 503 `sin_migracion` (no se avisa de nada y se dice).
--
-- Sin datos personales nuevos: ni nombres ni NIF ni IBAN en estas tablas (el literal de la compañía pasa por
-- `sinDatosSensibles` antes de guardarse, como en `correo_evento_entrante`).
--
-- Reversible (si no hay filas de correo):
--   DROP TABLE IF EXISTS seguros.correo_cruce_aviso;
--   ALTER TABLE seguros.correo_evento_entrante DROP COLUMN IF EXISTS solicitud_id;
--   DROP TABLE IF EXISTS seguros.solicitud_compania;
--   DROP INDEX IF EXISTS seguros.documentos_correo_unico;
--   ALTER TABLE seguros.documentos DROP COLUMN IF EXISTS mensaje_id;
--   (y los dos CHECK de `documentos` como estaban: `documentos_subido_por` sin 'correo' y
--    `documentos_colgado_de_algo` como lo dejó 2026-10-07b_tarificador_grabaciones.sql — con portal_parte_id y
--    tarificador_grabacion_id —, NO el de 2026-09-02, que hoy violan filas reales)

BEGIN;

-- ── 1. documentos ────────────────────────────────────────────────────────────

ALTER TABLE seguros.documentos ADD COLUMN IF NOT EXISTS mensaje_id text;

DO $$ BEGIN
  ALTER TABLE seguros.documentos ADD CONSTRAINT documentos_mensaje_id_ck
    CHECK (mensaje_id IS NULL OR (mensaje_id <> '' AND char_length(mensaje_id) <= 300));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE seguros.documentos DROP CONSTRAINT IF EXISTS documentos_subido_por;
ALTER TABLE seguros.documentos ADD CONSTRAINT documentos_subido_por
  CHECK (subido_por IN ('corredor', 'cliente', 'agente', 'correo'));

-- Un documento de correo sin resolver no cuelga de nada (bandeja «pendiente de asignar»); TODO lo demás, como siempre.
ALTER TABLE seguros.documentos DROP CONSTRAINT IF EXISTS documentos_colgado_de_algo;
-- Parte del CHECK VIGENTE (2026-10-07b_tarificador_grabaciones.sql), no del de 2026-09-02: conserva TODOS sus OR
-- (portal_parte_id y tarificador_grabacion_id incluidos; hay filas reales que solo cuelgan de ellos).
ALTER TABLE seguros.documentos ADD CONSTRAINT documentos_colgado_de_algo CHECK (
  cliente_id IS NOT NULL
  OR poliza_id IS NOT NULL
  OR siniestro_id IS NOT NULL
  OR portal_parte_id IS NOT NULL
  OR tarificador_grabacion_id IS NOT NULL
  OR (subido_por = 'correo' AND mensaje_id IS NOT NULL)
);

-- Mismo PDF del correo dos veces (el triaje relee, o la compañía lo reenvía) → una fila por cliente + póliza. El cliente
-- va en la clave: el MISMO PDF genérico (condiciones generales…) de dos clientes distintos son dos filas, no una.
CREATE UNIQUE INDEX IF NOT EXISTS documentos_correo_unico
  ON seguros.documentos (correduria_id, sha256,
                         coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         coalesce(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE subido_por = 'correo' AND sha256 IS NOT NULL;

-- La bandeja lee los pendientes de asignar.
CREATE INDEX IF NOT EXISTS documentos_correo_sin_asignar
  ON seguros.documentos (correduria_id, created_at DESC)
  WHERE subido_por = 'correo' AND cliente_id IS NULL AND poliza_id IS NULL AND siniestro_id IS NULL;

COMMENT ON COLUMN seguros.documentos.mensaje_id IS
  'F1 agente de correo (2026-10-21): Message-ID del correo de compañía del que salió el adjunto (subido_por = correo).';

-- ── 2. solicitud_compania ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seguros.solicitud_compania (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL,
  -- Clave de la compañía de los eventos (`occident`…) y su código DGS: el nº de solicitud solo es único DENTRO de ella.
  compania           text NOT NULL CHECK (compania IN ('occident', 'reale', 'mapfre', 'allianz')),
  codigo_entidad_dgs varchar(16) NOT NULL CHECK (codigo_entidad_dgs <> ''),
  numero_solicitud   text NOT NULL CHECK (numero_solicitud ~ '^[1-9][0-9]{5,11}$'),
  -- Nº de la póliza EMITIDA según el correo (informativo: la póliza la trae CIMA). NULL = aún no consta.
  numero_poliza      text CHECK (numero_poliza IS NULL OR char_length(numero_poliza) <= 100),
  oportunidad_id     uuid REFERENCES seguros.oportunidades (id) ON DELETE SET NULL,
  -- La póliza de CIMA cuando llega y casa por nº (`decidirEnlacesPolizaOportunidad`).
  poliza_id          uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,
  ramo               text CHECK (ramo IS NULL OR char_length(ramo) <= 60),
  -- Estado normalizado; NULL = la plantilla no se reconoció (no es «presentada»).
  estado             text CHECK (estado IS NULL OR estado IN ('presentada', 'pte_documentacion', 'pte_autorizacion', 'aceptada', 'emitida', 'rechazada', 'cerrada')),
  -- Literal de la compañía (pasado por `sinDatosSensibles`).
  estado_compania    text CHECK (estado_compania IS NULL OR char_length(estado_compania) <= 200),
  -- Fecha del correo que dio ese estado: un correo más antiguo no lo pisa.
  estado_at          timestamptz,
  cerrada_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitud_compania_unica UNIQUE (correduria_id, codigo_entidad_dgs, numero_solicitud)
);

CREATE INDEX IF NOT EXISTS solicitud_compania_poliza_pendiente
  ON seguros.solicitud_compania (correduria_id, codigo_entidad_dgs, numero_poliza)
  WHERE numero_poliza IS NOT NULL AND poliza_id IS NULL;
CREATE INDEX IF NOT EXISTS solicitud_compania_oportunidad
  ON seguros.solicitud_compania (oportunidad_id) WHERE oportunidad_id IS NOT NULL;

ALTER TABLE seguros.solicitud_compania ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE seguros.solicitud_compania IS
  'F1 agente de correo (2026-10-21): seguimiento de una solicitud en la compañía (una fila por compañía + nº). Los hitos son filas de correo_evento_entrante (solicitud_id). Sin nombres ni NIF.';

ALTER TABLE seguros.correo_evento_entrante ADD COLUMN IF NOT EXISTS solicitud_id uuid
  REFERENCES seguros.solicitud_compania (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS correo_evento_entrante_solicitud
  ON seguros.correo_evento_entrante (solicitud_id) WHERE solicitud_id IS NOT NULL;

-- ── 3. correo_cruce_aviso ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seguros.correo_cruce_aviso (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('emision_sin_cima', 'anulacion_sin_cima', 'devolucion_sin_recibo', 'enlace_ambiguo')),
  -- `<tipo>:<id de lo avisado>` (evento, devolución o póliza): el mismo hecho no se avisa dos veces.
  clave         text NOT NULL CHECK (clave <> '' AND char_length(clave) <= 200),
  -- Lo que dice el aviso, ya compuesto y SIN datos personales (compañía, nº de póliza/solicitud, días).
  texto         text NOT NULL CHECK (char_length(texto) <= 600),
  cliente_id    uuid,
  -- NULL = aún no ha salido el Telegram: la pasada siguiente lo vuelve a intentar.
  avisado_at    timestamptz,
  -- Reclamo atómico de la pasada que va a mandarlo: dos pasadas solapadas no mandan el mismo Telegram. Un reclamo sin
  -- `avisado_at` caduca a los 15 min (la pasada murió) y otra lo coge.
  reclamado_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correo_cruce_aviso_unico UNIQUE (correduria_id, clave)
);

ALTER TABLE seguros.correo_cruce_aviso ADD COLUMN IF NOT EXISTS reclamado_at timestamptz;

CREATE INDEX IF NOT EXISTS correo_cruce_aviso_pendiente
  ON seguros.correo_cruce_aviso (correduria_id, created_at) WHERE avisado_at IS NULL;

ALTER TABLE seguros.correo_cruce_aviso ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE seguros.correo_cruce_aviso IS
  'F1 agente de correo (2026-10-21): avisos de cruce correo↔CIMA, uno por clave; avisado_at solo cuando el Telegram salió.';

-- ── 4. Permisos (patrón de 2026-10-07b) ──────────────────────────────────────
-- Solo `prisma_seguros` (la app), sin DELETE: el schema tiene default privileges `arwd`, así que se REVOCA explícitamente
-- (lección de 2026-10-06c). Ni `crm_seguros` (la ingesta de CIMA de Manuel) ni el portal ni anon/authenticated.
REVOKE ALL ON seguros.solicitud_compania, seguros.correo_cruce_aviso
  FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.solicitud_compania TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.correo_cruce_aviso TO prisma_seguros;
REVOKE DELETE, TRUNCATE ON seguros.solicitud_compania, seguros.correo_cruce_aviso FROM prisma_seguros;

COMMIT;

-- Verificación tras aplicar:
--   select has_table_privilege('prisma_seguros', 'seguros.solicitud_compania', 'DELETE');  -- f
--   select has_table_privilege('prisma_seguros', 'seguros.correo_cruce_aviso', 'DELETE');  -- f
--   select has_table_privilege('crm_seguros',    'seguros.solicitud_compania', 'SELECT');  -- f
--   select has_table_privilege('crm_seguros',    'seguros.correo_cruce_aviso', 'SELECT');  -- f
