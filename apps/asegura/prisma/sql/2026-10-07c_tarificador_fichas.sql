-- Fichas de producto y coberturas del tarificador (07/10/2026). Base del comparador multi-compañía.
--
-- El bot RPA guarda el PDF del proyecto de la compañía (`documentos`, id en `tarificaciones.respuesta
-- ->> 'proyectoDocumentoId'`). «Extraer coberturas» lee ese PDF, la IA mapea el condicionado al catálogo
-- de `@central/module-tarificacion` (fichas-catalogo.ts) con CITA literal, y el código VALIDA cada valor
-- contra el texto (lo que no está escrito → null + aviso). Resultado:
--   · `tarificador_fichas`: las CONDICIONES DEL PRODUCTO por (compañía, ramo, producto, versión). Nace
--     `pendiente`; Alberto la revisa y la VALIDA en plataforma (/correduria/tarificador/fichas). Validada,
--     los presupuestos siguientes del mismo producto ya no la reescriben: solo comprueban que el condicionado
--     no cambió (huella + citas que siguen en el PDF nuevo).
--   · `tarificador_coberturas_presupuesto`: los valores propios de ESE proyecto (capitales, franquicia
--     elegida, prima), uno por tarificación.
--
-- ⚠️ APLICADA en producción el 06/10/2026 (migraciones tarificador_fichas_2026_10_07c).
--
-- Sin PII: el condicionado de un producto no lleva datos del tomador; las citas del presupuesto son filas
-- de capitales/prima. Aun así, solo `prisma_seguros` (la app). Ni `crm_seguros` ni el portal.
--
-- Idempotente (IF NOT EXISTS). Se deshace con:
--   DROP TABLE seguros.tarificador_coberturas_presupuesto, seguros.tarificador_fichas;
BEGIN;

SET search_path = seguros, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Ficha de producto (condiciones del condicionado)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_fichas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id             uuid NOT NULL REFERENCES seguros.corredurias (id),
  compania                  text NOT NULL CHECK (length(compania) BETWEEN 1 AND 120),
  ramo                      text NOT NULL CHECK (ramo ~ '^[a-z_]{1,40}$'),
  producto                  text NOT NULL CHECK (length(producto) BETWEEN 1 AND 160),
  -- NULL = el PDF no dice versión del condicionado (no se inventa).
  version                   text CHECK (version IS NULL OR length(version) BETWEEN 1 AND 80),
  -- `claveProducto()` del paquete: compañía|ramo|producto|versión normalizados. Identidad de la ficha.
  clave_producto            text NOT NULL CHECK (length(clave_producto) BETWEEN 3 AND 400),
  estado                    text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'validada')),
  -- CondicionesProducto: { garantias: { clave: CondicionGarantia }, extras: [...] }. Clave ausente = no leída.
  condiciones               jsonb NOT NULL DEFAULT '{"garantias": {}, "extras": []}'::jsonb,
  -- `huellaCondicionado()` (FNV-1a 64 de las citas). NULL = sin citas todavía.
  huella                    text CHECK (huella IS NULL OR huella ~ '^[0-9a-f]{16}$'),
  avisos                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  origen_tarificacion_id    uuid REFERENCES seguros.tarificaciones (id),
  origen_documento_id       uuid REFERENCES seguros.documentos (id),
  validada_por              text CHECK (validada_por IS NULL OR length(validada_por) <= 200),
  validada_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarificador_fichas_unica UNIQUE (correduria_id, clave_producto),
  CONSTRAINT tarificador_fichas_validada_con_firma CHECK (estado <> 'validada' OR (validada_at IS NOT NULL AND validada_por IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS tarificador_fichas_lista
  ON seguros.tarificador_fichas (correduria_id, ramo, updated_at DESC);

COMMENT ON TABLE seguros.tarificador_fichas IS
  'Ficha de producto del tarificador: condiciones del condicionado por compañía/ramo/producto/versión, cada '
  'valor con su cita literal del PDF y validado por código. pendiente → validada (Alberto en plataforma).';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Valores de cada presupuesto (capitales, franquicia elegida, prima)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_coberturas_presupuesto (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id          uuid NOT NULL REFERENCES seguros.corredurias (id),
  tarificacion_id        uuid NOT NULL REFERENCES seguros.tarificaciones (id),
  documento_id           uuid REFERENCES seguros.documentos (id),
  ficha_id               uuid REFERENCES seguros.tarificador_fichas (id),
  -- ValoresPresupuesto. Todo con cita; lo no validado no está (no consta).
  valores                jsonb NOT NULL DEFAULT '{}'::jsonb,
  avisos                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- false = el PDF no tiene capa de texto (escaneo): no se ha leído nada, y se dice.
  texto_legible          boolean NOT NULL,
  -- Solo con ficha VALIDADA: ¿siguen las citas del condicionado en este PDF? NULL = no comprobado.
  condicionado_cambiado  boolean,
  citas_ausentes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  extraido_por           text CHECK (extraido_por IS NULL OR length(extraido_por) <= 200),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarificador_coberturas_presupuesto_unico UNIQUE (tarificacion_id)
);

CREATE INDEX IF NOT EXISTS tarificador_coberturas_presupuesto_por_ficha
  ON seguros.tarificador_coberturas_presupuesto (ficha_id);
CREATE INDEX IF NOT EXISTS tarificador_coberturas_presupuesto_por_correduria
  ON seguros.tarificador_coberturas_presupuesto (correduria_id, updated_at DESC);

COMMENT ON TABLE seguros.tarificador_coberturas_presupuesto IS
  'Valores propios de un proyecto tarificado (capitales, franquicia elegida, prima) leídos del PDF con cita y '
  'validados por código, y si el condicionado cambió respecto de la ficha validada.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Permisos (el schema tiene default privileges `prisma_seguros=arwd`: se quita DELETE a mano,
--    lección de 2026-10-06c)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificador_fichas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_coberturas_presupuesto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_fichas, seguros.tarificador_coberturas_presupuesto
  FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_fichas, seguros.tarificador_coberturas_presupuesto TO prisma_seguros;
-- Sin DELETE: una ficha validada es el criterio con el que se compara; se corrige, no se borra.
REVOKE DELETE, TRUNCATE ON seguros.tarificador_fichas, seguros.tarificador_coberturas_presupuesto FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select count(*) from seguros.tarificador_fichas;                  -- 0
--   select count(*) from seguros.tarificador_coberturas_presupuesto;  -- 0
--   select privilege_type from information_schema.role_table_grants
--    where grantee = 'prisma_seguros' and table_name like 'tarificador_%fich%';  -- SELECT, INSERT, UPDATE
-- ════════════════════════════════════════════════════════════════════════════
