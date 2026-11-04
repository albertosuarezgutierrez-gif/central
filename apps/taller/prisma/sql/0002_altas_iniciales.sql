-- Vertical TALLER — altas iniciales (F1). Requiere 0001_schema_taller.sql aplicado. IDEMPOTENTE: se puede repetir.
--
-- ⛔ NO APLICADA. Aplicar como `postgres` (preview → prod tras OK de Alberto).
--
-- 1) Rol de la app `prisma_taller`: LOGIN, NOBYPASSRLS, SIN contraseña (inerte). Mismo patrón que prisma_almacen /
--    prisma_asegura_portal. La contraseña la pone el OPERADOR, y en el MISMO paso la DATABASE_URL del proyecto Vercel:
--      ALTER ROLE prisma_taller WITH PASSWORD <la del gestor de secretos>   (nunca en este fichero ni en el repo)
-- 2) Taller piloto «Talleres de Automoción G2» con id FIJO (es el valor de TALLER_PILOTO_ID en Vercel) y su
--    configuración de alta ≡ `configDeAlta()` de @central/module-taller (cepo: apps/taller/test/esquema-sql.test.ts).
--    Precios/paquetes/aceites NO se inventan: nacen vacíos y los pone el dueño en Ajustes.
-- 3) El primer usuario (dueño) NO se crea aquí (sería un PIN en el repo): `node apps/taller/scripts/alta-dueno.ts`
--    genera el INSERT con el hash.

BEGIN;

-- ─── 1. Rol ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_taller') THEN
    CREATE ROLE prisma_taller WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
-- Si alguien lo hubiera creado a mano saltándose RLS, se le quita el privilegio (el aislamiento por taller depende de ello).
ALTER ROLE prisma_taller WITH NOBYPASSRLS;
ALTER ROLE prisma_taller SET search_path = taller, public;

GRANT USAGE ON SCHEMA taller TO prisma_taller;
GRANT EXECUTE ON FUNCTION taller.taller_actual() TO prisma_taller;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA taller TO prisma_taller;
-- Alta/baja de talleres y su marca/estado: solo el operador. La app edita solo los datos del taller.
REVOKE INSERT, UPDATE, DELETE ON taller.talleres FROM prisma_taller;
GRANT UPDATE (razon_social, nombre_comercial, nif, cp, provincia, municipio, via, numero, referencia_catastral, actualizado_en)
  ON taller.talleres TO prisma_taller;
-- Solo-añadir: sin UPDATE/DELETE (consentimientos: UPDATE solo de las columnas de retirada).
REVOKE UPDATE, DELETE ON taller.consentimientos, taller.leads_enviados, taller.auditoria FROM prisma_taller;
GRANT UPDATE (retirado_en, motivo_retirada, actualizado_en) ON taller.consentimientos TO prisma_taller;

-- ─── 2. Taller piloto ────────────────────────────────────────────────────────
-- Las políticas RLS exigen el ajuste de sesión también aquí (por si el rol que aplica no es superusuario).
SELECT set_config('taller.taller_id', 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', true);

-- Dirección: Calle Cañada Real 14, Parque Industrial Parque Plata, 41900 Camas (Sevilla).
-- `via` sin el polígono (P.I. Parque Plata) para que case con el callejero del Catastro; el dueño la valida en Ajustes
-- con el buscador CP → Catastro cuando esté. NIF y referencia catastral: NULL = no se sabe todavía (nunca inventados). El dueño los completa.
INSERT INTO taller.talleres (id, razon_social, nombre_comercial, nif, cp, provincia, municipio, via, numero,
                             referencia_catastral, marca_codigo)
VALUES ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'Talleres de Automoción G2', 'Talleres de Automoción G2', NULL,
        '41900', 'Sevilla', 'Camas', 'Calle Cañada Real', '14', NULL, 'talleres-g2')
ON CONFLICT (id) DO NOTHING;

-- configDeAlta(): escalares.
INSERT INTO taller.configuracion (taller_id, precio_hora_cent, validez_presupuesto_dias, itv_antelacion_dias,
  revision_fecha_antelacion_dias, revision_km_antelacion, seguro_antelacion_dias, recordatorio_cita_horas,
  cita_duracion_hueco_minutos, cita_puestos, texto_pie_resguardo, texto_pie_factura, texto_condiciones_presupuesto,
  texto_firma_correo, texto_consentimiento_comercial, version_consentimiento_comercial)
VALUES ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 5000, 30, 30, 30, 1000, 30, 24, 30, 1, '', '', '', '',
        'Acepto que el taller me envíe promociones y campañas propias. Puedo retirarlo cuando quiera.', 'taller-borrador-1')
ON CONFLICT (taller_id) DO NOTHING;

-- configDeAlta(): IVA.
INSERT INTO taller.tipos_iva (taller_id, codigo, nombre, puntos_basicos) VALUES
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'general', 'IVA general', 2100),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'reducido', 'IVA reducido', 1000),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'exento', 'Exento', 0)
ON CONFLICT (taller_id, codigo) DO NOTHING;

INSERT INTO taller.iva_por_defecto (taller_id, tipo_linea, iva_codigo) VALUES
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'mano_obra', 'general'),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'pieza', 'general'),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'granel', 'general'),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'otro', 'general')
ON CONFLICT (taller_id, tipo_linea) DO NOTHING;

-- configDeAlta(): tipos de vehículo (recargo 0 hasta que el dueño diga otra cosa).
INSERT INTO taller.tipos_vehiculo (taller_id, codigo, nombre, recargo_puntos_basicos) VALUES
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'turismo', 'Turismo', 0),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'todoterreno', 'Todoterreno', 0),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'furgoneta', 'Furgoneta', 0),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'otro', 'Otro', 0)
ON CONFLICT (taller_id, codigo) DO NOTHING;

-- configDeAlta(): series de factura.
INSERT INTO taller.series_factura (taller_id, codigo, prefijo, descripcion, rectificativa, por_defecto) VALUES
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'F', 'F', 'Facturas', false, true),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'R', 'R', 'Rectificativas', true, false)
ON CONFLICT (taller_id, codigo) DO NOTHING;

-- configDeAlta(): medios de cobro.
INSERT INTO taller.medios_cobro (taller_id, codigo, nombre, es_efectivo) VALUES
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'efectivo', 'Efectivo', true),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'bizum', 'Bizum', false),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'tarjeta', 'Tarjeta', false),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'transferencia', 'Transferencia', false),
  ('f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b', 'otro', 'Otro', false)
ON CONFLICT (taller_id, codigo) DO NOTHING;

-- Paquetes, aceites y franjas de horario: VACÍOS a propósito (configDeAlta no inventa precios ni horario).

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT rolbypassrls, rolpassword IS NULL FROM pg_roles WHERE rolname = 'prisma_taller';   → false, (true hasta el ALTER)
-- SELECT has_table_privilege('prisma_taller', 'taller.consentimientos', 'DELETE');          → false
-- SELECT has_table_privilege('prisma_taller', 'taller.talleres', 'INSERT');                 → false
-- Como prisma_taller SIN set_config: SELECT count(*) FROM taller.talleres;                    → 0 (falla cerrado)
