-- Vertical TALLER DE VEHÍCULOS — schema `taller` (F1). Spec: docs/superpowers/specs/2026-11-04-taller-global2.md
--
-- ⛔ NO APLICADA. Borrador de F1 que vive junto a `packages/module-taller` hasta que exista `apps/taller`;
--    entonces se MUEVE a `apps/taller/prisma/sql/AAAA-MM-DD_taller_schema.sql` (convención de almacen/mariscos/asegura)
--    y se aplica a mano (preview → prod tras OK de Alberto). No toca ninguna tabla existente.
--
-- Diseño:
--   · Multi-taller: TODA tabla lleva `taller_id` (en `talleres`, su `id`) y las FK entre tablas de negocio son
--     COMPUESTAS (taller_id, x_id) → una fila nunca puede apuntar a otra de otro taller.
--   · RLS activado y FORZADO en todas las tablas. La política compara con `taller.taller_actual()`, que lee
--     `current_setting('taller.taller_id', true)`. La app hace `SELECT set_config('taller.taller_id', $1, true)`
--     al principio de CADA transacción. Sin ajuste → NULL → cero filas (falla CERRADO).
--   · Rol `prisma_taller`: LOGIN, NOBYPASSRLS, sin contraseña (inerte hasta `ALTER ROLE … PASSWORD`, y en el MISMO
--     paso la DATABASE_URL de su proyecto Vercel). Mismo patrón que `prisma_asegura_portal`.
--   · Dinero en céntimos (bigint), IVA en puntos básicos (integer), tiempo en minutos, granel en mililitros.
--     Sin DEFAULT de precio/IVA/intervalo en columnas: los valores de alta los pone la app desde `configDeAlta()`.
--   · Fechas de vencimiento NULL = «no se sabe» (nunca «sin vencimiento»).
--   · `consentimientos`: solo-añadir. Única modificación permitida = poner la marca de retirada (una vez).
--   · `leads_enviados` exige en BD un consentimiento `asegura` otorgado y no retirado (defensa en profundidad del puente).

BEGIN;

CREATE SCHEMA IF NOT EXISTS taller;

CREATE OR REPLACE FUNCTION taller.taller_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('taller.taller_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION taller.tocar_actualizado_en() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

-- ─── Talleres y configuración ────────────────────────────────────────────────
CREATE TABLE taller.talleres (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social     text NOT NULL,
  nombre_comercial text NOT NULL,
  nif              text,
  -- Dirección validada (CP → provincia → municipio → calle del Catastro → número). Sin valores por defecto.
  cp               text,
  provincia        text,
  municipio        text,
  via              text,
  numero           text,
  referencia_catastral text,
  marca_codigo     text,            -- @central/brand
  activo           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

-- Ajustes escalares de `ConfigTaller` (una fila por taller).
CREATE TABLE taller.configuracion (
  taller_id                   uuid PRIMARY KEY REFERENCES taller.talleres(id) ON DELETE CASCADE,
  precio_hora_cent            bigint  NOT NULL CHECK (precio_hora_cent > 0),
  validez_presupuesto_dias    integer NOT NULL CHECK (validez_presupuesto_dias > 0),
  itv_antelacion_dias         integer NOT NULL CHECK (itv_antelacion_dias >= 0),
  revision_fecha_antelacion_dias integer NOT NULL CHECK (revision_fecha_antelacion_dias >= 0),
  revision_km_antelacion      integer NOT NULL CHECK (revision_km_antelacion >= 0),
  seguro_antelacion_dias      integer NOT NULL CHECK (seguro_antelacion_dias >= 0),
  recordatorio_cita_horas     integer NOT NULL CHECK (recordatorio_cita_horas >= 0),
  cita_duracion_hueco_minutos integer NOT NULL CHECK (cita_duracion_hueco_minutos > 0),
  cita_puestos                integer NOT NULL CHECK (cita_puestos > 0),
  texto_pie_resguardo         text NOT NULL DEFAULT '',
  texto_pie_factura           text NOT NULL DEFAULT '',
  texto_condiciones_presupuesto text NOT NULL DEFAULT '',
  texto_firma_correo          text NOT NULL DEFAULT '',
  -- Casilla 2 (comercial del TALLER). La de Grupo ASegura NO es configurable: vive en module-taller.
  texto_consentimiento_comercial   text NOT NULL,
  version_consentimiento_comercial text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE taller.tipos_iva (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  codigo         text NOT NULL,
  nombre         text NOT NULL,
  puntos_basicos integer NOT NULL CHECK (puntos_basicos BETWEEN 0 AND 10000),
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, codigo)
);

CREATE TABLE taller.iva_por_defecto (
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  tipo_linea     text NOT NULL CHECK (tipo_linea IN ('mano_obra','pieza','granel','otro')),
  iva_codigo     text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (taller_id, tipo_linea),
  FOREIGN KEY (taller_id, iva_codigo) REFERENCES taller.tipos_iva(taller_id, codigo)
);

CREATE TABLE taller.tipos_vehiculo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  codigo         text NOT NULL,
  nombre         text NOT NULL,
  recargo_puntos_basicos integer NOT NULL CHECK (recargo_puntos_basicos >= 0),
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, codigo)
);

CREATE TABLE taller.aceites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  codigo           text NOT NULL,
  nombre           text NOT NULL,
  familia          text NOT NULL,           -- generico | especifico | …
  precio_litro_cent bigint NOT NULL CHECK (precio_litro_cent > 0),
  iva_codigo       text,                    -- NULL = iva_por_defecto('granel')
  activo           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, codigo),
  FOREIGN KEY (taller_id, iva_codigo) REFERENCES taller.tipos_iva(taller_id, codigo)
);

CREATE TABLE taller.paquetes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  codigo           text NOT NULL,
  nombre           text NOT NULL,
  baremo_minutos   integer NOT NULL CHECK (baremo_minutos >= 0),
  requiere_aceite  boolean NOT NULL DEFAULT false,
  activo           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, codigo)
);

-- Precio CERRADO de mano de obra por tipo de vehículo (si no hay fila: baremo × hora × recargo).
CREATE TABLE taller.paquete_precios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  paquete_id       uuid NOT NULL,
  tipo_vehiculo_id uuid NOT NULL,
  precio_cent      bigint NOT NULL CHECK (precio_cent >= 0),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, paquete_id, tipo_vehiculo_id),
  FOREIGN KEY (taller_id, paquete_id) REFERENCES taller.paquetes(taller_id, id) ON DELETE CASCADE,
  FOREIGN KEY (taller_id, tipo_vehiculo_id) REFERENCES taller.tipos_vehiculo(taller_id, id)
);

CREATE TABLE taller.paquete_piezas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id            uuid NOT NULL,
  paquete_id           uuid NOT NULL,
  descripcion          text NOT NULL,
  referencia           text,
  cantidad             integer NOT NULL CHECK (cantidad > 0),
  precio_unitario_cent bigint NOT NULL CHECK (precio_unitario_cent >= 0),
  iva_codigo           text,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, paquete_id) REFERENCES taller.paquetes(taller_id, id) ON DELETE CASCADE,
  FOREIGN KEY (taller_id, iva_codigo) REFERENCES taller.tipos_iva(taller_id, codigo)
);

CREATE TABLE taller.series_factura (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  codigo         text NOT NULL,
  prefijo        text NOT NULL,
  descripcion    text NOT NULL,
  rectificativa  boolean NOT NULL DEFAULT false,
  por_defecto    boolean NOT NULL DEFAULT false,
  ultimo_numero  integer NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, codigo)
);
CREATE UNIQUE INDEX ux_series_factura_defecto ON taller.series_factura (taller_id) WHERE por_defecto AND NOT rectificativa;

CREATE TABLE taller.medios_cobro (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  codigo         text NOT NULL,
  nombre         text NOT NULL,
  es_efectivo    boolean NOT NULL DEFAULT false,
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, codigo)
);

CREATE TABLE taller.horario_citas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  dia_semana     smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  desde          time NOT NULL,
  hasta          time NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (desde < hasta)
);

-- ─── Personas ────────────────────────────────────────────────────────────────
CREATE TABLE taller.usuarios_taller (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  rol              text NOT NULL CHECK (rol IN ('recepcion','mecanico','dueno','admin')),
  pin_hash         text NOT NULL,           -- hash (nunca el PIN). Unicidad del PIN: la comprueba la app al fijarlo.
  activo           boolean NOT NULL DEFAULT true,
  intentos_fallidos integer NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta  timestamptz,
  rrhh_persona_id  uuid,                    -- enlace opcional a apps/rrhh (sin FK entre schemas)
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id)
);

CREATE TABLE taller.proveedores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  correo_pedidos   text,
  contacto         text,
  telefono         text,
  activo           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id)
);

CREATE TABLE taller.clientes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  nif              text,
  movil            text,
  correo           text,
  cp               text,
  provincia        text,
  municipio        text,
  via              text,
  numero           text,
  referencia_catastral text,
  app_instalada    boolean NOT NULL DEFAULT false,
  seguros_contacto_id uuid,                 -- solo con consentimiento `asegura` (sección 6); sin FK entre schemas
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id)
);
CREATE INDEX idx_clientes_nif ON taller.clientes (taller_id, nif) WHERE nif IS NOT NULL;

CREATE TABLE taller.vehiculos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  matricula        text NOT NULL,
  -- Espejo de normalizarMatricula() de module-taller (cepo test/esquema-sql.test.ts).
  matricula_normalizada text GENERATED ALWAYS AS (upper(regexp_replace(matricula, '[^A-Za-z0-9]', '', 'g'))) STORED,
  bastidor         text,
  marca            text,
  modelo           text,
  version          text,
  tipo_vehiculo_id uuid,                    -- NULL = no se sabe (el presupuesto por paquete lo pedirá)
  combustible      text,
  fecha_matriculacion date,
  datos_externos   jsonb,                   -- core-vehiculos
  cliente_id       uuid,
  km_actuales      integer CHECK (km_actuales >= 0),
  itv_hasta        date,
  seguro_hasta     date,
  aseguradora      text,
  proxima_revision_km    integer CHECK (proxima_revision_km >= 0),
  proxima_revision_fecha date,
  litros_aceite_ml integer CHECK (litros_aceite_ml > 0),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  CONSTRAINT ux_vehiculos_matricula UNIQUE (taller_id, matricula_normalizada),
  CHECK (matricula_normalizada <> ''),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id),
  FOREIGN KEY (taller_id, tipo_vehiculo_id) REFERENCES taller.tipos_vehiculo(taller_id, id)
);
-- Búsqueda parcial por matrícula ("1234" encuentra "1234BCD").
CREATE INDEX idx_vehiculos_matricula_prefijo ON taller.vehiculos (taller_id, matricula_normalizada text_pattern_ops);
CREATE INDEX idx_vehiculos_cliente ON taller.vehiculos (taller_id, cliente_id);

-- ─── Recepción ───────────────────────────────────────────────────────────────
CREATE TABLE taller.recepciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  vehiculo_id      uuid NOT NULL,
  cliente_id       uuid NOT NULL,
  usuario_id       uuid,
  km_entrada       integer CHECK (km_entrada >= 0),
  nivel_combustible text,
  objetos          text,
  motivo           text,
  danos            jsonb,                   -- puntos sobre croquis + nota
  firma_ruta       text,                    -- core-firma; NULL = sin firmar (no se factura)
  firmado_en       timestamptz,
  resguardo_pdf_ruta text,
  seguro_declarado jsonb,                   -- {vigente, aseguradora, vence} tal como lo dijo el cliente; NULL = no preguntado
  recibido_en      timestamptz NOT NULL DEFAULT now(),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, vehiculo_id) REFERENCES taller.vehiculos(taller_id, id),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id),
  FOREIGN KEY (taller_id, usuario_id) REFERENCES taller.usuarios_taller(taller_id, id),
  CHECK ((firma_ruta IS NULL) = (firmado_en IS NULL))
);
CREATE INDEX idx_recepciones_vehiculo ON taller.recepciones (taller_id, vehiculo_id, recibido_en DESC);

CREATE TABLE taller.recepcion_fotos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  recepcion_id     uuid NOT NULL,
  orden            integer NOT NULL,
  posicion         text,                    -- frontal | trasera | lateral_izq | …
  ruta             text NOT NULL,           -- core-storage
  huella_sha256    text NOT NULL,
  capturada_en     timestamptz NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, recepcion_id) REFERENCES taller.recepciones(taller_id, id) ON DELETE CASCADE
);

-- ─── Presupuestos ────────────────────────────────────────────────────────────
CREATE TABLE taller.presupuestos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  vehiculo_id      uuid NOT NULL,           -- un presupuesto sin matrícula no existe
  cliente_id       uuid,
  origen           text NOT NULL CHECK (origen IN ('taller','casa','ampliacion')),
  estado           text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviado','aceptado','rechazado','caducado')),
  presupuesto_padre_id uuid,
  tipo_vehiculo_codigo text,                -- copia congelada del tipo usado en el cálculo
  precio_hora_cent bigint,                  -- copia congelada del precio hora usado
  base_cent        bigint NOT NULL DEFAULT 0,
  cuota_iva_cent   bigint NOT NULL DEFAULT 0,
  total_cent       bigint NOT NULL DEFAULT 0,
  pdf_ruta         text,
  token_hash       text,                    -- hash del token de aceptación (nunca el token)
  caduca_en        timestamptz,
  aceptado_en      timestamptz,
  aceptado_ip      inet,
  aceptado_texto   text,
  aceptado_firma_ruta text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, vehiculo_id) REFERENCES taller.vehiculos(taller_id, id),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id),
  FOREIGN KEY (taller_id, presupuesto_padre_id) REFERENCES taller.presupuestos(taller_id, id),
  CHECK (total_cent = base_cent + cuota_iva_cent),
  CHECK (estado <> 'aceptado' OR aceptado_en IS NOT NULL)
);
CREATE UNIQUE INDEX ux_presupuestos_token ON taller.presupuestos (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX idx_presupuestos_vehiculo ON taller.presupuestos (taller_id, vehiculo_id, creado_en DESC);

CREATE TABLE taller.presupuesto_lineas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  presupuesto_id   uuid NOT NULL,
  orden            integer NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('mano_obra','pieza','granel','otro')),
  descripcion      text NOT NULL,
  paquete_codigo   text,
  referencia       text,
  cantidad         integer NOT NULL CHECK (cantidad > 0),
  unidad           text NOT NULL CHECK (unidad IN ('min','ml','ud')),
  baremo_minutos   integer,
  precio_cerrado   boolean NOT NULL DEFAULT false,
  base_cent        bigint NOT NULL,
  iva_codigo       text NOT NULL,
  iva_puntos_basicos integer NOT NULL CHECK (iva_puntos_basicos BETWEEN 0 AND 10000),
  cuota_iva_cent   bigint NOT NULL,
  total_cent       bigint NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, presupuesto_id) REFERENCES taller.presupuestos(taller_id, id) ON DELETE CASCADE,
  CHECK (total_cent = base_cent + cuota_iva_cent)
);

CREATE TABLE taller.ampliaciones_fotos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  presupuesto_id   uuid NOT NULL,           -- la ampliación es un presupuesto con origen 'ampliacion'
  ruta             text NOT NULL,
  huella_sha256    text NOT NULL,
  nota             text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, presupuesto_id) REFERENCES taller.presupuestos(taller_id, id) ON DELETE CASCADE
);

-- ─── Orden de trabajo, líneas, partes, dictados ─────────────────────────────
CREATE TABLE taller.ordenes_trabajo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  numero           integer NOT NULL,
  recepcion_id     uuid NOT NULL,
  vehiculo_id      uuid NOT NULL,
  presupuesto_id   uuid,
  -- Espejo de ESTADOS_OT de module-taller/src/ot.ts (cepo test/esquema-sql.test.ts).
  estado           text NOT NULL DEFAULT 'recepcion' CHECK (estado IN (
                     'recepcion','presupuesto','aceptado','en_curso','ampliacion_pendiente',
                     'terminado','facturado','entregado','cancelada')),
  terminado_en     timestamptz,
  entregado_en     timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, numero),
  FOREIGN KEY (taller_id, recepcion_id) REFERENCES taller.recepciones(taller_id, id),
  FOREIGN KEY (taller_id, vehiculo_id) REFERENCES taller.vehiculos(taller_id, id),
  FOREIGN KEY (taller_id, presupuesto_id) REFERENCES taller.presupuestos(taller_id, id)
);
CREATE INDEX idx_ot_estado ON taller.ordenes_trabajo (taller_id, estado);
CREATE INDEX idx_ot_vehiculo ON taller.ordenes_trabajo (taller_id, vehiculo_id);

CREATE TABLE taller.ot_lineas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  ot_id            uuid NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('mano_obra','pieza','granel','paquete','otro')),
  descripcion      text NOT NULL,
  cantidad         integer NOT NULL CHECK (cantidad > 0),
  unidad           text NOT NULL CHECK (unidad IN ('min','ml','ud')),
  base_cent        bigint NOT NULL,
  iva_codigo       text NOT NULL,
  iva_puntos_basicos integer NOT NULL CHECK (iva_puntos_basicos BETWEEN 0 AND 10000),
  cuota_iva_cent   bigint NOT NULL,
  total_cent       bigint NOT NULL,
  baremo_minutos   integer CHECK (baremo_minutos >= 0),   -- NULL = sin baremo (no 0)
  minutos_reales   integer CHECK (minutos_reales >= 0),   -- NULL = no medido (margen NULL, no 0)
  articulo_id      uuid,
  pedido_linea_id  uuid,
  origen           text NOT NULL CHECK (origen IN ('dictado','manual','paquete','ampliacion')),
  aceptada_en      timestamptz,             -- ampliación sin aceptar no pasa a la factura
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id) ON DELETE CASCADE,
  CHECK (total_cent = base_cent + cuota_iva_cent)
);
CREATE INDEX idx_ot_lineas_ot ON taller.ot_lineas (taller_id, ot_id);

CREATE TABLE taller.partes_horas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  ot_id            uuid NOT NULL,
  mecanico_id      uuid NOT NULL,
  inicio           timestamptz NOT NULL,
  fin              timestamptz,
  minutos          integer GENERATED ALWAYS AS (
                     CASE WHEN fin IS NULL THEN NULL
                          ELSE round(extract(epoch FROM (fin - inicio)) / 60)::integer END) STORED,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, mecanico_id) REFERENCES taller.usuarios_taller(taller_id, id),
  CHECK (fin IS NULL OR fin >= inicio)
);
-- Un mecánico, un parte abierto a la vez.
CREATE UNIQUE INDEX ux_partes_un_abierto ON taller.partes_horas (taller_id, mecanico_id) WHERE fin IS NULL;
CREATE INDEX idx_partes_ot ON taller.partes_horas (taller_id, ot_id);

CREATE TABLE taller.dictados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  ot_id            uuid NOT NULL,
  mecanico_id      uuid NOT NULL,
  audio_ruta       text,
  transcripcion    text,
  propuesta        jsonb,
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','descartado')),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, mecanico_id) REFERENCES taller.usuarios_taller(taller_id, id)
);

CREATE TABLE taller.baremos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  operacion        text NOT NULL,
  marca            text,
  modelo           text,
  familia          text,
  minutos          integer NOT NULL CHECK (minutos >= 0),
  origen           text NOT NULL CHECK (origen IN ('propio','comercial','experiencia')),
  vigente_desde    date,
  vigente_hasta    date,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

-- ─── Stock y pedidos (F2; tablas creadas ya para no migrar dos veces) ───────
CREATE TABLE taller.articulos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  referencia       text,
  referencia_fabricante text,
  descripcion      text NOT NULL,
  unidad           text NOT NULL CHECK (unidad IN ('ud','ml')),
  minimo           integer CHECK (minimo >= 0),        -- NULL = no se lleva a stock
  coste_medio_cent bigint CHECK (coste_medio_cent >= 0),
  ml_por_envase    integer CHECK (ml_por_envase > 0),
  stock            integer,                             -- NULL = no se lleva (≠ 0 existencias)
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id)
);

CREATE TABLE taller.movimientos_stock (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  articulo_id      uuid NOT NULL,
  ot_id            uuid,
  cantidad         integer NOT NULL CHECK (cantidad <> 0),
  motivo           text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, articulo_id) REFERENCES taller.articulos(taller_id, id),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id)
);
-- Granel: se descuenta UNA vez por OT y artículo (al cerrar la OT).
CREATE UNIQUE INDEX ux_movimientos_granel_ot ON taller.movimientos_stock (taller_id, ot_id, articulo_id)
  WHERE ot_id IS NOT NULL AND motivo = 'consumo_ot';

CREATE TABLE taller.pedidos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  ot_id            uuid,
  proveedor_id     uuid NOT NULL,
  matricula        text,
  estado           text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviado','albaran','recibido','facturado')),
  enviado_por      uuid,                    -- el dueño que pulsó Enviar (nada sale sin su botón)
  enviado_en       timestamptz,
  correo_id        text,
  albaran_url      text,
  recibido_en      timestamptz,
  factura_proveedor jsonb,                  -- OCR module-asn
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, proveedor_id) REFERENCES taller.proveedores(taller_id, id),
  FOREIGN KEY (taller_id, enviado_por) REFERENCES taller.usuarios_taller(taller_id, id),
  CHECK (estado = 'borrador' OR (enviado_por IS NOT NULL AND enviado_en IS NOT NULL))
);

CREATE TABLE taller.pedido_lineas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  pedido_id        uuid NOT NULL,
  ot_linea_id      uuid,
  articulo_id      uuid,
  descripcion      text NOT NULL,
  referencia       text,
  cantidad         integer NOT NULL CHECK (cantidad > 0),
  coste_unitario_cent bigint CHECK (coste_unitario_cent >= 0),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, pedido_id) REFERENCES taller.pedidos(taller_id, id) ON DELETE CASCADE,
  FOREIGN KEY (taller_id, ot_linea_id) REFERENCES taller.ot_lineas(taller_id, id),
  FOREIGN KEY (taller_id, articulo_id) REFERENCES taller.articulos(taller_id, id)
);

-- ─── Citas ───────────────────────────────────────────────────────────────────
CREATE TABLE taller.citas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  cliente_id       uuid,
  vehiculo_id      uuid NOT NULL,
  presupuesto_id   uuid,
  inicio           timestamptz NOT NULL,
  duracion_minutos integer NOT NULL CHECK (duracion_minutos > 0),
  puesto           integer NOT NULL DEFAULT 1 CHECK (puesto > 0),
  motivo           text,
  estado           text NOT NULL DEFAULT 'pedida' CHECK (estado IN ('pedida','confirmada','cancelada','realizada','no_presentado')),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id),
  FOREIGN KEY (taller_id, vehiculo_id) REFERENCES taller.vehiculos(taller_id, id),
  FOREIGN KEY (taller_id, presupuesto_id) REFERENCES taller.presupuestos(taller_id, id)
);
CREATE INDEX idx_citas_inicio ON taller.citas (taller_id, inicio);

-- ─── Factura y cobros (F2) ───────────────────────────────────────────────────
CREATE TABLE taller.facturas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  ot_id            uuid NOT NULL,
  serie_id         uuid NOT NULL,
  numero           integer NOT NULL CHECK (numero > 0),
  emitida_en       timestamptz NOT NULL,
  lineas           jsonb NOT NULL,          -- copia congelada
  base_cent        bigint NOT NULL,
  cuota_iva_cent   bigint NOT NULL,
  total_cent       bigint NOT NULL,
  verifactu_huella text,
  verifactu_qr     text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, serie_id, numero),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, serie_id) REFERENCES taller.series_factura(taller_id, id),
  CHECK (total_cent = base_cent + cuota_iva_cent)
);

CREATE TABLE taller.cobros (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  factura_id       uuid NOT NULL,
  medio_cobro_id   uuid NOT NULL,
  importe_cent     bigint NOT NULL CHECK (importe_cent > 0),
  cobrado_en       timestamptz NOT NULL,
  justificante_ruta text,                   -- core-receipts
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, factura_id) REFERENCES taller.facturas(taller_id, id),
  FOREIGN KEY (taller_id, medio_cobro_id) REFERENCES taller.medios_cobro(taller_id, id)
);

-- ─── Consentimientos (SOLO AÑADIR) y leads ──────────────────────────────────
CREATE TABLE taller.consentimientos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  cliente_id       uuid NOT NULL,
  -- Espejo de FINALIDADES_CONSENTIMIENTO / CANALES_CONSENTIMIENTO (cepo test/esquema-sql.test.ts).
  finalidad        text NOT NULL CHECK (finalidad IN ('asegura','taller_comercial')),
  otorgado         boolean NOT NULL,
  version_texto    text NOT NULL CHECK (version_texto <> ''),
  texto_mostrado   text NOT NULL CHECK (texto_mostrado <> ''),
  canal            text NOT NULL CHECK (canal IN ('recepcion','presupuesto_casa','app')),
  firma_ruta       text,
  ip               inet,
  user_agent       text,
  otorgado_en      timestamptz NOT NULL DEFAULT now(),
  retirado_en      timestamptz,
  motivo_retirada  text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id),
  CHECK (retirado_en IS NULL OR retirado_en >= otorgado_en)
);
CREATE INDEX idx_consentimientos_cliente ON taller.consentimientos (taller_id, cliente_id, finalidad, otorgado_en DESC);

-- Única modificación permitida: poner la marca de retirada UNA vez. Nada se borra.
CREATE OR REPLACE FUNCTION taller.consentimientos_solo_retirada() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'taller.consentimientos es solo-añadir: no se borra (retira con retirado_en)';
  END IF;
  IF OLD.retirado_en IS NOT NULL THEN
    RAISE EXCEPTION 'consentimiento % ya retirado: no se modifica', OLD.id;
  END IF;
  IF NEW.retirado_en IS NULL THEN
    RAISE EXCEPTION 'la única modificación permitida es poner retirado_en';
  END IF;
  IF (NEW.id, NEW.taller_id, NEW.cliente_id, NEW.finalidad, NEW.otorgado, NEW.version_texto, NEW.texto_mostrado,
      NEW.canal, NEW.firma_ruta, NEW.ip, NEW.user_agent, NEW.otorgado_en, NEW.creado_en)
     IS DISTINCT FROM
     (OLD.id, OLD.taller_id, OLD.cliente_id, OLD.finalidad, OLD.otorgado, OLD.version_texto, OLD.texto_mostrado,
      OLD.canal, OLD.firma_ruta, OLD.ip, OLD.user_agent, OLD.otorgado_en, OLD.creado_en) THEN
    RAISE EXCEPTION 'la única modificación permitida es poner retirado_en';
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_consentimientos_solo_retirada
  BEFORE UPDATE OR DELETE ON taller.consentimientos
  FOR EACH ROW EXECUTE FUNCTION taller.consentimientos_solo_retirada();

CREATE TABLE taller.leads_enviados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  cliente_id       uuid NOT NULL,
  consentimiento_id uuid NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('auto','hogar')),
  origen           text NOT NULL DEFAULT 'taller' CHECK (origen = 'taller'),
  seguros_lead_id  text,                    -- id devuelto por apps/asegura /api/operador/*
  resultado        text NOT NULL CHECK (resultado IN ('creado','rechazado_destino','error')),
  detalle          text,
  enviado_en       timestamptz NOT NULL DEFAULT now(),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, consentimiento_id) REFERENCES taller.consentimientos(taller_id, id),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id)
);

-- Defensa en profundidad: ningún lead se registra sin consentimiento `asegura` otorgado y no retirado del MISMO cliente.
CREATE OR REPLACE FUNCTION taller.leads_exigen_consentimiento() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM taller.consentimientos c
     WHERE c.taller_id = NEW.taller_id AND c.id = NEW.consentimiento_id AND c.cliente_id = NEW.cliente_id
       AND c.finalidad = 'asegura' AND c.otorgado AND c.retirado_en IS NULL
  ) THEN
    RAISE EXCEPTION 'lead sin consentimiento asegura vigente (consentimiento %)', NEW.consentimiento_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_leads_exigen_consentimiento
  BEFORE INSERT ON taller.leads_enviados
  FOR EACH ROW EXECUTE FUNCTION taller.leads_exigen_consentimiento();
CREATE OR REPLACE FUNCTION taller.solo_insertar() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es solo-añadir', TG_TABLE_NAME;
END $$;
CREATE TRIGGER trg_leads_solo_insertar
  BEFORE UPDATE OR DELETE ON taller.leads_enviados
  FOR EACH ROW EXECUTE FUNCTION taller.solo_insertar();

-- ─── Avisos y auditoría ──────────────────────────────────────────────────────
CREATE TABLE taller.avisos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  cliente_id       uuid NOT NULL,
  vehiculo_id      uuid,
  -- Espejo de TIPOS_AVISO_* de module-taller/src/avisos.ts.
  tipo             text NOT NULL CHECK (tipo IN ('terminado','cita','presupuesto','itv','revision_fecha','revision_km','seguro','promocion')),
  canal            text NOT NULL CHECK (canal IN ('push','correo')),
  comercial        boolean NOT NULL,
  consentimiento_id uuid,
  programado_en    timestamptz NOT NULL,
  enviado_en       timestamptz,
  error            text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, cliente_id) REFERENCES taller.clientes(taller_id, id),
  FOREIGN KEY (taller_id, vehiculo_id) REFERENCES taller.vehiculos(taller_id, id),
  FOREIGN KEY (taller_id, consentimiento_id) REFERENCES taller.consentimientos(taller_id, id),
  CHECK (NOT comercial OR consentimiento_id IS NOT NULL)
);
CREATE INDEX idx_avisos_pendientes ON taller.avisos (taller_id, programado_en) WHERE enviado_en IS NULL;

CREATE TABLE taller.auditoria (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  usuario_id       uuid,
  entidad          text NOT NULL,
  entidad_id       uuid,
  accion           text NOT NULL,
  antes            jsonb,
  despues          jsonb,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_entidad ON taller.auditoria (taller_id, entidad, entidad_id, creado_en DESC);
CREATE TRIGGER trg_auditoria_solo_insertar
  BEFORE UPDATE OR DELETE ON taller.auditoria
  FOR EACH ROW EXECUTE FUNCTION taller.solo_insertar();

-- ─── actualizado_en, RLS y políticas (bucle sobre TODAS las tablas del schema) ─
DO $$
DECLARE
  t text;
  col text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'taller' LOOP
    IF t NOT IN ('consentimientos', 'leads_enviados', 'auditoria') THEN
      EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON taller.%I
                      FOR EACH ROW EXECUTE FUNCTION taller.tocar_actualizado_en()', t, t);
    END IF;
    col := CASE WHEN t = 'talleres' THEN 'id' ELSE 'taller_id' END;
    EXECUTE format('ALTER TABLE taller.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE taller.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON taller.%I USING (%I = taller.taller_actual()) WITH CHECK (%I = taller.taller_actual())',
                   t || '_por_taller', t, col, col);
  END LOOP;
END $$;

-- ─── Rol de la app: LOGIN, NOBYPASSRLS, sin contraseña (inerte) ─────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_taller') THEN
    CREATE ROLE prisma_taller WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE prisma_taller SET search_path = taller, public;

GRANT USAGE ON SCHEMA taller TO prisma_taller;
GRANT EXECUTE ON FUNCTION taller.taller_actual() TO prisma_taller;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA taller TO prisma_taller;
-- Alta/baja de talleres: solo el operador (no la app del taller).
REVOKE INSERT, DELETE ON taller.talleres FROM prisma_taller;
-- Solo-añadir: sin UPDATE/DELETE (consentimientos: UPDATE solo de las columnas de retirada).
REVOKE UPDATE, DELETE ON taller.consentimientos, taller.leads_enviados, taller.auditoria FROM prisma_taller;
GRANT UPDATE (retirado_en, motivo_retirada, actualizado_en) ON taller.consentimientos TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT rolbypassrls FROM pg_roles WHERE rolname = 'prisma_taller';                  → false
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity); → 0 filas
-- SELECT has_table_privilege('prisma_taller', 'taller.consentimientos', 'DELETE');    → false
-- Como prisma_taller SIN set_config: SELECT count(*) FROM taller.vehiculos;             → 0 (falla cerrado)
