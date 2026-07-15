-- ============================================================
-- Módulo ALMACÉN (catering / eventos) — ADITIVO sobre el motor de materiales
-- BD viva ia-rest: proyecto efncqyvhniaxsirhdxaa, schema public. Multi-tenant por restaurante_id.
-- Reutiliza: materiales, materiales_asignacion, materiales_dano, materiales_espacios,
--            materiales_inventario_fisico(_lineas), personal, personal_evento_asignacion.
-- Añade: bloques, tipos de evento, lugares (haciendas), eventos + líneas, y columnas sueltas.
-- Genérico y editable 100% desde administración; extensible al resto del holding.
-- Idempotente (IF NOT EXISTS) — seguro de re-aplicar.
-- ============================================================

-- ── Columnas nuevas sobre tablas existentes (aditivas) ───────
ALTER TABLE materiales                   ADD COLUMN IF NOT EXISTS unidades_por_bandeja int DEFAULT 1;  -- «RAKI» = bandeja de almacenaje
ALTER TABLE materiales                   ADD COLUMN IF NOT EXISTS familia text;                        -- agrupación editable (vajilla, cristalería…)

ALTER TABLE materiales_asignacion        ADD COLUMN IF NOT EXISTS lugar_id uuid;                        -- destino de entrega (hacienda)
ALTER TABLE materiales_asignacion        ADD COLUMN IF NOT EXISTS receptor_nombre text;                 -- terceros: quien recibe firma
ALTER TABLE materiales_asignacion        ADD COLUMN IF NOT EXISTS receptor_dni text;
ALTER TABLE materiales_asignacion        ADD COLUMN IF NOT EXISTS firma_url text;                       -- firma / foto de evidencia
ALTER TABLE materiales_asignacion        ADD COLUMN IF NOT EXISTS firma_at timestamptz;
ALTER TABLE materiales_asignacion        ADD COLUMN IF NOT EXISTS personal_devolucion_id uuid;          -- quien verifica la ENTRADA (≠ quien hizo la salida)

ALTER TABLE materiales_inventario_fisico ADD COLUMN IF NOT EXISTS asignado_a uuid;                      -- recuento encargado por el owner a un empleado
ALTER TABLE materiales_inventario_fisico ADD COLUMN IF NOT EXISTS familia text;                         -- scope opcional del recuento (por familia)

-- ── Lugares de evento (haciendas / venues) — DESTINO, no almacén ──
CREATE TABLE IF NOT EXISTS almacen_lugares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  nombre         text NOT NULL,
  direccion      text,
  telefono       text,
  persona_abre   text,          -- nombre de quien abre al repartidor ese día
  notas          text,          -- notas de acceso / descarga
  activo         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_lugares_rest ON almacen_lugares (restaurante_id);

-- ── Bloques (componentes reutilizables de plantilla: momento → materiales) ──
CREATE TABLE IF NOT EXISTS almacen_bloques (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  nombre         text NOT NULL,                 -- "Banquete boda", "Barra libre", "Servicio de café"…
  momento        text,                          -- aperitivo|banquete|barra|cafe|otro
  orden          int DEFAULT 0,
  activo         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_bloques_rest ON almacen_bloques (restaurante_id);

CREATE TABLE IF NOT EXISTS almacen_bloque_lineas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloque_id        uuid NOT NULL REFERENCES almacen_bloques(id) ON DELETE CASCADE,
  material_id      uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  cantidad_defecto int DEFAULT 0,               -- cantidad por defecto (la oficina la ajusta por evento)
  orden            int DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_almacen_bloque_lineas_bloque ON almacen_bloque_lineas (bloque_id);

-- ── Tipos de evento (boda / corporativo / feria = conjunto de bloques) ──
CREATE TABLE IF NOT EXISTS almacen_tipos_evento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  nombre         text NOT NULL,                 -- Boda | Corporativo | Feria…
  activo         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_tipos_evento_rest ON almacen_tipos_evento (restaurante_id);

CREATE TABLE IF NOT EXISTS almacen_tipo_evento_bloques (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_evento_id  uuid NOT NULL REFERENCES almacen_tipos_evento(id) ON DELETE CASCADE,
  bloque_id       uuid NOT NULL REFERENCES almacen_bloques(id) ON DELETE CASCADE,
  orden           int DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_almacen_tipo_evento_bloques_tipo ON almacen_tipo_evento_bloques (tipo_evento_id);

-- ── Eventos (la ficha) + líneas de material (previsto vs real) ──
CREATE TABLE IF NOT EXISTS almacen_eventos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id        uuid NOT NULL,
  tipo_evento_id        uuid REFERENCES almacen_tipos_evento(id) ON DELETE SET NULL,
  lugar_id              uuid REFERENCES almacen_lugares(id) ON DELETE SET NULL,
  nombre                text,                          -- "Boda Pérez"
  fecha_evento          date,
  dia_montaje           date,
  adultos               int DEFAULT 0,
  ninos                 int DEFAULT 0,
  personal_previsto     int DEFAULT 0,                 -- solo dato, para la fase de predicción
  responsable_prep_id   uuid,                          -- jefe de almacén (prepara)  → personal.id
  responsable_evento_id uuid,                          -- metre / lleva-y-trae       → personal.id
  a_terceros            boolean DEFAULT false,         -- alquiler a un tercero (ingreso real)
  estado                text NOT NULL DEFAULT 'borrador', -- borrador|preparado|entregado|devuelto|cerrado
  notas                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_eventos_rest ON almacen_eventos (restaurante_id);

CREATE TABLE IF NOT EXISTS almacen_evento_lineas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id         uuid NOT NULL REFERENCES almacen_eventos(id) ON DELETE CASCADE,
  material_id       uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  bloque_id         uuid,                          -- de qué bloque salió (traza)
  cantidad_prevista int DEFAULT 0,
  cantidad_real     int,                           -- lo que volvió (NULL hasta la devolución)
  orden             int DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_almacen_evento_lineas_evento ON almacen_evento_lineas (evento_id);

-- ── RLS (las API routes usan service role, igual que materiales) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'almacen_lugares','almacen_bloques','almacen_bloque_lineas',
    'almacen_tipos_evento','almacen_tipo_evento_bloques',
    'almacen_eventos','almacen_evento_lineas'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I', t);
    EXECUTE format('CREATE POLICY service_role_all ON %I USING (auth.role()=''service_role'') WITH CHECK (auth.role()=''service_role'')', t);
  END LOOP;
END $$;
