-- Vertical TALLER — 0011: ARTÍCULOS, ALMACÉN (movimientos inmutables), PEDIDOS a proveedor y ALBARANES de entrada (F2).
-- Requiere 0001-0010. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
-- Spec: docs/superpowers/specs/2026-11-04-taller-global2.md §3, §4.5, §4.6 (F2).
--
--  1) `articulos` (creada ya en 0001) gana marca, PVP, margen por defecto (pb sobre coste), IVA, activo. Unidades: `ud` o `ml`
--     (granel: milésimas de litro, enteros). `stock` NULL = no se lleva a stock (≠ 0). `coste_medio_cent` = céntimos por ud o por
--     LITRO. Sin DELETE: se desactiva (`activo`).
--  2) `movimientos_stock` pasa a SOLO-AÑADIR (trigger + sin UPDATE/DELETE): entrada por albarán, salida por OT, ajuste de inventario
--     con motivo escrito. Signo de `cantidad` validado por tipo. Una corrección = otro movimiento, nunca editar el anterior.
--  3) `pedidos`/`pedido_lineas`: estados borrador · enviado (marcado a mano: la app NO envía nada) · parcial · recibido · facturado ·
--     cancelado; `cantidad_recibida` por línea. Las líneas de un pedido ya no-borrador no se tocan salvo lo recibido.
--  4) `albaranes`/`albaran_lineas` NUEVAS: entrada de mercancía (sube stock y recalcula el coste medio en la app). Una línea puede entrar
--     sin precio y valorarse luego con la factura del proveedor (único UPDATE permitido: coste/IVA de NULL a valor).
--  5) `hechos_pendientes.tipo` admite 'compra' (puerto contable: el albarán valorado con la factura del proveedor).
-- RLS forzado con la política por taller de siempre; las FK entre tablas de negocio son COMPUESTAS (taller_id, x_id).
BEGIN;

-- ─── 1) Artículos ────────────────────────────────────────────────────────────
ALTER TABLE taller.articulos ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE taller.articulos ADD COLUMN IF NOT EXISTS pvp_cent bigint;
ALTER TABLE taller.articulos ADD COLUMN IF NOT EXISTS margen_puntos_basicos integer;
ALTER TABLE taller.articulos ADD COLUMN IF NOT EXISTS iva_codigo text;
ALTER TABLE taller.articulos ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articulos_pvp_chk') THEN
    ALTER TABLE taller.articulos ADD CONSTRAINT articulos_pvp_chk CHECK (pvp_cent IS NULL OR pvp_cent >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articulos_margen_chk') THEN
    ALTER TABLE taller.articulos ADD CONSTRAINT articulos_margen_chk CHECK (margen_puntos_basicos IS NULL OR margen_puntos_basicos >= 0);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_articulos_referencia ON taller.articulos (taller_id, referencia) WHERE referencia IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articulos_taller ON taller.articulos (taller_id, activo, descripcion);
REVOKE DELETE ON taller.articulos FROM prisma_taller;

-- ─── 2) Movimientos de stock: SOLO-AÑADIR ────────────────────────────────────
ALTER TABLE taller.movimientos_stock ADD COLUMN IF NOT EXISTS nota text;
ALTER TABLE taller.movimientos_stock ADD COLUMN IF NOT EXISTS coste_unitario_cent bigint;
ALTER TABLE taller.movimientos_stock ADD COLUMN IF NOT EXISTS stock_resultante integer;
ALTER TABLE taller.movimientos_stock ADD COLUMN IF NOT EXISTS usuario_id uuid;
ALTER TABLE taller.movimientos_stock ADD COLUMN IF NOT EXISTS albaran_linea_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_stock_motivo_chk') THEN
    ALTER TABLE taller.movimientos_stock ADD CONSTRAINT movimientos_stock_motivo_chk CHECK (
      (motivo = 'entrada_albaran'    AND cantidad > 0)
      OR (motivo IN ('consumo_ot', 'consumo_ot_extra') AND cantidad < 0 AND ot_id IS NOT NULL)
      OR (motivo = 'devolucion_ot'   AND cantidad > 0 AND ot_id IS NOT NULL)
      OR (motivo = 'ajuste_inventario' AND length(btrim(coalesce(nota, ''))) > 0)   -- el ajuste exige MOTIVO escrito
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_stock_usuario_fk') THEN
    ALTER TABLE taller.movimientos_stock ADD CONSTRAINT movimientos_stock_usuario_fk
      FOREIGN KEY (taller_id, usuario_id) REFERENCES taller.usuarios_taller(taller_id, id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_movimientos_articulo ON taller.movimientos_stock (taller_id, articulo_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_ot ON taller.movimientos_stock (taller_id, ot_id) WHERE ot_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_movimientos_stock_solo_insertar ON taller.movimientos_stock;
CREATE TRIGGER trg_movimientos_stock_solo_insertar
  BEFORE UPDATE OR DELETE ON taller.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION taller.solo_insertar();
REVOKE UPDATE, DELETE ON taller.movimientos_stock FROM prisma_taller;

-- ─── 3) Pedidos ──────────────────────────────────────────────────────────────
ALTER TABLE taller.pedidos ADD COLUMN IF NOT EXISTS notas text;
ALTER TABLE taller.pedidos ADD COLUMN IF NOT EXISTS cancelado_en timestamptz;
ALTER TABLE taller.pedido_lineas ADD COLUMN IF NOT EXISTS cantidad_recibida integer NOT NULL DEFAULT 0;
ALTER TABLE taller.pedido_lineas ADD COLUMN IF NOT EXISTS unidad text NOT NULL DEFAULT 'ud';

DO $$
DECLARE c record;
BEGIN
  -- Los CHECK de 0001 no tienen nombre propio: se localizan por su definición y se sustituyen por los nuevos.
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'taller.pedidos'::regclass AND contype = 'c'
            AND (pg_get_constraintdef(oid) LIKE '%borrador%' ) AND conname NOT IN ('pedidos_estado_chk', 'pedidos_enviado_chk')
  LOOP
    EXECUTE format('ALTER TABLE taller.pedidos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_estado_chk') THEN
    ALTER TABLE taller.pedidos ADD CONSTRAINT pedidos_estado_chk
      CHECK (estado IN ('borrador', 'enviado', 'parcial', 'recibido', 'facturado', 'cancelado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_enviado_chk') THEN
    -- «enviado» = el dueño lo marcó a mano (nada sale de la app): hay quién y cuándo.
    ALTER TABLE taller.pedidos ADD CONSTRAINT pedidos_enviado_chk
      CHECK (estado IN ('borrador', 'cancelado') OR (enviado_por IS NOT NULL AND enviado_en IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_lineas_unidad_chk') THEN
    ALTER TABLE taller.pedido_lineas ADD CONSTRAINT pedido_lineas_unidad_chk CHECK (unidad IN ('ud', 'ml'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_lineas_recibida_chk') THEN
    ALTER TABLE taller.pedido_lineas ADD CONSTRAINT pedido_lineas_recibida_chk CHECK (cantidad_recibida >= 0);
  END IF;
END $$;
-- pedido_lineas necesita la clave compuesta para la FK de albaran_lineas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_lineas_taller_id_id_key') THEN
    ALTER TABLE taller.pedido_lineas ADD CONSTRAINT pedido_lineas_taller_id_id_key UNIQUE (taller_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON taller.pedidos (taller_id, estado, creado_en DESC);
REVOKE DELETE ON taller.pedidos FROM prisma_taller;

-- Un pedido que ya salió del borrador no cambia de contenido: solo `cantidad_recibida` (y coste al recibir).
CREATE OR REPLACE FUNCTION taller.pedido_lineas_congeladas() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE est text;
BEGIN
  SELECT estado INTO est FROM taller.pedidos WHERE taller_id = OLD.taller_id AND id = OLD.pedido_id;
  IF est IS NULL OR est = 'borrador' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'las líneas de un pedido ya enviado no se borran'; END IF;
  IF NEW.descripcion IS DISTINCT FROM OLD.descripcion OR NEW.cantidad IS DISTINCT FROM OLD.cantidad
     OR NEW.articulo_id IS DISTINCT FROM OLD.articulo_id OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id
     OR NEW.unidad IS DISTINCT FROM OLD.unidad THEN
    RAISE EXCEPTION 'un pedido enviado no cambia de contenido (solo lo recibido)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pedido_lineas_congeladas ON taller.pedido_lineas;
CREATE TRIGGER trg_pedido_lineas_congeladas
  BEFORE UPDATE OR DELETE ON taller.pedido_lineas
  FOR EACH ROW EXECUTE FUNCTION taller.pedido_lineas_congeladas();

-- ─── 4) Albaranes de entrada ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.albaranes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id          uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  proveedor_id       uuid NOT NULL,
  pedido_id          uuid,
  numero_proveedor   text NOT NULL CHECK (length(btrim(numero_proveedor)) > 0),
  fecha              date NOT NULL,
  estado             text NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido', 'valorado')),
  factura_proveedor_numero text,
  factura_proveedor_fecha  date,
  valorado_en        timestamptz,
  creado_por         uuid,
  notas              text,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, proveedor_id, numero_proveedor),   -- el mismo albarán no entra dos veces (no sube el stock dos veces)
  FOREIGN KEY (taller_id, proveedor_id) REFERENCES taller.proveedores(taller_id, id),
  FOREIGN KEY (taller_id, pedido_id)    REFERENCES taller.pedidos(taller_id, id),
  FOREIGN KEY (taller_id, creado_por)   REFERENCES taller.usuarios_taller(taller_id, id),
  CHECK (estado = 'recibido' OR (factura_proveedor_numero IS NOT NULL AND factura_proveedor_fecha IS NOT NULL AND valorado_en IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_albaranes_taller ON taller.albaranes (taller_id, fecha DESC);

CREATE TABLE IF NOT EXISTS taller.albaran_lineas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id          uuid NOT NULL,
  albaran_id         uuid NOT NULL,
  pedido_linea_id    uuid,
  articulo_id        uuid,
  descripcion        text NOT NULL,
  cantidad           integer NOT NULL CHECK (cantidad > 0),
  unidad             text NOT NULL DEFAULT 'ud' CHECK (unidad IN ('ud', 'ml')),
  coste_unitario_cent bigint CHECK (coste_unitario_cent >= 0),     -- NULL = albarán sin valorar (≠ 0)
  iva_puntos_basicos integer CHECK (iva_puntos_basicos BETWEEN 0 AND 10000),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, albaran_id)      REFERENCES taller.albaranes(taller_id, id) ON DELETE CASCADE,
  FOREIGN KEY (taller_id, pedido_linea_id) REFERENCES taller.pedido_lineas(taller_id, id),
  FOREIGN KEY (taller_id, articulo_id)     REFERENCES taller.articulos(taller_id, id)
);
CREATE INDEX IF NOT EXISTS idx_albaran_lineas_albaran ON taller.albaran_lineas (taller_id, albaran_id);

-- La línea de albarán es inmutable salvo valorarla: coste/IVA pasan de NULL a un valor, una vez.
CREATE OR REPLACE FUNCTION taller.albaran_lineas_inmutables() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.albaran_id IS DISTINCT FROM OLD.albaran_id OR NEW.articulo_id IS DISTINCT FROM OLD.articulo_id
     OR NEW.pedido_linea_id IS DISTINCT FROM OLD.pedido_linea_id OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
     OR NEW.cantidad IS DISTINCT FROM OLD.cantidad OR NEW.unidad IS DISTINCT FROM OLD.unidad THEN
    RAISE EXCEPTION 'la línea de un albarán no se edita (solo se valora)';
  END IF;
  IF OLD.coste_unitario_cent IS NOT NULL AND NEW.coste_unitario_cent IS DISTINCT FROM OLD.coste_unitario_cent THEN
    RAISE EXCEPTION 'la línea ya está valorada';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_albaran_lineas_inmutables ON taller.albaran_lineas;
CREATE TRIGGER trg_albaran_lineas_inmutables
  BEFORE UPDATE ON taller.albaran_lineas
  FOR EACH ROW EXECUTE FUNCTION taller.albaran_lineas_inmutables();

-- El albarán: solo cambia al valorarse (recibido → valorado, una vez).
CREATE OR REPLACE FUNCTION taller.albaranes_inmutables() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'un albarán no se borra'; END IF;
  IF NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id OR NEW.numero_proveedor IS DISTINCT FROM OLD.numero_proveedor
     OR NEW.fecha IS DISTINCT FROM OLD.fecha OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id THEN
    RAISE EXCEPTION 'un albarán registrado no se edita';
  END IF;
  IF OLD.estado = 'valorado' AND (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.factura_proveedor_numero IS DISTINCT FROM OLD.factura_proveedor_numero) THEN
    RAISE EXCEPTION 'el albarán ya está valorado';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_albaranes_inmutables ON taller.albaranes;
CREATE TRIGGER trg_albaranes_inmutables
  BEFORE UPDATE OR DELETE ON taller.albaranes
  FOR EACH ROW EXECUTE FUNCTION taller.albaranes_inmutables();

-- ─── 5) Outbox: hecho de compra ──────────────────────────────────────────────
ALTER TABLE taller.hechos_pendientes DROP CONSTRAINT IF EXISTS hechos_pendientes_tipo_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hechos_pendientes_tipo_chk') THEN
    ALTER TABLE taller.hechos_pendientes ADD CONSTRAINT hechos_pendientes_tipo_chk CHECK (tipo IN ('venta', 'cobro', 'compra', 'no_soportado'));
  END IF;
END $$;

-- ─── RLS, actualizado_en y permisos de las tablas nuevas ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['albaranes', 'albaran_lineas'] LOOP
    EXECUTE format('ALTER TABLE taller.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE taller.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'taller' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY %I ON taller.%I USING (taller_id = taller.taller_actual()) WITH CHECK (taller_id = taller.taller_actual())', t || '_por_taller', t);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_actualizado_en ON taller.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON taller.%I FOR EACH ROW EXECUTE FUNCTION taller.tocar_actualizado_en()', t, t);
  END LOOP;
END $$;

REVOKE ALL ON taller.albaranes, taller.albaran_lineas FROM prisma_taller;
GRANT SELECT, INSERT ON taller.albaranes, taller.albaran_lineas TO prisma_taller;
GRANT UPDATE (estado, factura_proveedor_numero, factura_proveedor_fecha, valorado_en, actualizado_en) ON taller.albaranes TO prisma_taller;
GRANT UPDATE (coste_unitario_cent, iva_puntos_basicos, actualizado_en) ON taller.albaran_lineas TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity); → 0 filas
-- SELECT has_table_privilege('prisma_taller', 'taller.movimientos_stock', 'UPDATE'); → f   (y 'DELETE' → f)
