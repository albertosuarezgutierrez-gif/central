-- Tarificador RPA (13/10/2026): MEMORIA de elecciones («que el bot vaya aprendiendo para usar la IA cada vez menos»).
--
-- ⚠️ NO APLICADA. El código que la nombra (`lib/tarificador-memoria.ts`) es fail-soft: SIN esta tabla leer devuelve
--    «no se sabe» (se pregunta a la IA, como antes) y guardar no hace nada. Se puede aplicar antes o después del deploy.
--    Requiere 2026-10-05_tarificador_rpa.sql (seguros.corredurias existe desde siempre).
--
-- Qué guarda: por (correduría, compañía, ramo, tipo de lista, clave del VEHÍCULO) el código de catálogo que se eligió.
--   · `clave_normalizada` = MARCA|MODELO|CLASE|CC|DESCRIPCION (mayúsculas, sin tildes, espacios colapsados), de la
--     lista blanca `contextoEleccionVersion` (`@central/module-tarificacion`). El ramo va en su columna.
--   · `origen` 'humano' (bandeja «Reintentar» con versión) gana a 'ia'. La IA solo enseña cuando el trabajo termina
--     `ok` con tarificación, nunca al elegir. Una versión de memoria que vuelve a pedir versión se BORRA.
--   · `confirmaciones` = veces que se confirmó ese código para esa clave.
--
-- 🔒 NADA de datos personales: ni matrícula, ni CP, ni conductor, ni tomador. Solo datos de catálogo del vehículo.
-- 🛡️ Solo `prisma_seguros` (SELECT/INSERT/UPDATE/DELETE); RLS activada sin políticas para el resto.
--
-- Se deshace con: drop table seguros.tarificador_elecciones;
BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.tarificador_elecciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias (id),
  compania           text NOT NULL CHECK (compania ~ '^[a-z0-9_]{1,40}$'),
  ramo               text NOT NULL CHECK (ramo ~ '^[a-z0-9_]{1,40}$'),
  tipo               text NOT NULL CHECK (tipo IN ('version')),
  clave_normalizada  text NOT NULL CHECK (length(clave_normalizada) BETWEEN 3 AND 600),
  codigo             text NOT NULL CHECK (length(codigo) BETWEEN 1 AND 60),
  etiqueta           text NOT NULL CHECK (length(etiqueta) BETWEEN 1 AND 200),
  origen             text NOT NULL CHECK (origen IN ('ia', 'humano')),
  confirmaciones     integer NOT NULL DEFAULT 1 CHECK (confirmaciones >= 1),
  ultima_vez         timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarificador_elecciones_unica UNIQUE (correduria_id, compania, ramo, tipo, clave_normalizada)
);

COMMENT ON TABLE seguros.tarificador_elecciones IS
  'Memoria del tarificador RPA: código de catálogo elegido por (correduría, compañía, ramo, tipo, clave del vehículo). '
  'Sin datos personales. La persona (origen humano) gana a la IA; la IA solo se guarda tras un ok con tarificación.';
COMMENT ON COLUMN seguros.tarificador_elecciones.clave_normalizada IS
  'MARCA|MODELO|CLASE|CC|DESCRIPCION normalizados (claveMemoriaVersion de @central/module-tarificacion).';

ALTER TABLE seguros.tarificador_elecciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_elecciones FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.tarificador_elecciones TO prisma_seguros;

COMMIT;
