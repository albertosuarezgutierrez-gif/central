-- ============================================================
-- Preaviso de marcha cocina ⇄ sala. Schema iarest. Aditiva.
-- BD: compartida wswbehlcuxqxyinousql · schema iarest
-- Cocina avisa al camarero asignado a la mesa de que un plato sale ya; el
-- camarero monta la mesa y confirma "mesa lista" → cocina lo ve y emplata.
-- Off por defecto: el dueño opta-in con restaurantes.preaviso_activo.
-- ============================================================

SET search_path TO iarest, public;

-- 1) Flag de activación por restaurante (off por defecto: el dueño opta-in)
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS preaviso_activo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurantes.preaviso_activo IS
  'Activa el preaviso de marcha cocina⇄sala. Off por defecto: el dueño lo enciende.';

-- 2) Tabla de preavisos
CREATE TABLE IF NOT EXISTS preavisos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL,
  comanda_id      UUID NOT NULL,
  mesa            TEXT,                                   -- desnormalizado para el aviso ("7")
  platos          JSONB NOT NULL DEFAULT '[]'::jsonb,     -- snapshot: [{nombre, cantidad}]
  estado          TEXT NOT NULL DEFAULT 'enviado'
                    CHECK (estado IN ('enviado','mesa_lista','servido','cancelado')),
  emitido_por     TEXT,                                   -- rol/id de cocina que pulsó
  emitido_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  mesa_lista_at   TIMESTAMPTZ,
  mesa_lista_por  UUID,                                   -- camarero que confirmó
  listo_at        TIMESTAMPTZ,                            -- dato para Fase 2 (antelación real)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preavisos_restaurante ON preavisos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_preavisos_comanda ON preavisos(comanda_id);
-- Garantiza el dedup a nivel BD: 1 preaviso "enviado" por comanda
CREATE UNIQUE INDEX IF NOT EXISTS uq_preavisos_comanda_enviado
  ON preavisos(comanda_id) WHERE estado = 'enviado';

-- 3) RLS multi-tenant
ALTER TABLE preavisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own" ON preavisos;
CREATE POLICY "select_own" ON preavisos
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);

DROP POLICY IF EXISTS "insert_own" ON preavisos;
CREATE POLICY "insert_own" ON preavisos
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id', true)::uuid);

DROP POLICY IF EXISTS "update_own" ON preavisos;
CREATE POLICY "update_own" ON preavisos
  FOR UPDATE USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);

DROP POLICY IF EXISTS "service_role_all" ON preavisos;
CREATE POLICY "service_role_all" ON preavisos
  USING (auth.role() = 'service_role');

-- 4) Realtime: publicar la tabla (mismo canal kds-{restaurante_id})
ALTER PUBLICATION supabase_realtime ADD TABLE preavisos;
