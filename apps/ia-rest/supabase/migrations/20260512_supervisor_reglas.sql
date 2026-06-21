-- ─────────────────────────────────────────────────────────────────────────────
-- SUPERVISOR DE TIEMPOS — Motor de reglas configurable v2
-- Corrige schema real descubierto en auditoría 2026-05-12
--
-- alerta_reglas existente: nombre, activa, logica, horario_desde/hasta,
--   destinatario_tipo, camarero_id, canal_vox, canal_push, canal_hub
-- alerta_log existente: regla_id, regla_nombre, mesa_id, camarero_notificado_id,
--   trigger_tipos TEXT[], contexto JSONB, disparada_at, actuada_at,
--   resuelta_por_id, mensaje_voz, leida
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ampliar alerta_reglas — solo columnas que NO existen ya ───────────────
ALTER TABLE alerta_reglas
  ADD COLUMN IF NOT EXISTS condicion        TEXT NOT NULL DEFAULT 'sin_comanda',
  ADD COLUMN IF NOT EXISTS umbral_minutos   INT  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS objeto           TEXT NOT NULL DEFAULT 'mesa',
  ADD COLUMN IF NOT EXISTS mensaje          TEXT,
  ADD COLUMN IF NOT EXISTS dias_semana      INT[],           -- [1=L..7=D], null=todos
  ADD COLUMN IF NOT EXISTS zona_ids         UUID[],          -- null=todas
  ADD COLUMN IF NOT EXISTS escalar_a        TEXT,
  ADD COLUMN IF NOT EXISTS escalar_minutos  INT,
  ADD COLUMN IF NOT EXISTS prioridad        INT  NOT NULL DEFAULT 0;

-- ── 2. Migrar filas existentes — inferir condicion y umbral desde nombre ─────
UPDATE alerta_reglas SET
  condicion = CASE
    WHEN nombre ILIKE '%sin pedir%'              THEN 'sin_comanda'
    WHEN nombre ILIKE '%sin atender%'            THEN 'sin_comanda'
    WHEN nombre ILIKE '%comanda%cocina%'         THEN 'plato_sin_llegar'
    WHEN nombre ILIKE '%cocina lenta%'           THEN 'ticket_sin_tocar'
    WHEN nombre ILIKE '%ticket%'                 THEN 'ticket_sin_tocar'
    WHEN nombre ILIKE '%cuenta%'                 THEN 'cuenta_sin_cobrar'
    WHEN nombre ILIKE '%90 min%'                 THEN 'rotacion_larga'
    WHEN nombre ILIKE '%ocupada%'                THEN 'rotacion_larga'
    WHEN nombre ILIKE '%producto agotado%'       THEN 'sin_comanda'
    ELSE 'sin_comanda'
  END,
  umbral_minutos = CASE
    WHEN nombre ~ '\d+\s*min'
      THEN CAST(substring(nombre FROM '(\d+)\s*min') AS INT)
    WHEN nombre ILIKE '%90 min%' THEN 90
    ELSE 10
  END,
  objeto = CASE
    WHEN nombre ILIKE '%comanda%cocina%'   THEN 'comanda'
    WHEN nombre ILIKE '%cocina lenta%'     THEN 'ticket_cocina'
    WHEN nombre ILIKE '%ticket%'           THEN 'ticket_cocina'
    WHEN nombre ILIKE '%cuenta%'           THEN 'cuenta'
    ELSE 'mesa'
  END,
  mensaje = CASE
    WHEN nombre ILIKE '%sin pedir%'        THEN 'Mesa {mesa} lleva {tiempo} min sin pedir'
    WHEN nombre ILIKE '%sin atender%'      THEN 'Mesa {mesa} sin atender · {tiempo} min'
    WHEN nombre ILIKE '%comanda%cocina%'   THEN 'Mesa {mesa} lleva {tiempo} min esperando plato'
    WHEN nombre ILIKE '%cocina lenta%'     THEN 'Cocina lenta en {mesa} · {tiempo} min'
    WHEN nombre ILIKE '%cuenta%'           THEN 'Mesa {mesa} lleva {tiempo} min esperando cobro'
    WHEN nombre ILIKE '%90 min%'           THEN 'Mesa {mesa} lleva {tiempo} min ocupada'
    WHEN nombre ILIKE '%ocupada%'          THEN 'Mesa {mesa} lleva {tiempo} min ocupada'
    ELSE 'Alerta en {mesa} · {tiempo} min'
  END
WHERE condicion = 'sin_comanda' AND umbral_minutos = 10;  -- solo filas sin migrar

-- ── 3. Ampliar alerta_log — solo columnas que NO existen ya ──────────────────
ALTER TABLE alerta_log
  ADD COLUMN IF NOT EXISTS referencia_id   TEXT,           -- para dedup en cron
  ADD COLUMN IF NOT EXISTS reclamado_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_minutos     INT,
  ADD COLUMN IF NOT EXISTS respondido_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respondido_por  UUID;

-- ── 4. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alerta_reglas_activa
  ON alerta_reglas(restaurante_id, activa);

CREATE INDEX IF NOT EXISTS idx_alerta_log_ref
  ON alerta_log(restaurante_id, referencia_id, disparada_at);

CREATE INDEX IF NOT EXISTS idx_alerta_log_reclamado
  ON alerta_log(restaurante_id, reclamado_at)
  WHERE reclamado_at IS NOT NULL;

-- ── 5. RLS — service_role bypassa, políticas para anon ───────────────────────
ALTER TABLE alerta_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerta_log    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supervisor_alerta_reglas" ON alerta_reglas;
CREATE POLICY "supervisor_alerta_reglas" ON alerta_reglas
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "supervisor_alerta_log" ON alerta_log;
CREATE POLICY "supervisor_alerta_log" ON alerta_log
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- ESQUEMA FINAL alerta_reglas
-- ─── existentes ────────────────────────────────────────────────────────
--   id, restaurante_id, nombre, activa, logica (AND)
--   horario_desde TIME, horario_hasta TIME
--   destinatario_tipo TEXT  (camarero_asignado|todos_turno|jefe_sala|cocina|owner)
--   camarero_id UUID, canal_vox BOOL, canal_push BOOL, canal_hub BOOL
--   created_at, updated_at
-- ─── nuevas ────────────────────────────────────────────────────────────
--   condicion TEXT     sin_comanda|plato_sin_llegar|ticket_sin_tocar|
--                      cuenta_sin_cobrar|rotacion_larga|cuentas_simultaneas
--   umbral_minutos INT umbral de tiempo
--   objeto TEXT        mesa|comanda|ticket_cocina|cuenta
--   mensaje TEXT       "Mesa {mesa} lleva {tiempo} min..." (plantilla)
--   dias_semana INT[]  [1=L..7=D] null=todos
--   zona_ids UUID[]    null=todas
--   escalar_a TEXT     rol al que escalar
--   escalar_minutos INT minutos para escalar
--   prioridad INT      orden de evaluación
-- ─────────────────────────────────────────────────────────────────────────────
