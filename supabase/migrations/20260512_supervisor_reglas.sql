-- ─────────────────────────────────────────────────────────────────────────────
-- SUPERVISOR DE TIEMPOS — Motor de reglas configurable
-- Una sola tabla, una sola fuente de verdad para owner y jefe_sala
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ampliar alerta_reglas ─────────────────────────────────────────────────
ALTER TABLE alerta_reglas
  ADD COLUMN IF NOT EXISTS nombre           TEXT,
  ADD COLUMN IF NOT EXISTS objeto           TEXT NOT NULL DEFAULT 'mesa',
  ADD COLUMN IF NOT EXISTS condicion        TEXT NOT NULL DEFAULT 'sin_comanda',
  ADD COLUMN IF NOT EXISTS umbral_minutos   INT  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS horario_desde    TIME,
  ADD COLUMN IF NOT EXISTS horario_hasta    TIME,
  ADD COLUMN IF NOT EXISTS dias_semana      INT[],           -- [1..7], null = todos
  ADD COLUMN IF NOT EXISTS zona_ids         UUID[],          -- null = todas las zonas
  ADD COLUMN IF NOT EXISTS destinatario     TEXT NOT NULL DEFAULT 'camarero_asignado',
  ADD COLUMN IF NOT EXISTS partida_id       UUID,
  ADD COLUMN IF NOT EXISTS accion           TEXT NOT NULL DEFAULT 'push_sonido',
  ADD COLUMN IF NOT EXISTS mensaje          TEXT,            -- "Mesa {mesa} lleva {tiempo} min"
  ADD COLUMN IF NOT EXISTS escalar_a        TEXT,
  ADD COLUMN IF NOT EXISTS escalar_minutos  INT,
  ADD COLUMN IF NOT EXISTS prioridad        INT  NOT NULL DEFAULT 0;

-- ── 2. Migrar filas existentes al nuevo schema ───────────────────────────────
UPDATE alerta_reglas SET
  nombre          = CASE tipo
                      WHEN 'espera_larga'         THEN 'Mesa sin atender'
                      WHEN 'kds_atascado'         THEN 'Ticket cocina sin tocar'
                      WHEN 'cuentas_simultaneas'  THEN 'Pico de cuentas'
                      ELSE tipo
                    END,
  objeto          = CASE tipo
                      WHEN 'espera_larga'         THEN 'mesa'
                      WHEN 'kds_atascado'         THEN 'ticket_cocina'
                      WHEN 'cuentas_simultaneas'  THEN 'cuenta'
                      ELSE 'mesa'
                    END,
  condicion       = CASE tipo
                      WHEN 'espera_larga'         THEN 'sin_comanda'
                      WHEN 'kds_atascado'         THEN 'ticket_sin_tocar'
                      WHEN 'cuentas_simultaneas'  THEN 'cuentas_simultaneas'
                      ELSE tipo
                    END,
  umbral_minutos  = COALESCE(threshold_min, 10),
  destinatario    = CASE tipo
                      WHEN 'espera_larga'         THEN 'camarero_asignado'
                      WHEN 'kds_atascado'         THEN 'cocina'
                      WHEN 'cuentas_simultaneas'  THEN 'todos_sala'
                      ELSE 'camarero_asignado'
                    END,
  mensaje         = CASE tipo
                      WHEN 'espera_larga'         THEN 'Mesa {mesa} lleva {tiempo} min sin pedir · ¿está atendida?'
                      WHEN 'kds_atascado'         THEN '{plato} ({mesa}) lleva {tiempo} min en cocina sin marcar'
                      WHEN 'cuentas_simultaneas'  THEN '{n} mesas pidieron cuenta en los últimos 5 min · ¿refuerzo en caja?'
                      ELSE 'Alerta en {mesa}'
                    END
WHERE nombre IS NULL;

-- ── 3. Ampliar alerta_log ────────────────────────────────────────────────────
ALTER TABLE alerta_log
  ADD COLUMN IF NOT EXISTS regla_id        UUID REFERENCES alerta_reglas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destinatario    TEXT,
  ADD COLUMN IF NOT EXISTS accion          TEXT,
  ADD COLUMN IF NOT EXISTS reclamado_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta_minutos     INT,
  ADD COLUMN IF NOT EXISTS respondido_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respondido_por  UUID;

-- ── 4. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alerta_reglas_restaurante_activa
  ON alerta_reglas(restaurante_id, activa);

CREATE INDEX IF NOT EXISTS idx_alerta_log_regla
  ON alerta_log(regla_id);

CREATE INDEX IF NOT EXISTS idx_alerta_log_reclamado
  ON alerta_log(restaurante_id, reclamado_at)
  WHERE reclamado_at IS NOT NULL;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- Tanto owner como jefe_sala leen y escriben las mismas reglas.
-- La autorización real se hace en la API (el cliente pasa x-ia-session).
-- Supabase client en las API routes usa SERVICE_ROLE_KEY → RLS bypass ✓
-- Para acceso directo desde cliente con anon key:

ALTER TABLE alerta_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerta_log    ENABLE ROW LEVEL SECURITY;

-- Política permisiva (la restricción por rol la hace la API route)
DROP POLICY IF EXISTS "alerta_reglas_restaurante" ON alerta_reglas;
CREATE POLICY "alerta_reglas_restaurante" ON alerta_reglas
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "alerta_log_restaurante" ON alerta_log;
CREATE POLICY "alerta_log_restaurante" ON alerta_log
  FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Seed de reglas demo por defecto ──────────────────────────────────────
-- Se insertan solo si el restaurante demo (id fijo) no tiene reglas nuevas aún
INSERT INTO alerta_reglas
  (restaurante_id, nombre, objeto, condicion, umbral_minutos,
   destinatario, accion, mensaje, activa, prioridad)
SELECT
  '00000000-0000-0000-0000-000000000001',
  r.nombre, r.objeto, r.condicion, r.umbral_minutos,
  r.destinatario, r.accion, r.mensaje, true, r.prioridad
FROM (VALUES
  ('Mesa sin atender',              'mesa',         'sin_comanda',        5,  'camarero_asignado', 'push_sonido+tts',  'Mesa {mesa} lleva {tiempo} min sin pedir',                0),
  ('Plato sin llegar al cliente',   'comanda',      'plato_sin_llegar',   15, 'camarero_asignado', 'push_sonido',      'Mesa {mesa} lleva {tiempo} min esperando plato · ¿Reclamar?', 1),
  ('Ticket cocina sin tocar',       'ticket_cocina','ticket_sin_tocar',   12, 'cocina',            'badge',            'Ticket {mesa} lleva {tiempo} min sin preparar',            2),
  ('Cuenta sin cobrar',             'cuenta',       'cuenta_sin_cobrar',  8,  'camarero_asignado', 'push_silencioso',  'Mesa {mesa} lleva {tiempo} min esperando cobro',           3),
  ('Rotación: mesa demasiado larga','mesa',         'rotacion_larga',     90, 'jefe_sala',         'push_silencioso',  'Mesa {mesa} lleva {tiempo} min ocupada',                   4)
) AS r(nombre, objeto, condicion, umbral_minutos, destinatario, accion, mensaje, prioridad)
WHERE NOT EXISTS (
  SELECT 1 FROM alerta_reglas
  WHERE restaurante_id = '00000000-0000-0000-0000-000000000001'
    AND condicion = r.condicion
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Condiciones válidas (referencia):
--   sin_comanda          · mesa sentada sin ninguna comanda
--   plato_sin_llegar     · comanda confirmada, plato sin marcar marchar
--   ticket_sin_tocar     · ticket en KDS sin tocar ningún ítem
--   cuenta_sin_cobrar    · tipo='cuenta' sin pago cerrado
--   rotacion_larga       · mesa ocupada más de X minutos en total
--   item_sin_marcar      · ítem pendiente mientras otros de la comanda ya están listos
--   cuentas_simultaneas  · N mesas piden cuenta en <5 min (umbral_minutos = mínimo de cuentas)
--
-- Destinatarios válidos:
--   camarero_asignado  · camarero asignado a la mesa
--   todos_sala         · todos los camareros con sesión activa
--   jefe_sala          · rol jefe_sala
--   cocina             · partida específica (partida_id) o toda cocina
--   owner              · rol owner (útil aunque no esté en el local)
--
-- Acciones válidas:
--   push_silencioso    · push sin sonido
--   push_sonido        · push con sonido
--   tts                · solo TTS en el device
--   badge              · solo badge visual en KDS/mapa sala
--   push_sonido+tts    · push con sonido + TTS
-- ─────────────────────────────────────────────────────────────────────────────
