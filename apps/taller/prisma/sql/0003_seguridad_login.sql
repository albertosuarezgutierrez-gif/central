-- Vertical TALLER — tope de login POR TALLER (F1). Requiere 0001 aplicado. IDEMPOTENTE.
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` junto con 0001/0002.
-- Valores de alta ≡ SEGURIDAD_LOGIN_ALTA de @central/module-taller (cepo: test/esquema-sql.test.ts). El dueño los edita (datos, no código).
-- Complementa el bloqueo por IP: N fallos TOTALES de PIN en una ventana bloquean el login de ese taller un tiempo.
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS login_max_fallos_taller integer NOT NULL DEFAULT 30 CHECK (login_max_fallos_taller > 0),
  ADD COLUMN IF NOT EXISTS login_ventana_minutos  integer NOT NULL DEFAULT 15 CHECK (login_ventana_minutos > 0),
  ADD COLUMN IF NOT EXISTS login_bloqueo_taller_minutos integer NOT NULL DEFAULT 15 CHECK (login_bloqueo_taller_minutos > 0);
