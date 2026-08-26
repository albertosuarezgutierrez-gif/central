-- 🏛️ Base patrimonial — activos, valoraciones y memoria de decisiones del coordinador.
--
-- POR QUÉ (22/08/2026, diseño docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md):
-- el ladrillo —el grueso del patrimonio de Alberto— estaba A CERO como activo en el sistema:
-- `properties` es la unidad de EXPLOTACIÓN (Smoobu, dormitorios) y no sabe de m², titularidad,
-- valor de compra, hipoteca ni valor de mercado; Monte Carmelo 68 ni existía como fila. Sin esta
-- base no hay patrimonio neto, ni coste de oportunidad por activo, ni escenarios de venta/recompra.
--
-- Reglas de la casa que esta tabla encarna:
-- · NULL = «no se sabe todavía» (tri-estado). PROHIBIDO colapsarlo a 0 aguas abajo.
-- · Una valoración NUNCA se pisa: se añade fila nueva; la vigente es la más reciente por
--   (activo, enfoque). Cada valor lleva su fuente y su fecha — las cifras orientativas de
--   Alberto entran como fuente 'alberto', las del agente como 'agente:<método>'.
-- · Valoración DUAL: enfoque 'vivienda' (piso a secas) vs 'vut' (negocio turístico en marcha,
--   licencia incluida) vs 'mixto' (sin distinguir). La diferencia vivienda↔vut ES el valor de
--   la licencia — y también su riesgo regulatorio.
--
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql).

CREATE TABLE IF NOT EXISTS patrimonio_activos (
  -- Slug estable legible, p.ej. 'act_duplex_center' (mismo espíritu que properties.id).
  id            text PRIMARY KEY,
  cuenta_id     uuid NOT NULL,
  nombre        text NOT NULL,
  -- 'inmueble' | 'otro'. El bróker NO va aquí (ya vive en broker_saldos; la vista lo suma de ahí).
  tipo          text NOT NULL DEFAULT 'inmueble',
  -- Enlace a la unidad de explotación turística (properties.id), si la hay.
  property_id   text,
  direccion     text,
  ref_catastral text,
  m2            numeric,
  anio_construccion integer,
  -- 'turistico' | 'vivienda_habitual' | 'alquiler_lp' | 'otro'. NULL = sin clasificar.
  uso           text,
  -- 'propiedad' | 'alquilado' (subarrendado: genera negocio pero NO es activo en propiedad).
  tenencia      text NOT NULL DEFAULT 'propiedad',
  -- Titularidad en %. NULL = no se sabe (≠ 0, que significa «no participa»).
  pct_titular   numeric,
  pct_conyuge   numeric,
  pct_sociedad  numeric,
  -- 'compra' | 'donacion' | 'herencia'.
  modo_adquisicion   text,
  fecha_adquisicion  date,
  valor_adquisicion  numeric,
  gastos_adquisicion numeric,
  -- De dónde sale el valor de adquisición: 'escritura' | 'alberto' | 'doc:<ruta>'.
  valor_adquisicion_fuente text,
  -- Licencia de vivienda turística: true/false conocido, NULL = sin confirmar.
  licencia_vut      boolean,
  licencia_vut_num  text,
  -- Hipoteca sobre ESTE activo. Todo NULL-able: la cuota puede conocerse (banco) sin conocer
  -- el capital pendiente (solo lo sabe Alberto / el banco en su área privada).
  hipoteca_capital_pendiente numeric,
  hipoteca_cuota_mensual     numeric,
  hipoteca_tipo              text,
  hipoteca_vencimiento       date,
  -- 'activo' | 'vendido' | 'baja' (retirado del patrimonio sin venta: p.ej. los dos Busto,
  -- subarrendados — no son propiedad; dados de baja el 23/08/2026 por orden de Alberto).
  estado        text NOT NULL DEFAULT 'activo',
  fecha_venta   date,
  importe_venta numeric,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patrimonio_activos_cuenta_idx ON patrimonio_activos (cuenta_id, estado);

CREATE TABLE IF NOT EXISTS patrimonio_valoraciones (
  id        bigserial PRIMARY KEY,
  activo_id text NOT NULL REFERENCES patrimonio_activos(id),
  -- 'vivienda' | 'vut' | 'mixto' — la valoración dual son filas distintas del mismo activo.
  enfoque   text NOT NULL DEFAULT 'mixto',
  valor     numeric NOT NULL,
  fecha     date NOT NULL DEFAULT current_date,
  -- 'alberto' | 'agente:<método>' | 'tasacion'. Sin fuente no hay fila (nada de centinelas).
  fuente    text NOT NULL,
  metodo    text,
  notas     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- La consulta caliente: valoración vigente por (activo, enfoque).
CREATE INDEX IF NOT EXISTS patrimonio_valoraciones_vigente_idx
  ON patrimonio_valoraciones (activo_id, enfoque, fecha DESC);

-- Memoria de decisiones del coordinador (mismo espíritu que trading_tesis): qué aconsejó,
-- con qué datos, qué decidió Alberto y cómo salió. La consume agentes-entrenador.
CREATE TABLE IF NOT EXISTS patrimonio_recomendaciones (
  id            bigserial PRIMARY KEY,
  cuenta_id     uuid NOT NULL,
  fecha         date NOT NULL DEFAULT current_date,
  agente        text NOT NULL DEFAULT 'patrimonio-cfo',
  titulo        text NOT NULL,
  recomendacion text NOT NULL,
  -- Snapshot de los datos sobre los que se recomendó (para auditar el acierto después).
  datos         jsonb,
  -- NULL = Alberto aún no ha decidido (≠ 'ignorada').
  decision_alberto text,
  decidido_at      timestamptz,
  outcome          text,
  outcome_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patrimonio_recomendaciones_cuenta_idx
  ON patrimonio_recomendaciones (cuenta_id, fecha DESC);

-- Tablas del panel privado: nada que exponer a los roles de la API pública.
REVOKE ALL ON patrimonio_activos FROM anon, authenticated;
REVOKE ALL ON patrimonio_valoraciones FROM anon, authenticated;
REVOKE ALL ON patrimonio_recomendaciones FROM anon, authenticated;
REVOKE ALL ON SEQUENCE patrimonio_valoraciones_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE patrimonio_recomendaciones_id_seq FROM anon, authenticated;

-- ── Seed (idempotente): los 5 inmuebles del grupo. Lo que no se sabe queda NULL a propósito ──
-- El cuenta_id se resuelve por email (no se hardcodea un uuid generado).

INSERT INTO patrimonio_activos
  (id, cuenta_id, nombre, tipo, property_id, direccion, ref_catastral, m2, anio_construccion,
   uso, tenencia, pct_titular, pct_conyuge, pct_sociedad, modo_adquisicion, fecha_adquisicion,
   valor_adquisicion, valor_adquisicion_fuente, licencia_vut, hipoteca_cuota_mensual, notas)
SELECT v.* FROM (
  SELECT
    'act_house_sevillana',
    (SELECT id FROM cuentas WHERE email = 'alberto.suarez.gutierrez@gmail.com'),
    'Socorro 24 — House Sevillana', 'inmueble', 'prop_house_sevillana',
    'Calle Socorro 24, 41003 Sevilla', NULL::text, NULL::numeric, NULL::integer,
    'turistico', 'propiedad', 50::numeric, 50::numeric, NULL::numeric,
    NULL::text, NULL::date,
    360000::numeric, 'alberto (orientativo, 22/08/2026 — pendiente de escritura)',
    true, NULL::numeric,
    'Base de subsistencia familiar: toda propuesta dinámica que la toque se marca y cuantifica el peor caso.'
  UNION ALL SELECT
    'act_duplex_center',
    (SELECT id FROM cuentas WHERE email = 'alberto.suarez.gutierrez@gmail.com'),
    'Villasís — Dúplex Center', 'inmueble', 'prop_duplex_center',
    'Pasaje Villasís 1, Es:2 Pl:01 Pt:C, 41003 Sevilla (acceso alternativo por Pasaje Francisco Molina 4)', '5029006TG3452G0019BG',
    65.46, 1981,
    'turistico', 'propiedad', 100, NULL, NULL,
    'donacion', DATE '2024-05-21',
    174650.90, 'escritura donación (docs/FISCAL-venta-duplex-villasis.md)',
    true, NULL,
    'Valor de adquisición corregido a efectos IRPF ≈173.307,08€ (amortizaciones −2.684,39€). m² catastro: 61. 100% pagado, sin hipoteca.'
  UNION ALL SELECT
    'act_luxury_busto',
    (SELECT id FROM cuentas WHERE email = 'alberto.suarez.gutierrez@gmail.com'),
    'Bustos Tavera 22 dcha — Luxury Busto', 'inmueble', 'prop_luxury_busto',
    'Calle Bustos Tavera 22, bajo derecha, 41003 Sevilla', NULL, NULL, NULL,
    'turistico', 'alquilado', NULL, NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    true, NULL,
    'Subarrendado (arrendador Gutiérrez Alcalá, renta ~309,38€/mes según gastos_fijos): genera negocio pero NO es activo en propiedad.'
  UNION ALL SELECT
    'act_busto_reform',
    (SELECT id FROM cuentas WHERE email = 'alberto.suarez.gutierrez@gmail.com'),
    'Bustos Tavera 22 izda — Busto Reform', 'inmueble', 'prop_busto_reform',
    'Calle Bustos Tavera 22, bajo izquierda, 41003 Sevilla', NULL, NULL, NULL,
    'turistico', 'alquilado', NULL, NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    true, NULL,
    'Subarrendado (arrendador Gutiérrez Alcalá, renta ~259,16€/mes según gastos_fijos): genera negocio pero NO es activo en propiedad.'
  UNION ALL SELECT
    'act_monte_carmelo',
    (SELECT id FROM cuentas WHERE email = 'alberto.suarez.gutierrez@gmail.com'),
    'Monte Carmelo 68 — vivienda habitual', 'inmueble', NULL,
    'Calle Monte Carmelo 68, 41011 Sevilla', NULL, NULL, NULL,
    'vivienda_habitual', 'propiedad', NULL, NULL, NULL,
    NULL, NULL,
    NULL, NULL,
    NULL, 772.86,
    'Cuota de hipoteca conocida por movimientos_bancarios (CUOTA PTMO 856289293-5; 754,67€ hasta abr-2026). Capital pendiente, tipo, vencimiento, titularidad y valor de compra: pendientes de Alberto.'
) AS v
ON CONFLICT (id) DO NOTHING;

-- Valoraciones semilla (orientativas de Alberto; el radar añadirá las suyas con método).
INSERT INTO patrimonio_valoraciones (activo_id, enfoque, valor, fecha, fuente, metodo, notas)
SELECT v.* FROM (
  SELECT 'act_duplex_center', 'vut', 320000::numeric, DATE '2026-08-20', 'alberto',
         'plan de venta (docs/DUPLEX-plan-precio-reforma-venta.md)',
         'Precio de venta planteado; IRPF estimado ~32.300€ + plusvalía ~970€ → neto 271-286k (docs/FISCAL-venta-duplex-villasis.md).'
  UNION ALL
  SELECT 'act_house_sevillana', 'mixto', 1000000::numeric, DATE '2026-08-22', 'alberto',
         'estimación verbal orientativa',
         'Cifra dictada por Alberto el 22/08/2026 («casi un millón»); pendiente de contraste del radar con €/m² de zona.'
) AS v(activo_id, enfoque, valor, fecha, fuente, metodo, notas)
WHERE NOT EXISTS (
  SELECT 1 FROM patrimonio_valoraciones pv
  WHERE pv.activo_id = v.activo_id AND pv.fuente = 'alberto' AND pv.fecha = v.fecha
);
