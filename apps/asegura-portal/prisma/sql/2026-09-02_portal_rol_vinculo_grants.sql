-- Portal de Grupo Asegura — Fase 4 (02/09/2026): rol propio, vínculo con la cartera y grants.
-- Se aplica DESPUÉS de 2026-09-01_portal_fase1.sql, sobre el schema `seguros` de la BD compartida.
--
-- Tres decisiones que este fichero fija:
--   1. El rol `prisma_asegura_portal` NO tiene BYPASSRLS y nace SIN contraseña (inerte), como
--      `prisma_seguros` en el bootstrap: la contraseña la pone Alberto con `ALTER ROLE … PASSWORD`
--      y en el MISMO paso la `DATABASE_URL` del proyecto Vercel del portal (lección del 02/09).
--   2. La cartera se lee por COLUMNAS, no por tablas: el rol no puede leer DNI, IBAN, teléfono,
--      email ni dirección (cifrados o no) de `clientes`, `poliza_recibos`, `poliza_intervinientes`
--      ni `siniestros.lugar_direccion`. Un `SELECT *` desde el portal falla en la BD, que es
--      donde tiene que fallar. Prisma selecciona columnas explícitas, así que el portal funciona.
--   3. `portal_vinculo` es la costura identidad ↔ ficha de la cartera. Se crea al canjear el
--      código, por índice ciego del EMAIL (0 duplicados en la cartera); el teléfono identifica
--      un hogar y NO vincula solo (spec §vinculación). Sin fila aquí, el portal no lee nada de
--      la cartera para esa identidad.
SET search_path = seguros, public;

-- El módulo define 4 procedencias y la BD tenía 3 (landmine documentada en CLAUDE.md del portal).
ALTER TYPE seguros.portal_procedencia ADD VALUE IF NOT EXISTS 'documento';

CREATE TABLE IF NOT EXISTS seguros.portal_vinculo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id  uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  correduria_id uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id    uuid NOT NULL REFERENCES seguros.clientes(id),
  -- Nivel de acceso sobre LO PROPIO (spec: tomador → gestionar). Lo ajeno va por cliente_relaciones.
  nivel         text NOT NULL DEFAULT 'gestionar' CHECK (nivel IN ('tarjeta', 'completo', 'gestionar', 'administrar')),
  -- Cómo se probó que esta identidad es esta ficha. `email_hash` = el email verificado por código
  -- coincide con el índice ciego de la ficha. `manual` = lo vinculó el corredor desde plataforma.
  origen        text NOT NULL CHECK (origen IN ('email_hash', 'manual')),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identidad_id, cliente_id)
);
CREATE INDEX IF NOT EXISTS idx_portal_vinculo_identidad ON seguros.portal_vinculo (identidad_id);
CREATE INDEX IF NOT EXISTS idx_portal_vinculo_cliente ON seguros.portal_vinculo (cliente_id);

-- ─── Rol del portal: LOGIN, sin BYPASSRLS, sin contraseña (inerte hasta ALTER ROLE) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_asegura_portal') THEN
    CREATE ROLE prisma_asegura_portal WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA seguros TO prisma_asegura_portal;

-- Lo suyo: las tablas portal_* enteras.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  seguros.portal_identidad, seguros.portal_canal, seguros.portal_codigo, seguros.portal_bien,
  seguros.portal_poliza_declarada, seguros.portal_consentimiento, seguros.portal_vinculo
  TO prisma_asegura_portal;
GRANT USAGE ON TYPE seguros.portal_canal_tipo, seguros.portal_procedencia, seguros.portal_bien_tipo TO prisma_asegura_portal;

-- La cartera, por columnas. Lo que NO está aquí, el portal no lo puede leer ni queriendo.
GRANT SELECT (id, nombre) ON seguros.corredurias TO prisma_asegura_portal;
GRANT SELECT (id, correduria_id, nombre, apellidos, tipo, segmento, tipo_persona, activo, import_ref,
              email_lookup_hash, telefono_lookup_hash, merged_into_cliente_id, created_at)
  ON seguros.clientes TO prisma_asegura_portal;
GRANT SELECT (id, correduria_id, cliente_id, tipo, aseguradora, numero_poliza, fecha_inicio, fecha_vencimiento,
              prima_anual, prima_mensual, prima_bruta, fraccionamiento, estado, situacion, datos_especificos, coberturas,
              import_ref, origen, id_poliza_entidad, codigo_entidad_dgs, ramo_dgs, fecha_efecto_inicial,
              merged_into_poliza_id, created_at, updated_at)
  ON seguros.polizas TO prisma_asegura_portal;
GRANT SELECT (id, correduria_id, poliza_id, numero_orden, codigo, descripcion, capital_asegurado, descripcion_capital,
              franquicia, fecha_inicio, fecha_fin, modalidad_valoracion, datos_extra)
  ON seguros.poliza_coberturas TO prisma_asegura_portal;
GRANT SELECT (id, correduria_id, poliza_id, situacion, clase_recibo, fecha_efecto_inicial, fecha_efecto_actual,
              fecha_vencimiento, fecha_emision, fecha_situacion, prima_total, prima_neta, forma_pago)
  ON seguros.poliza_recibos TO prisma_asegura_portal;
GRANT SELECT (id, correduria_id, cliente_id, poliza_id, estado, tipo, referencia, fecha_hora, lugar_cp, lugar_ciudad,
              lugar_provincia, tramitador_nombre, tramitador_telefono, tramitador_email, perito_nombre, perito_telefono,
              perito_email, origen, id_siniestro_entidad, gravedad, created_at, updated_at)
  ON seguros.siniestros TO prisma_asegura_portal;
GRANT SELECT (id, poliza_id, correduria_id, rol, cliente_id, tipo_relacion, origen)
  ON seguros.poliza_intervinientes TO prisma_asegura_portal;
GRANT SELECT (id, correduria_id, cliente_a_id, cliente_b_id, tipo_relacion, puede_ver_polizas, created_at)
  ON seguros.cliente_relaciones TO prisma_asegura_portal;
