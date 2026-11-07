-- Seguro obligatorio por convenio (07/11/2026). ADITIVA e idempotente. NO aplicada a la BD real desde el código.
-- Muchos convenios (hostelería, construcción, transporte…) obligan a la empresa a tener una póliza de accidentes/vida
-- para su plantilla: muerte e incapacidad permanente con un capital fijo. La obligación la mete A MANO el responsable,
-- con su artículo y su enlace al BOE/boletín (sin fuente no se guarda). Importes en CÉNTIMOS.
--
-- 🚨 Tres estados en la cobertura (`seguro_estado`): NULL = NO SE SABE (nadie ha contestado) ≠ 'no_cubierto' (la empresa
--    ha dicho que no lo tiene) ≠ 'cubierto' (con su aseguradora; nº de póliza y vencimiento NULL = no se sabe).
--    La cobertura vive en la FILA de la obligación (no en `empresas`): una empresa puede tener dos obligaciones (accidentes
--    y vida) y estar cubierta en una sí y en otra no. La tabla ya es por empresa, así que es «lo que dice la empresa».
-- 🚨 Aplicar ANTES de desplegar el código: sin estas tablas el Inicio dice «no se ha podido comprobar» y la pantalla da 500.

-- 1) Obligación del convenio.
CREATE TABLE IF NOT EXISTS rrhh.convenio_seguros_obligatorios (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid        NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  convenio              text        NOT NULL CHECK (length(btrim(convenio)) BETWEEN 1 AND 200),
  tipo                  text        NOT NULL CHECK (tipo IN ('accidentes', 'vida', 'otro')),
  -- Contingencias cubiertas: al menos una, sin repetir, del catálogo cerrado.
  contingencias         text[]      NOT NULL CHECK (
                          cardinality(contingencias) BETWEEN 1 AND 4
                          AND contingencias <@ ARRAY['muerte', 'ip_total', 'ip_absoluta', 'gran_invalidez']::text[]),
  capital_cent          bigint      NOT NULL CHECK (capital_cent > 0 AND capital_cent <= 100000000000),
  -- Ámbito: 'todas' las categorías (categorias NULL) o 'algunas' (lista no vacía).
  ambito                text        NOT NULL CHECK (ambito IN ('todas', 'algunas')),
  categorias            text[],
  articulo              text        NOT NULL CHECK (length(btrim(articulo)) BETWEEN 1 AND 200),
  fuente_url            text        NOT NULL CHECK (fuente_url ~ '^https://[^\s]+$' AND length(fuente_url) <= 1000),
  vigente_desde         date        NOT NULL,
  -- NULL = sin fin conocido (no «para siempre»: el convenio se renegociará).
  vigente_hasta         date,
  -- Cobertura que declara la empresa (ver cabecera). NULL = no se sabe.
  seguro_estado         text        CHECK (seguro_estado IS NULL OR seguro_estado IN ('cubierto', 'no_cubierto')),
  seguro_aseguradora    text        CHECK (seguro_aseguradora IS NULL OR length(btrim(seguro_aseguradora)) BETWEEN 1 AND 200),
  seguro_poliza         text        CHECK (seguro_poliza IS NULL OR length(btrim(seguro_poliza)) BETWEEN 1 AND 100),
  seguro_vencimiento    date,
  seguro_estado_at      timestamptz,
  seguro_estado_por     text,
  creada_por            text,
  creada_at             timestamptz NOT NULL DEFAULT now(),
  actualizada_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convenio_seguros_ambito_ck CHECK (
    (ambito = 'todas' AND categorias IS NULL) OR (ambito = 'algunas' AND cardinality(categorias) BETWEEN 1 AND 50)),
  CONSTRAINT convenio_seguros_vigencia_ck CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  -- 'cubierto' exige aseguradora; sin 'cubierto' no hay datos de póliza (no se arrastran de un «sí» anterior).
  CONSTRAINT convenio_seguros_cubierto_ck CHECK (
    (seguro_estado = 'cubierto' AND seguro_aseguradora IS NOT NULL)
    OR (seguro_estado IS DISTINCT FROM 'cubierto' AND seguro_aseguradora IS NULL AND seguro_poliza IS NULL AND seguro_vencimiento IS NULL)),
  CONSTRAINT convenio_seguros_estado_at_ck CHECK (seguro_estado IS NULL OR seguro_estado_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS convenio_seguros_empresa_idx ON rrhh.convenio_seguros_obligatorios (empresa_id);
ALTER TABLE rrhh.convenio_seguros_obligatorios ENABLE ROW LEVEL SECURITY;

-- 1b) «Revisado: mi convenio NO obliga a ningún seguro» (el estado [] de la regla de tres estados). NULL = no se sabe (nadie lo
--     ha revisado; la ausencia de filas en la tabla de arriba NO significa que el convenio no obligue). Se borra al registrar una
--     obligación. Sin columna en el modelo Prisma de `empresas` a propósito: se lee por SQL y así un despliegue antes de aplicar
--     esta migración no rompe los `prisma.empresas.*` que leen todas las columnas.
ALTER TABLE rrhh.empresas
  ADD COLUMN IF NOT EXISTS convenio_sin_seguro_at  timestamptz,
  ADD COLUMN IF NOT EXISTS convenio_sin_seguro_por text;

-- 2) Peticiones de revisión a la correduría (Grupo ASegura). Registro de QUIÉN lo pidió, CUÁNDO y con QUÉ texto de
--    consentimiento (RGPD: prueba del consentimiento) y del resultado del alta del lead en plataforma. Sin datos de contacto
--    (nombre/teléfono/correo viajan al lead y no se copian aquí). Contra el doble lead: un solo 'enviando'/'enviado'/
--    'incierto' por obligación (índice único parcial); un 'error'/'rechazado' permite reintentar. 'incierto' = timeout/5xx:
--    no se sabe si llegó; solo se libera a mano tras 24 h (o el operador la pone en 'error').
CREATE TABLE IF NOT EXISTS rrhh.leads_correduria (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid        NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  obligacion_id            uuid        REFERENCES rrhh.convenio_seguros_obligatorios(id) ON DELETE SET NULL,
  usuario_id               uuid        NOT NULL,
  consentimiento_version   text        NOT NULL CHECK (length(consentimiento_version) BETWEEN 1 AND 100),
  consentimiento_at        timestamptz NOT NULL,
  -- Lo que se pidió revisar (convenio, capital, afectados), sin datos personales.
  resumen                  text        NOT NULL CHECK (length(resumen) <= 1000),
  estado                   text        NOT NULL CHECK (estado IN ('enviando', 'enviado', 'incierto', 'error', 'rechazado')),
  detalle                  text        CHECK (detalle IS NULL OR length(detalle) <= 300),
  creada_at                timestamptz NOT NULL DEFAULT now(),
  actualizada_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_correduria_vivo
  ON rrhh.leads_correduria (empresa_id, obligacion_id) WHERE estado IN ('enviando', 'enviado', 'incierto');
CREATE INDEX IF NOT EXISTS leads_correduria_empresa_idx ON rrhh.leads_correduria (empresa_id);
ALTER TABLE rrhh.leads_correduria ENABLE ROW LEVEL SECURITY;

-- 3) Permisos de rrhh_app. 🚨 El default ACL del schema `rrhh` le da TODO en cada tabla nueva: REVOKE ALL + GRANT exacto
--    (regla de apps/rrhh/CLAUDE.md, cepo lib/permisos-rrhh-app-migracion.test.ts).
REVOKE ALL ON rrhh.convenio_seguros_obligatorios FROM rrhh_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.convenio_seguros_obligatorios TO rrhh_app;
-- leads_correduria: histórico inborrable; UPDATE solo del resultado del envío.
REVOKE ALL ON rrhh.leads_correduria FROM rrhh_app;
GRANT SELECT, INSERT ON rrhh.leads_correduria TO rrhh_app;
GRANT UPDATE (estado, detalle, actualizada_at) ON rrhh.leads_correduria TO rrhh_app;
