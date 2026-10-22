-- ✅ APLICADO 22/10/2026 (OK de Alberto) salvo §15 (CHECK de alcance en portal_autorizacion): PENDIENTE,
--    el MCP se cuelga con DROP; ejecutar §15 a mano en el editor SQL de Supabase antes del paso 4.
-- Patrimonio en el portal del cliente — Fase 1, paso 3 (22/10/2026).
-- NO se aplica sin OK de Alberto, y se aplica en el MISMO paso que el despliegue de asegura-portal que
-- la usa (regla del portal). 🚨 GRANT antes que schema: `schema.prisma` ya declara los modelos
-- `PortalPatrimonio*` con EXACTAMENTE las columnas que aquí se conceden en SELECT (cepo
-- `test/regression-portal-patrimonio-sql.test.ts`). Sin esta DDL, cualquier consulta a esos modelos cae
-- con 42P01 (ruidoso). ADITIVA: no toca ninguna tabla existente salvo el CHECK de alcance de
-- `portal_autorizacion` (que solo AMPLÍA la lista).
--
-- Spec: `docs/superpowers/specs/2026-10-22-asegura-portal-patrimonio-design.md` §4.
-- Plan: `docs/superpowers/plans/2026-10-22-asegura-portal-patrimonio-fase-1.md` (paso 3).
--
-- ── Reglas que sostiene esta DDL (el código no puede garantizarlas solo) ─────
--  1. Rol `prisma_asegura_portal` (SIN BYPASSRLS): GRANT por COLUMNAS, nunca DELETE. Lo que se quita se
--     ARCHIVA (`archivado_en`), se ANULA (`anulado_en`), se DESCARTA (`estado`) o se DESACTIVA (`activo`).
--  2. `crm_seguros`: REVOKE ALL en cada tabla (los privilegios por defecto del schema le dan DML; landmine
--     del 24/09/2026; guardián `test/regression-portal-sin-crm.test.ts`). Lo de los INQUILINOS, además, es
--     un encargo de tratamiento del propietario: el CRM jamás lo lee (no son leads).
--  3. Dinero en CÉNTIMOS `bigint` (columnas `*_cent`). `NULL` = «no se sabe», nunca 0.
--  4. Aislamiento entre titulares en la propia BD donde se puede: las tablas hijas llevan `titular_id` y
--     FK COMPUESTA al padre `(id, titular_id)`, así un gasto/plantilla/contrato no puede colgar de un
--     inmueble de OTRO titular aunque el código se equivoque de id. El resto (quién ve qué titular) lo da
--     el CÓDIGO: `accesosPatrimonio(identidadId)` (paso 4), 404 nunca 403.
--  5. PII del inquilino (NIF, email, teléfono) CIFRADA con la clave del puerto de `apps/asegura`: el portal
--     no tiene `PII_ENCRYPTION_KEY`, así que NI LEE NI ESCRIBE esas columnas; el alta va por el PUENTE
--     (`prisma_seguros`). El portal solo ve el índice ciego `email_hash`.
--  6. `actualizado_en` lo pone un TRIGGER (no se concede al rol: el portal no puede fecharlo a mano) y
--     `correduria_id` del titular tiene que ser la de su ficha (trigger que lo comprueba).
--  7. APPEND-ONLY: `portal_patrimonio_indice` (solo lo escribe el cron de `apps/asegura`) y
--     `portal_patrimonio_renta_actualizacion` (el portal inserta; nadie reescribe una renta aplicada).
--  8. Alcances `patrimonio_gestion` / `patrimonio_total` en `portal_autorizacion`: como `flota`, NO entran
--     en `ALCANCES` del módulo puro (los lectores viejos los ignoran: no abren la bóveda). Ficha entera.
SET search_path = seguros, public;

BEGIN;

-- ─── 0. Utilidades ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_tocar() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

-- El titular tiene que ser una ficha NO fusionada y su `correduria_id` el de esa ficha. Se ejecuta con el
-- rol que inserta (el portal lee `clientes.correduria_id` y `merged_into_cliente_id`: columnas ya concedidas).
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_titular_coherente() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  c_correduria uuid;
  c_fusionada  uuid;
BEGIN
  SELECT correduria_id, merged_into_cliente_id INTO c_correduria, c_fusionada
    FROM seguros.clientes WHERE id = NEW.cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'portal_patrimonio_titular: ficha % inexistente', NEW.cliente_id USING ERRCODE = '23503';
  END IF;
  IF c_fusionada IS NOT NULL THEN
    RAISE EXCEPTION 'portal_patrimonio_titular: la ficha % esta fusionada', NEW.cliente_id USING ERRCODE = '23514';
  END IF;
  IF NEW.correduria_id IS DISTINCT FROM c_correduria THEN
    RAISE EXCEPTION 'portal_patrimonio_titular: correduria distinta de la de la ficha' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- ─── 1. Titular (persona o sociedad = una ficha de la cartera) ──────────────
-- Nombre y NIF NO se copian: se leen de `clientes` (columnas ya concedidas; el NIF entero no, §7).
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_titular (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              uuid NOT NULL UNIQUE REFERENCES seguros.clientes (id),
  correduria_id           uuid NOT NULL REFERENCES seguros.corredurias (id),
  tipo                    text NOT NULL CHECK (tipo IN ('persona', 'sociedad')),
  -- NULL = no consta: la rentabilidad cuenta el TOTAL (estado conservador) y lo dice.
  deduce_iva              boolean,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  -- Quien dio de alta el módulo para esta ficha (el `alta_por_identidad_id` de la spec).
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz
);

-- ─── 2. Inmueble ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_inmueble (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id                          uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  alias                               text NOT NULL CHECK (char_length(btrim(alias)) BETWEEN 1 AND 80),
  uso                                 text NOT NULL CHECK (uso IN ('vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro')),
  -- NULL = no consta (se pide; sin ella no hay Catastro).
  referencia_catastral                char(20) CHECK (referencia_catastral ~ '^[0-9A-Z]{20}$'),
  -- Dirección por la regla de la casa: CP → municipio (INE) → vía del callejero → número.
  cp                                  text CHECK (cp ~ '^[0-9]{5}$'),
  municipio_ine                       text CHECK (municipio_ine ~ '^[0-9]{5}$'),
  via                                 text,
  numero                              text,
  resto                               text,
  direccion_normalizada               text,
  superficie_m2                       numeric(10, 2) CHECK (superficie_m2 > 0),
  anio_construccion                   integer CHECK (anio_construccion BETWEEN 1000 AND 2200),
  -- Propiedad horizontal. NULL = no consta (el infraseguro dice «no lo sabemos»).
  en_comunidad                        boolean,
  -- CUPS de luz/gas y nº de contrato de agua. Vacío = no se ha anotado ninguno.
  suministros                         text[] NOT NULL DEFAULT '{}',
  valor_reconstruccion_estimado_cent  bigint CHECK (valor_reconstruccion_estimado_cent > 0),
  valor_reconstruccion_estimado_fuente text CHECK (valor_reconstruccion_estimado_fuente IN ('estimacion_m2', 'declarado')),
  creado_en                           timestamptz NOT NULL DEFAULT now(),
  actualizado_en                      timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id             uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en                        timestamptz,
  CONSTRAINT portal_patrimonio_inmueble_valor_con_fuente
    CHECK ((valor_reconstruccion_estimado_cent IS NULL) = (valor_reconstruccion_estimado_fuente IS NULL)),
  -- Destino de las FK compuestas (regla 4).
  CONSTRAINT portal_patrimonio_inmueble_id_titular UNIQUE (id, titular_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_inmueble_refcat
  ON seguros.portal_patrimonio_inmueble (titular_id, referencia_catastral)
  WHERE referencia_catastral IS NOT NULL AND archivado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_inmueble_titular
  ON seguros.portal_patrimonio_inmueble (titular_id) WHERE archivado_en IS NULL;

-- ─── 3. Comunidad de propietarios — de UN titular, NO compartida (decisión de Alberto, 22/10/2026) ──
-- Cada titular lleva su propia ficha de la comunidad: un vecino nunca lee ni edita la de otro. Si dos
-- clientes están en la misma comunidad hay DOS filas; el cruce entre ellos lo hará el corredor en
-- /correduria (no aquí). `inmueble_comunidad` exige inmueble y comunidad del MISMO titular (FK compuesta).
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_comunidad (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id              uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  nombre                 text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 120),
  nif_comunidad           text,
  administrador_nombre    text,
  administrador_email     text,
  cp                      text CHECK (cp ~ '^[0-9]{5}$'),
  direccion_normalizada   text,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  CONSTRAINT portal_patrimonio_comunidad_id_titular UNIQUE (id, titular_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_comunidad_titular
  ON seguros.portal_patrimonio_comunidad (titular_id) WHERE archivado_en IS NULL;

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_inmueble_comunidad (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id              uuid NOT NULL,
  inmueble_id             uuid NOT NULL,
  comunidad_id            uuid NOT NULL,
  -- Coeficiente de participación en %. NULL = no consta.
  coeficiente             numeric(9, 6) CHECK (coeficiente > 0 AND coeficiente <= 100),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  -- Inmueble y comunidad del MISMO titular (regla 4): un titular no puede colgarse de la comunidad de otro.
  CONSTRAINT portal_patrimonio_ic_inmueble_del_titular
    FOREIGN KEY (inmueble_id, titular_id) REFERENCES seguros.portal_patrimonio_inmueble (id, titular_id),
  CONSTRAINT portal_patrimonio_ic_comunidad_del_titular
    FOREIGN KEY (comunidad_id, titular_id) REFERENCES seguros.portal_patrimonio_comunidad (id, titular_id),
  -- Entera (no parcial): es destino de FK (derrama, plantilla). Volver a enlazar = desarchivar.
  CONSTRAINT portal_patrimonio_inmueble_comunidad_unica UNIQUE (inmueble_id, comunidad_id)
);

-- ─── 4. Inquilino (PII cifrada: el portal no la lee ni la escribe) ──────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_inquilino (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id              uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  tipo                    text NOT NULL CHECK (tipo IN ('persona', 'sociedad')),
  nombre                  text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 200),
  nif_cifrado             text,
  -- Índice ciego (`computeEmailLookupHash`). NULL = sin correo (no hay enlace posible).
  email_hash              text,
  email_cifrado           text,
  telefono_cifrado        text,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  CONSTRAINT portal_patrimonio_inquilino_email_par CHECK ((email_hash IS NULL) = (email_cifrado IS NULL)),
  CONSTRAINT portal_patrimonio_inquilino_id_titular UNIQUE (id, titular_id)
);

-- ─── 5. Contrato de larga estancia (LAU) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_contrato (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id               uuid NOT NULL,
  inmueble_id              uuid NOT NULL,
  inicio                   date NOT NULL,
  -- Fin PACTADO; con la prórroga LAU el real puede ser posterior. NULL = no consta.
  fin                      date,
  terminado_en             date,
  renta_mensual_cent       bigint NOT NULL CHECK (renta_mensual_cent > 0),
  clausula                 text NOT NULL CHECK (clausula IN ('ninguna', 'indice')),
  indice                   text CHECK (indice IN ('IPC', 'IRAV', 'otro')),
  indice_descripcion       text,
  fianza_cent              bigint CHECK (fianza_cent >= 0),
  fianza_depositada_en     date,
  fianza_organismo         text,
  fianza_devuelta_en       date,
  -- NULL = no consta si el contrato lo exige.
  seguro_inquilino_exigido boolean,
  seguro_inquilino_vence   date,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id  uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en             timestamptz,
  CONSTRAINT portal_patrimonio_contrato_inmueble_del_titular
    FOREIGN KEY (inmueble_id, titular_id) REFERENCES seguros.portal_patrimonio_inmueble (id, titular_id),
  CONSTRAINT portal_patrimonio_contrato_clausula_indice CHECK ((clausula = 'indice') = (indice IS NOT NULL)),
  CONSTRAINT portal_patrimonio_contrato_otro_descrito CHECK (indice IS DISTINCT FROM 'otro' OR indice_descripcion IS NOT NULL),
  CONSTRAINT portal_patrimonio_contrato_fin_despues CHECK (fin IS NULL OR fin >= inicio),
  CONSTRAINT portal_patrimonio_contrato_terminado_despues CHECK (terminado_en IS NULL OR terminado_en >= inicio),
  CONSTRAINT portal_patrimonio_contrato_id_titular UNIQUE (id, titular_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_contrato_inmueble
  ON seguros.portal_patrimonio_contrato (inmueble_id) WHERE archivado_en IS NULL;

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_contrato_inquilino (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id              uuid NOT NULL,
  contrato_id             uuid NOT NULL,
  inquilino_id            uuid NOT NULL,
  papel                   text NOT NULL CHECK (papel IN ('titular', 'avalista')),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  -- Contrato e inquilino del MISMO titular (regla 4).
  CONSTRAINT portal_patrimonio_ci_contrato_del_titular
    FOREIGN KEY (contrato_id, titular_id) REFERENCES seguros.portal_patrimonio_contrato (id, titular_id),
  CONSTRAINT portal_patrimonio_ci_inquilino_del_titular
    FOREIGN KEY (inquilino_id, titular_id) REFERENCES seguros.portal_patrimonio_inquilino (id, titular_id),
  -- Entera: destino de FK del enlace y del aviso del inquilino.
  CONSTRAINT portal_patrimonio_ci_unico UNIQUE (contrato_id, inquilino_id)
);

-- APPEND-ONLY: la renta aplicada no se reescribe. NULL en indice/pct/periodo/topado = actualización
-- anotada a mano o importada (no se inventa de qué índice salió).
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_renta_actualizacion (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id             uuid NOT NULL REFERENCES seguros.portal_patrimonio_contrato (id),
  desde                   date NOT NULL,
  renta_mensual_cent      bigint NOT NULL CHECK (renta_mensual_cent > 0),
  indice                  text CHECK (indice IN ('IPC', 'IRAV', 'otro')),
  pct_aplicado            numeric(6, 3),
  periodo                 text CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  topado                  boolean,
  -- La sella `apps/asegura` (el envío al inquilino vive allí).
  notificada_en           timestamptz,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  CONSTRAINT portal_patrimonio_renta_actualizacion_unica UNIQUE (contrato_id, desde)
);

-- ─── 6. Gastos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_plantilla_gasto (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id              uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  -- NULL = gasto del titular sin inmueble (gestoría de la sociedad).
  inmueble_id             uuid,
  comunidad_id            uuid,
  concepto                text NOT NULL CHECK (char_length(btrim(concepto)) BETWEEN 1 AND 200),
  categoria               text NOT NULL CHECK (categoria IN ('COMUNIDAD', 'IMPUESTOS', 'SUMINISTROS', 'SEGURO', 'MANTENIMIENTO', 'REFORMAS', 'GESTION', 'FINANCIACION', 'MOBILIARIO', 'OTRO')),
  periodicidad            text NOT NULL CHECK (periodicidad IN ('mensual', 'trimestral', 'semestral', 'anual')),
  dia_mes                 smallint NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  inicio                  date NOT NULL,
  fin                     date,
  -- NULL = importe variable (espera la factura), nunca 0.
  importe_cent            bigint CHECK (importe_cent > 0),
  proveedor               text,
  activo                  boolean NOT NULL DEFAULT true,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  CONSTRAINT portal_patrimonio_plantilla_inmueble_del_titular
    FOREIGN KEY (inmueble_id, titular_id) REFERENCES seguros.portal_patrimonio_inmueble (id, titular_id),
  -- La comunidad solo se alcanza a través de un inmueble enlazado a ella.
  CONSTRAINT portal_patrimonio_plantilla_comunidad_del_inmueble
    FOREIGN KEY (inmueble_id, comunidad_id) REFERENCES seguros.portal_patrimonio_inmueble_comunidad (inmueble_id, comunidad_id),
  CONSTRAINT portal_patrimonio_plantilla_comunidad_con_inmueble CHECK (comunidad_id IS NULL OR inmueble_id IS NOT NULL),
  CONSTRAINT portal_patrimonio_plantilla_fin_despues CHECK (fin IS NULL OR fin >= inicio)
);

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_derrama (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comunidad_id            uuid NOT NULL,
  inmueble_id             uuid NOT NULL,
  concepto                text NOT NULL CHECK (char_length(btrim(concepto)) BETWEEN 1 AND 200),
  total_cent              bigint NOT NULL CHECK (total_cent > 0),
  cuotas                  smallint NOT NULL CHECK (cuotas BETWEEN 1 AND 120),
  primera                 date NOT NULL,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  CONSTRAINT portal_patrimonio_derrama_inmueble_en_comunidad
    FOREIGN KEY (inmueble_id, comunidad_id) REFERENCES seguros.portal_patrimonio_inmueble_comunidad (inmueble_id, comunidad_id)
);

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_gasto (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id                  uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  inmueble_id                 uuid,
  fecha                       date NOT NULL,
  categoria                   text CHECK (categoria IN ('COMUNIDAD', 'IMPUESTOS', 'SUMINISTROS', 'SEGURO', 'MANTENIMIENTO', 'REFORMAS', 'GESTION', 'FINANCIACION', 'MOBILIARIO', 'OTRO')),
  concepto                    text,
  base_cent                   bigint,
  total_cent                  bigint,
  estado                      text NOT NULL DEFAULT 'propuesto' CHECK (estado IN ('propuesto', 'confirmado', 'descartado')),
  origen                      text NOT NULL CHECK (origen IN ('plantilla', 'factura', 'manual', 'derrama')),
  -- `<plantilla>:<YYYY-MM>` / `<derrama>:<n>`: el generador es idempotente por el índice único.
  clave                       text,
  -- Fichero de la factura (owner opaco de `module-documental`, paso 8). Sin FK a propósito.
  documento_id                uuid,
  -- Motivos + confianza de la IA (paso 7). NULL = sin propuesta de IA.
  propuesta                   jsonb,
  confirmado_en               timestamptz,
  confirmado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  creado_en                   timestamptz NOT NULL DEFAULT now(),
  actualizado_en              timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id     uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  CONSTRAINT portal_patrimonio_gasto_inmueble_del_titular
    FOREIGN KEY (inmueble_id, titular_id) REFERENCES seguros.portal_patrimonio_inmueble (id, titular_id),
  -- Un gasto de 0 € que nadie ha leído no se confirma: confirmado exige importe y fecha de confirmación.
  CONSTRAINT portal_patrimonio_gasto_confirmado_con_importe
    CHECK (estado <> 'confirmado' OR (base_cent IS NOT NULL OR total_cent IS NOT NULL)),
  CONSTRAINT portal_patrimonio_gasto_confirmado_con_fecha CHECK (estado <> 'confirmado' OR confirmado_en IS NOT NULL),
  CONSTRAINT portal_patrimonio_gasto_generado_con_clave CHECK (origen NOT IN ('plantilla', 'derrama') OR clave IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_gasto_clave
  ON seguros.portal_patrimonio_gasto (titular_id, clave)
  WHERE clave IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_gasto_titular_fecha
  ON seguros.portal_patrimonio_gasto (titular_id, fecha DESC);

-- ─── 7. Índices IPC/IRAV (los escribe SOLO el cron de apps/asegura; append-only) ──
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_indice (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indice        text NOT NULL CHECK (indice IN ('IPC', 'IRAV')),
  periodo       char(7) NOT NULL CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  pct           numeric(6, 3) NOT NULL CHECK (pct <> 'NaN'::numeric),
  fuente_url    text NOT NULL,
  descargado_en timestamptz NOT NULL DEFAULT now(),
  -- false = primera publicación; true = revisión posterior del INE (fila NUEVA, nunca se pisa).
  revisado      boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

-- Una sola publicación original por índice y periodo; las revisiones van aparte y una revisión con el
-- MISMO valor no se repite (ON CONFLICT DO NOTHING idempotente). El lector toma la más reciente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_indice_original
  ON seguros.portal_patrimonio_indice (indice, periodo)
  WHERE revisado = false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_indice_revision
  ON seguros.portal_patrimonio_indice (indice, periodo, pct)
  WHERE revisado = true;

-- ─── 8. Importación desde Excel/CSV (nada cuenta hasta `confirmada`) ────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_importacion (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id            uuid NOT NULL REFERENCES seguros.portal_identidad (id) ON DELETE CASCADE,
  titular_id              uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  -- El fichero subido (owner opaco de `module-documental`). Sin FK a propósito.
  documento_id            uuid,
  mapeo                   jsonb,
  estado                  text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'revisada', 'confirmada', 'descartada')),
  confirmada_en           timestamptz,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  CONSTRAINT portal_patrimonio_importacion_confirmada_con_fecha CHECK ((estado = 'confirmada') = (confirmada_en IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_importacion_fila (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id          uuid NOT NULL REFERENCES seguros.portal_patrimonio_importacion (id),
  n                       integer NOT NULL CHECK (n >= 1),
  entidad                 text NOT NULL CHECK (entidad IN ('inmueble', 'inquilino', 'contrato', 'plantilla_gasto', 'gasto', 'comunidad')),
  -- 🚨 Datos de TRÁNSITO de la vista previa. La app NO mete aquí NIF, email ni teléfono del inquilino
  -- (el portal no puede cifrarlos: van CIFRADOS a `portal_patrimonio_inquilino` por el puente de
  -- apps/asegura); como mucho una marca «trae NIF». Y aun así, al CONFIRMAR o DESCARTAR la importación
  -- la BD vacía `datos` de todas sus filas (trigger `portal_patrimonio_importacion_cerrar`) y rechaza
  -- escribir datos en una importación cerrada (`portal_patrimonio_importacion_fila_abierta`).
  -- NULL = vaciada al cerrar.
  datos                   jsonb,
  -- NULL = sin problema detectado. Una fila con problema no se crea sola.
  problema                text,
  -- Lo que creó al confirmar. NULL = no creada (aún, o apartada).
  creado_id               uuid,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  CONSTRAINT portal_patrimonio_importacion_fila_unica UNIQUE (importacion_id, n)
);

-- ─── 9. Obligaciones del INMUEBLE (las de contrato se CALCULAN, no se guardan) ──
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_obligacion (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inmueble_id             uuid NOT NULL REFERENCES seguros.portal_patrimonio_inmueble (id),
  tipo                    text NOT NULL CHECK (tipo IN ('ite_iee', 'certificado_energetico', 'revision_gas', 'inspeccion_ascensor', 'boletin_electrico', 'otra')),
  descripcion             text,
  -- false = no aplica (no sale); NULL = no se sabe (sale como `sin_dato`).
  aplica                  boolean,
  ultima                  date,
  vence                   date,
  periodicidad_meses      smallint CHECK (periodicidad_meses BETWEEN 1 AND 600),
  avisada_en              timestamptz,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  CONSTRAINT portal_patrimonio_obligacion_otra_descrita CHECK (tipo <> 'otra' OR descripcion IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_obligacion_unica
  ON seguros.portal_patrimonio_obligacion (inmueble_id, tipo)
  WHERE tipo <> 'otra' AND archivado_en IS NULL;

-- ─── 10. Enlace y avisos del inquilino (sin cuenta del portal) ──────────────
-- Token HASHEADO (nunca el token); anular no borra. El enlace dice QUÉ contrato, el código al correo QUIÉN.
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_enlace_inquilino (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id             uuid NOT NULL,
  inquilino_id            uuid NOT NULL,
  token_hash              text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  caduca_en               timestamptz,
  anulado_en              timestamptz,
  ultimo_uso_en           timestamptz,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  -- El par tiene que existir: un enlace no puede atar a un inquilino a un contrato que no es suyo.
  CONSTRAINT portal_patrimonio_enlace_par
    FOREIGN KEY (contrato_id, inquilino_id) REFERENCES seguros.portal_patrimonio_contrato_inquilino (contrato_id, inquilino_id)
);

-- El rol del portal INSERTA desde la página pública: `estado` nace por DEFAULT (no se concede en INSERT).
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_aviso_inquilino (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id    uuid NOT NULL,
  inquilino_id   uuid NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('averia', 'siniestro', 'consulta')),
  texto          text NOT NULL CHECK (char_length(btrim(texto)) BETWEEN 1 AND 4000),
  -- Documentos (fotos) de `module-documental`. Vacío = sin fotos.
  fotos          uuid[] NOT NULL DEFAULT '{}',
  estado         text NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido', 'visto', 'convertido_en_parte', 'cerrado')),
  parte_id       uuid REFERENCES seguros.portal_parte_siniestro (id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_patrimonio_aviso_par
    FOREIGN KEY (contrato_id, inquilino_id) REFERENCES seguros.portal_patrimonio_contrato_inquilino (contrato_id, inquilino_id),
  CONSTRAINT portal_patrimonio_aviso_parte_con_estado CHECK ((estado = 'convertido_en_parte') = (parte_id IS NOT NULL))
);

-- ─── 11. Seguros del inmueble (ninguna columna nueva en `polizas`) ──────────
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_inmueble_poliza (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inmueble_id             uuid NOT NULL REFERENCES seguros.portal_patrimonio_inmueble (id),
  poliza_id               uuid REFERENCES seguros.polizas (id) ON DELETE CASCADE,
  poliza_declarada_id     uuid REFERENCES seguros.portal_poliza_declarada (id) ON DELETE CASCADE,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  archivado_en            timestamptz,
  CONSTRAINT portal_patrimonio_inmueble_poliza_una CHECK (num_nonnulls(poliza_id, poliza_declarada_id) = 1)
);
-- Dos índices parciales y no uno compuesto: dos NULL nunca son iguales (trampa del 04/09).
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_inmueble_poliza_cartera
  ON seguros.portal_patrimonio_inmueble_poliza (inmueble_id, poliza_id)
  WHERE poliza_id IS NOT NULL AND archivado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_inmueble_poliza_declarada
  ON seguros.portal_patrimonio_inmueble_poliza (inmueble_id, poliza_declarada_id)
  WHERE poliza_declarada_id IS NOT NULL AND archivado_en IS NULL;

-- ─── 12. Triggers ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS portal_patrimonio_titular_coherente ON seguros.portal_patrimonio_titular;
CREATE TRIGGER portal_patrimonio_titular_coherente
  BEFORE INSERT OR UPDATE OF cliente_id, correduria_id ON seguros.portal_patrimonio_titular
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_titular_coherente();

-- Importación: una CERRADA (confirmada/descartada) no se reabre, y al cerrarse se vacía `datos` de sus
-- filas (decisión de Alberto, 22/10/2026: nada de PII en claro que sobreviva a la vista previa).
-- Los triggers se disparan para TODOS los roles (también prisma_seguros), no solo para el portal.
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_importacion_no_reabrir() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado IN ('confirmada', 'descartada') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'portal_patrimonio_importacion: una importacion % no se reabre', OLD.estado USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_importacion_cerrar() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  UPDATE seguros.portal_patrimonio_importacion_fila SET datos = NULL
   WHERE importacion_id = NEW.id AND datos IS NOT NULL;
  RETURN NULL;
END $$;

-- Una fila no puede llevar datos si su importación ya está cerrada. `FOR SHARE` sobre la importación
-- serializa con el UPDATE que la cierra (sin él, una fila escrita a la vez que se confirma podría
-- quedarse con datos). Requiere UPDATE en alguna columna de la importación: el portal lo tiene.
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_importacion_fila_abierta() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE e text;
BEGIN
  IF NEW.datos IS NULL THEN RETURN NEW; END IF;
  SELECT estado INTO e FROM seguros.portal_patrimonio_importacion WHERE id = NEW.importacion_id FOR SHARE;
  IF e IN ('confirmada', 'descartada') THEN
    RAISE EXCEPTION 'portal_patrimonio_importacion_fila: la importacion esta % y no admite datos', e USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS portal_patrimonio_importacion_no_reabrir ON seguros.portal_patrimonio_importacion;
CREATE TRIGGER portal_patrimonio_importacion_no_reabrir
  BEFORE UPDATE OF estado ON seguros.portal_patrimonio_importacion
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_importacion_no_reabrir();

DROP TRIGGER IF EXISTS portal_patrimonio_importacion_cerrar ON seguros.portal_patrimonio_importacion;
CREATE TRIGGER portal_patrimonio_importacion_cerrar
  AFTER UPDATE OF estado ON seguros.portal_patrimonio_importacion
  FOR EACH ROW WHEN (NEW.estado IN ('confirmada', 'descartada'))
  EXECUTE FUNCTION seguros.portal_patrimonio_importacion_cerrar();

DROP TRIGGER IF EXISTS portal_patrimonio_importacion_fila_abierta ON seguros.portal_patrimonio_importacion_fila;
CREATE TRIGGER portal_patrimonio_importacion_fila_abierta
  BEFORE INSERT OR UPDATE OF datos ON seguros.portal_patrimonio_importacion_fila
  FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_importacion_fila_abierta();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'portal_patrimonio_titular', 'portal_patrimonio_inmueble', 'portal_patrimonio_comunidad',
    'portal_patrimonio_inmueble_comunidad', 'portal_patrimonio_inquilino', 'portal_patrimonio_contrato',
    'portal_patrimonio_contrato_inquilino', 'portal_patrimonio_plantilla_gasto', 'portal_patrimonio_derrama',
    'portal_patrimonio_gasto', 'portal_patrimonio_importacion', 'portal_patrimonio_importacion_fila',
    'portal_patrimonio_obligacion', 'portal_patrimonio_aviso_inquilino', 'portal_patrimonio_inmueble_poliza'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON seguros.%I', t || '_tocar', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON seguros.%I FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_tocar()', t || '_tocar', t);
  END LOOP;
END $$;

-- ─── 13. RLS (desactivada: el aislamiento lo da el CÓDIGO, como el resto del portal) ──
ALTER TABLE seguros.portal_patrimonio_titular              DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_inmueble             DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_comunidad            DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_inmueble_comunidad   DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_inquilino            DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_contrato             DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_contrato_inquilino   DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_renta_actualizacion  DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_plantilla_gasto      DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_derrama              DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_gasto                DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_indice               DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_importacion          DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_importacion_fila     DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_obligacion           DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_enlace_inquilino     DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_aviso_inquilino      DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_patrimonio_inmueble_poliza      DISABLE ROW LEVEL SECURITY;

-- ─── 14. Permisos ───────────────────────────────────────────────────────────
-- 🚨 Cada GRANT SELECT por columnas = las columnas EXACTAS del modelo Prisma (cepo). Nunca DELETE.

-- titular
GRANT SELECT (id, cliente_id, correduria_id, tipo, deduce_iva, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_titular TO prisma_asegura_portal;
GRANT INSERT (cliente_id, correduria_id, tipo, deduce_iva, creado_por_identidad_id)
  ON seguros.portal_patrimonio_titular TO prisma_asegura_portal;
GRANT UPDATE (deduce_iva, archivado_en)
  ON seguros.portal_patrimonio_titular TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_titular FROM crm_seguros;

-- inmueble
GRANT SELECT (id, titular_id, alias, uso, referencia_catastral, cp, municipio_ine, via, numero, resto, direccion_normalizada,
              superficie_m2, anio_construccion, en_comunidad, suministros, valor_reconstruccion_estimado_cent,
              valor_reconstruccion_estimado_fuente, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT INSERT (titular_id, alias, uso, referencia_catastral, cp, municipio_ine, via, numero, resto, direccion_normalizada,
              superficie_m2, anio_construccion, en_comunidad, suministros, valor_reconstruccion_estimado_cent,
              valor_reconstruccion_estimado_fuente, creado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT UPDATE (alias, uso, referencia_catastral, cp, municipio_ine, via, numero, resto, direccion_normalizada,
              superficie_m2, anio_construccion, en_comunidad, suministros, valor_reconstruccion_estimado_cent,
              valor_reconstruccion_estimado_fuente, archivado_en)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_inmueble FROM crm_seguros;

-- comunidad
GRANT SELECT (id, titular_id, nombre, nif_comunidad, administrador_nombre, administrador_email, cp, direccion_normalizada,
              creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_comunidad TO prisma_asegura_portal;
GRANT INSERT (titular_id, nombre, nif_comunidad, administrador_nombre, administrador_email, cp, direccion_normalizada, creado_por_identidad_id)
  ON seguros.portal_patrimonio_comunidad TO prisma_asegura_portal;
GRANT UPDATE (nombre, nif_comunidad, administrador_nombre, administrador_email, cp, direccion_normalizada, archivado_en)
  ON seguros.portal_patrimonio_comunidad TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_comunidad FROM crm_seguros;

-- inmueble_comunidad
GRANT SELECT (id, titular_id, inmueble_id, comunidad_id, coeficiente, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_inmueble_comunidad TO prisma_asegura_portal;
GRANT INSERT (titular_id, inmueble_id, comunidad_id, coeficiente, creado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble_comunidad TO prisma_asegura_portal;
GRANT UPDATE (coeficiente, archivado_en)
  ON seguros.portal_patrimonio_inmueble_comunidad TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_inmueble_comunidad FROM crm_seguros;

-- inquilino: el portal NO ve ni escribe `*_cifrado` (regla 5); el alta va por el puente (prisma_seguros).
GRANT SELECT (id, titular_id, tipo, nombre, email_hash, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_inquilino TO prisma_asegura_portal;
GRANT UPDATE (tipo, nombre, archivado_en)
  ON seguros.portal_patrimonio_inquilino TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_inquilino FROM crm_seguros;

-- contrato
GRANT SELECT (id, titular_id, inmueble_id, inicio, fin, terminado_en, renta_mensual_cent, clausula, indice, indice_descripcion,
              fianza_cent, fianza_depositada_en, fianza_organismo, fianza_devuelta_en, seguro_inquilino_exigido,
              seguro_inquilino_vence, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_contrato TO prisma_asegura_portal;
GRANT INSERT (titular_id, inmueble_id, inicio, fin, terminado_en, renta_mensual_cent, clausula, indice, indice_descripcion,
              fianza_cent, fianza_depositada_en, fianza_organismo, fianza_devuelta_en, seguro_inquilino_exigido,
              seguro_inquilino_vence, creado_por_identidad_id)
  ON seguros.portal_patrimonio_contrato TO prisma_asegura_portal;
GRANT UPDATE (fin, terminado_en, clausula, indice, indice_descripcion, fianza_cent, fianza_depositada_en, fianza_organismo,
              fianza_devuelta_en, seguro_inquilino_exigido, seguro_inquilino_vence, archivado_en)
  ON seguros.portal_patrimonio_contrato TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_contrato FROM crm_seguros;

-- contrato_inquilino
GRANT SELECT (id, titular_id, contrato_id, inquilino_id, papel, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_contrato_inquilino TO prisma_asegura_portal;
GRANT INSERT (titular_id, contrato_id, inquilino_id, papel, creado_por_identidad_id)
  ON seguros.portal_patrimonio_contrato_inquilino TO prisma_asegura_portal;
GRANT UPDATE (papel, archivado_en)
  ON seguros.portal_patrimonio_contrato_inquilino TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_contrato_inquilino FROM crm_seguros;

-- renta_actualizacion: APPEND-ONLY (sin UPDATE al portal; `notificada_en` la sella apps/asegura).
GRANT SELECT (id, contrato_id, desde, renta_mensual_cent, indice, pct_aplicado, periodo, topado, notificada_en,
              creado_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_renta_actualizacion TO prisma_asegura_portal;
GRANT INSERT (contrato_id, desde, renta_mensual_cent, indice, pct_aplicado, periodo, topado, creado_por_identidad_id)
  ON seguros.portal_patrimonio_renta_actualizacion TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_renta_actualizacion FROM crm_seguros;

-- plantilla_gasto
GRANT SELECT (id, titular_id, inmueble_id, comunidad_id, concepto, categoria, periodicidad, dia_mes, inicio, fin, importe_cent,
              proveedor, activo, creado_en, actualizado_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_plantilla_gasto TO prisma_asegura_portal;
GRANT INSERT (titular_id, inmueble_id, comunidad_id, concepto, categoria, periodicidad, dia_mes, inicio, fin, importe_cent,
              proveedor, activo, creado_por_identidad_id)
  ON seguros.portal_patrimonio_plantilla_gasto TO prisma_asegura_portal;
GRANT UPDATE (inmueble_id, comunidad_id, concepto, categoria, periodicidad, dia_mes, inicio, fin, importe_cent, proveedor, activo)
  ON seguros.portal_patrimonio_plantilla_gasto TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_plantilla_gasto FROM crm_seguros;

-- derrama
GRANT SELECT (id, comunidad_id, inmueble_id, concepto, total_cent, cuotas, primera, creado_en, actualizado_en,
              creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_derrama TO prisma_asegura_portal;
GRANT INSERT (comunidad_id, inmueble_id, concepto, total_cent, cuotas, primera, creado_por_identidad_id)
  ON seguros.portal_patrimonio_derrama TO prisma_asegura_portal;
GRANT UPDATE (concepto, archivado_en)
  ON seguros.portal_patrimonio_derrama TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_derrama FROM crm_seguros;

-- gasto (descartar = `estado`, nunca DELETE)
GRANT SELECT (id, titular_id, inmueble_id, fecha, categoria, concepto, base_cent, total_cent, estado, origen, clave, documento_id,
              propuesta, confirmado_en, confirmado_por_identidad_id, creado_en, actualizado_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_gasto TO prisma_asegura_portal;
GRANT INSERT (titular_id, inmueble_id, fecha, categoria, concepto, base_cent, total_cent, estado, origen, clave, documento_id,
              propuesta, confirmado_en, confirmado_por_identidad_id, creado_por_identidad_id)
  ON seguros.portal_patrimonio_gasto TO prisma_asegura_portal;
GRANT UPDATE (inmueble_id, fecha, categoria, concepto, base_cent, total_cent, estado, documento_id, propuesta, confirmado_en,
              confirmado_por_identidad_id)
  ON seguros.portal_patrimonio_gasto TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_gasto FROM crm_seguros;

-- indice: el portal SOLO LEE. Escribe el cron de apps/asegura; append-only también para él.
GRANT SELECT (id, indice, periodo, pct, fuente_url, descargado_en, revisado, creado_en)
  ON seguros.portal_patrimonio_indice TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_indice FROM crm_seguros;

-- importacion
GRANT SELECT (id, identidad_id, titular_id, documento_id, mapeo, estado, confirmada_en, creado_en, actualizado_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;
GRANT INSERT (identidad_id, titular_id, documento_id, mapeo, creado_por_identidad_id)
  ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;
GRANT UPDATE (mapeo, estado, confirmada_en)
  ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_importacion FROM crm_seguros;

GRANT SELECT (id, importacion_id, n, entidad, datos, problema, creado_id, creado_en, actualizado_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_importacion_fila TO prisma_asegura_portal;
GRANT INSERT (importacion_id, n, entidad, datos, problema, creado_por_identidad_id)
  ON seguros.portal_patrimonio_importacion_fila TO prisma_asegura_portal;
GRANT UPDATE (entidad, datos, problema, creado_id)
  ON seguros.portal_patrimonio_importacion_fila TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_importacion_fila FROM crm_seguros;

-- obligacion
GRANT SELECT (id, inmueble_id, tipo, descripcion, aplica, ultima, vence, periodicidad_meses, avisada_en, creado_en,
              actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_obligacion TO prisma_asegura_portal;
GRANT INSERT (inmueble_id, tipo, descripcion, aplica, ultima, vence, periodicidad_meses, creado_por_identidad_id)
  ON seguros.portal_patrimonio_obligacion TO prisma_asegura_portal;
GRANT UPDATE (descripcion, aplica, ultima, vence, periodicidad_meses, avisada_en, archivado_en)
  ON seguros.portal_patrimonio_obligacion TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_obligacion FROM crm_seguros;

-- enlace_inquilino: tras crearlo solo se ANULA o se sella el último uso (como la hoja QR).
GRANT SELECT (id, contrato_id, inquilino_id, token_hash, caduca_en, anulado_en, ultimo_uso_en, creado_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_enlace_inquilino TO prisma_asegura_portal;
GRANT INSERT (contrato_id, inquilino_id, token_hash, caduca_en, creado_por_identidad_id)
  ON seguros.portal_patrimonio_enlace_inquilino TO prisma_asegura_portal;
GRANT UPDATE (anulado_en, ultimo_uso_en)
  ON seguros.portal_patrimonio_enlace_inquilino TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_enlace_inquilino FROM crm_seguros;

-- aviso_inquilino: `estado`/`parte_id` NO en el INSERT (nace `recibido`); el propietario lo avanza.
GRANT SELECT (id, contrato_id, inquilino_id, tipo, texto, fotos, estado, parte_id, creado_en, actualizado_en)
  ON seguros.portal_patrimonio_aviso_inquilino TO prisma_asegura_portal;
GRANT INSERT (contrato_id, inquilino_id, tipo, texto, fotos)
  ON seguros.portal_patrimonio_aviso_inquilino TO prisma_asegura_portal;
GRANT UPDATE (estado, parte_id)
  ON seguros.portal_patrimonio_aviso_inquilino TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_aviso_inquilino FROM crm_seguros;

-- inmueble_poliza
GRANT SELECT (id, inmueble_id, poliza_id, poliza_declarada_id, creado_en, actualizado_en, creado_por_identidad_id, archivado_en)
  ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
GRANT INSERT (inmueble_id, poliza_id, poliza_declarada_id, creado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
GRANT UPDATE (archivado_en)
  ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_patrimonio_inmueble_poliza FROM crm_seguros;

-- `prisma_seguros` (apps/asegura) recibe SELECT/INSERT/UPDATE/DELETE por los privilegios por defecto del
-- schema (puente del inquilino, operador, purgas RGPD). Se le recorta lo que es APPEND-ONLY:
REVOKE UPDATE, DELETE ON seguros.portal_patrimonio_indice FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.portal_patrimonio_indice TO prisma_seguros;
REVOKE UPDATE, DELETE ON seguros.portal_patrimonio_renta_actualizacion FROM prisma_seguros;
GRANT SELECT ON seguros.portal_patrimonio_renta_actualizacion TO prisma_seguros;
GRANT UPDATE (notificada_en) ON seguros.portal_patrimonio_renta_actualizacion TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.portal_patrimonio_inquilino TO prisma_seguros;

-- ─── 15. Alcances de patrimonio en portal_autorizacion (sin tocar `ALCANCES` del código) ──
-- Lista viva leída en BD el 22/10/2026: ver, ver_economico, partes, documentos, gestion, total, flota.
ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT IF EXISTS portal_autorizacion_alcance_check;
ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_alcance_check
  CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos', 'gestion', 'total', 'flota', 'patrimonio_gestion', 'patrimonio_total'));

-- Como `flota`: se concede sobre la FICHA entera (el patrimonio no va por póliza). El título en una sociedad
-- lo exige el código (como `gestion`/`total`): en una persona física no se representa a nadie.
ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT IF EXISTS portal_autorizacion_patrimonio_entera;
ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_patrimonio_entera
  CHECK (alcance NOT IN ('patrimonio_gestion', 'patrimonio_total') OR poliza_id IS NULL);

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT table_name, grantee, privilege_type, count(*) FROM information_schema.column_privileges
--  WHERE table_schema = 'seguros' AND table_name LIKE 'portal\_patrimonio\_%' GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
-- SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name LIKE 'portal\_patrimonio\_%' AND grantee IN ('crm_seguros', 'prisma_asegura_portal')
--  ORDER BY 1, 2, 3;   -- crm_seguros: 0 filas; prisma_asegura_portal: ninguna DELETE
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'portal_autorizacion_alcance_check';
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- Solo si no hay filas (si las hay, se archivan: borrarlas es perder datos del cliente y la prueba de
-- quién concedió qué). Revocar antes las autorizaciones `patrimonio_*` vivas.
--   ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_patrimonio_entera;
--   ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_alcance_check;
--   ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_alcance_check
--     CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos', 'gestion', 'total', 'flota'));
--   DROP TABLE seguros.portal_patrimonio_aviso_inquilino, seguros.portal_patrimonio_enlace_inquilino,
--     seguros.portal_patrimonio_inmueble_poliza, seguros.portal_patrimonio_obligacion,
--     seguros.portal_patrimonio_importacion_fila, seguros.portal_patrimonio_importacion,
--     seguros.portal_patrimonio_indice, seguros.portal_patrimonio_gasto, seguros.portal_patrimonio_derrama,
--     seguros.portal_patrimonio_plantilla_gasto, seguros.portal_patrimonio_renta_actualizacion,
--     seguros.portal_patrimonio_contrato_inquilino, seguros.portal_patrimonio_contrato,
--     seguros.portal_patrimonio_inquilino, seguros.portal_patrimonio_inmueble_comunidad,
--     seguros.portal_patrimonio_comunidad, seguros.portal_patrimonio_inmueble, seguros.portal_patrimonio_titular;
--   DROP FUNCTION seguros.portal_patrimonio_tocar(), seguros.portal_patrimonio_titular_coherente(),
--     seguros.portal_patrimonio_importacion_no_reabrir(), seguros.portal_patrimonio_importacion_cerrar(),
--     seguros.portal_patrimonio_importacion_fila_abierta();
