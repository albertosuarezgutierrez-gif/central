-- 20260518_smart_scan.sql
-- Escáner IA universal: permisos por camarero + log de auditoría completo

-- 1. Permiso de escáner en camareros
ALTER TABLE camareros
  ADD COLUMN IF NOT EXISTS puede_escanear BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabla principal de documentos escaneados (audit log)
CREATE TABLE IF NOT EXISTS documentos_escaneados (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,

  -- Quién escaneó
  escaneado_por_id    uuid        REFERENCES camareros(id) ON DELETE SET NULL,
  escaneado_por_nombre text       NOT NULL DEFAULT 'Owner',
  escaneado_por_rol   text        NOT NULL DEFAULT 'owner',

  -- Qué detectó la IA
  tipo                text        NOT NULL CHECK (tipo IN ('cv','albaran','factura_proveedor','carta','otro')),
  confianza           float       NOT NULL DEFAULT 0,
  datos_extraidos     jsonb       NOT NULL DEFAULT '{}',

  -- Imagen
  imagen_url          text,       -- storage bucket url (opcional)
  imagen_base64       text,       -- fallback si no hay bucket (primeros 200KB)

  -- Dónde quedó archivado (si se archivó)
  archivado_en        text,       -- 'bolsa_personal:uuid' | 'albaranes:uuid' | null
  archivado_at        timestamptz,

  -- Estado del proceso
  estado              text        NOT NULL DEFAULT 'pendiente'
                                  CHECK (estado IN ('pendiente','archivado','descartado')),

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_doc_escaneados_restaurante ON documentos_escaneados(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_doc_escaneados_tipo        ON documentos_escaneados(restaurante_id, tipo);
CREATE INDEX IF NOT EXISTS idx_doc_escaneados_escaneador  ON documentos_escaneados(escaneado_por_id);
CREATE INDEX IF NOT EXISTS idx_doc_escaneados_estado      ON documentos_escaneados(restaurante_id, estado);

-- RLS
ALTER TABLE documentos_escaneados ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='documentos_escaneados' AND policyname='documentos_escaneados_restaurante'
  ) THEN
    CREATE POLICY documentos_escaneados_restaurante ON documentos_escaneados
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE  documentos_escaneados                  IS 'Log de auditoría de todos los documentos escaneados con IA';
COMMENT ON COLUMN documentos_escaneados.escaneado_por_id IS 'NULL = escaneado por el owner directamente';
COMMENT ON COLUMN documentos_escaneados.archivado_en     IS 'Referencia compuesta: tabla:uuid del registro creado';
COMMENT ON COLUMN camareros.puede_escanear               IS 'Permite usar el escáner IA desde /edge. jefe_sala siempre puede.';
