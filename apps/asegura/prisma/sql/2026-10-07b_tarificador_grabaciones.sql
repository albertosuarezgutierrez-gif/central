-- GRABADOR del tarificador RPA (07/10/2026). Para dar de alta una compañía/ramo nueva en el bot sin ir a
-- ciegas: Alberto hace un presupuesto FICTICIO a mano en el portal y, en cada pantalla, pulsa el marcador
-- «Grabar pantalla ASegura» (bookmarklet de @central/module-tarificacion, grabador-bookmarklet.ts). El
-- bookmarklet descarga el HTML (con los marcos del mismo origen) YA REDACTADO; Alberto sube los ficheros
-- en orden desde plataforma (/correduria/tarificador/grabaciones) y asegura los vuelve a redactar antes de
-- guardarlos en `seguros.documentos`. El botón «Analizar» pide a la IA un MAPA por pantalla (campos,
-- botones seguro/PROHIBIDO, dónde salen las primas) que Alberto valida a mano.
--
-- 🚨 TARIFICAR ≠ EMITIR: nada de esto pulsa nada en ningún portal. El mapa es documentación; un botón que
--    casa con el patrón de emisión sale PROHIBIDO aunque la IA diga otra cosa (`validarPantallaMapa`).
--
-- ⚠️ NO APLICADA. Las rutas `/api/operador/tarificador/grabaciones*` responden 503 `tabla_sin_crear` con
--    un mensaje claro mientras no se aplique; nada más depende de ella.
--
-- Qué hace (una transacción; idempotente):
--   1. `tarificador_grabaciones`: la grabación (compañía, ramo, producto, nota) + el mapa (jsonb) y su
--      validación humana + el contador de llamadas a la IA (tope por grabación).
--   2. `tarificador_grabacion_pantallas`: cada fichero subido, en orden, apuntando a `seguros.documentos`.
--   3. `seguros.documentos.tarificador_grabacion_id` (columna NUEVA, nullable) y se AMPLÍA
--      `documentos_colgado_de_algo` con ese quinto sitio del que colgar (se mantienen los cuatro de antes,
--      incluido `portal_parte_id` de apps/asegura-portal/prisma/sql/2026-09-03_documentos_adjuntos_parte.sql).
--   4. Permisos: solo `prisma_seguros` (la app), sin DELETE (el schema tiene default privileges `arwd`:
--      se REVOCA explícitamente, lección de 2026-10-06c). Ni `crm_seguros` ni el portal.
--
-- Sin PII: el HTML va redactado dos veces (navegador + servidor: contraseñas, ocultos, DNI/NIE/CIF, IBAN,
-- correo, teléfono); el mapa no lleva valores de campos.
--
-- Se deshace con:
--   ALTER TABLE seguros.documentos DROP CONSTRAINT documentos_colgado_de_algo;
--   ALTER TABLE seguros.documentos ADD CONSTRAINT documentos_colgado_de_algo CHECK (cliente_id IS NOT NULL
--     OR poliza_id IS NOT NULL OR siniestro_id IS NOT NULL OR portal_parte_id IS NOT NULL);  -- (antes, borrar
--     los documentos de grabaciones)
--   ALTER TABLE seguros.documentos DROP COLUMN tarificador_grabacion_id;
--   DROP TABLE seguros.tarificador_grabacion_pantallas, seguros.tarificador_grabaciones;
BEGIN;

SET search_path = seguros, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. La grabación
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_grabaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  compania        text NOT NULL CHECK (length(compania) BETWEEN 1 AND 80),
  ramo            text NOT NULL CHECK (length(ramo) BETWEEN 1 AND 80),
  producto        text CHECK (producto IS NULL OR length(producto) <= 120),
  nota            text CHECK (nota IS NULL OR length(nota) <= 2000),
  -- {version: 1, pantallas: PantallaMapa[]} validado por `validarPantallaMapa`. NULL = sin analizar.
  mapa            jsonb CHECK (mapa IS NULL OR jsonb_typeof(mapa) = 'object'),
  -- Validación HUMANA del mapa (Alberto). Un análisis nuevo la quita.
  mapa_validado   boolean NOT NULL DEFAULT false,
  validado_por    text CHECK (validado_por IS NULL OR length(validado_por) <= 200),
  validado_at     timestamptz,
  -- Tope de coste: llamadas a la IA hechas para ESTA grabación (`TARIFICADOR_GRABADOR_MAX_LLAMADAS`).
  llamadas_ia     integer NOT NULL DEFAULT 0 CHECK (llamadas_ia >= 0),
  -- Euros estimados (orientativo; el coste real está en `ai_usos`).
  coste_estimado  numeric(10, 6) NOT NULL DEFAULT 0 CHECK (coste_estimado >= 0),
  creado_por      text NOT NULL CHECK (length(creado_por) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tarificador_grabaciones_por_correduria
  ON seguros.tarificador_grabaciones (correduria_id, created_at DESC);

COMMENT ON TABLE seguros.tarificador_grabaciones IS
  'Grabador del tarificador RPA: pantallas de un presupuesto ficticio hecho a mano en el portal de una '
  'compañía/ramo, y el mapa (campos, botones seguro/PROHIBIDO, primas) que la IA saca de ellas y Alberto valida.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Las pantallas (ficheros), en orden
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_grabacion_pantallas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id    uuid NOT NULL REFERENCES seguros.corredurias (id),
  grabacion_id     uuid NOT NULL REFERENCES seguros.tarificador_grabaciones (id),
  orden            integer NOT NULL CHECK (orden BETWEEN 1 AND 40),
  documento_id     uuid NOT NULL REFERENCES seguros.documentos (id),
  nombre_fichero   text NOT NULL CHECK (length(nombre_fichero) BETWEEN 1 AND 200),
  size_bytes       integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4 * 1024 * 1024),
  analisis_estado  text NOT NULL DEFAULT 'pendiente' CHECK (analisis_estado IN ('pendiente', 'ok', 'error')),
  analisis_error   text CHECK (analisis_error IS NULL OR length(analisis_error) <= 1000),
  analizada_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarificador_grabacion_pantallas_orden UNIQUE (grabacion_id, orden)
);

COMMENT ON TABLE seguros.tarificador_grabacion_pantallas IS
  'Cada HTML (redactado) subido a una grabación del tarificador RPA, en orden. El fichero vive en seguros.documentos.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. seguros.documentos: un quinto sitio del que colgar
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.documentos
  ADD COLUMN IF NOT EXISTS tarificador_grabacion_id uuid REFERENCES seguros.tarificador_grabaciones (id);

CREATE INDEX IF NOT EXISTS documentos_tarificador_grabacion_idx
  ON seguros.documentos (tarificador_grabacion_id) WHERE tarificador_grabacion_id IS NOT NULL;

ALTER TABLE seguros.documentos DROP CONSTRAINT IF EXISTS documentos_colgado_de_algo;
ALTER TABLE seguros.documentos ADD CONSTRAINT documentos_colgado_de_algo CHECK (
  cliente_id IS NOT NULL
  OR poliza_id IS NOT NULL
  OR siniestro_id IS NOT NULL
  OR portal_parte_id IS NOT NULL
  OR tarificador_grabacion_id IS NOT NULL
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Permisos
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificador_grabaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_grabacion_pantallas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_grabaciones, seguros.tarificador_grabacion_pantallas
  FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_grabaciones TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_grabacion_pantallas TO prisma_seguros;
-- Default privileges del schema dan DELETE a la app al crear: fuera (el rastro no se borra desde la app).
REVOKE DELETE, TRUNCATE ON seguros.tarificador_grabaciones, seguros.tarificador_grabacion_pantallas FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select count(*) from seguros.tarificador_grabaciones;            -- 0
--   select count(*) from seguros.tarificador_grabacion_pantallas;    -- 0
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'documentos_colgado_de_algo';
--     -- … OR (tarificador_grabacion_id IS NOT NULL)
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_grabaciones', 'DELETE');  -- f
-- ════════════════════════════════════════════════════════════════════════════
