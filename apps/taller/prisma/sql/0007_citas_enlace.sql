-- Vertical TALLER — 0007: citas por enlace y agenda con capacidad (spec «Citas por enlace y agenda con capacidad»).
-- Requiere 0001-0006 aplicados. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
--
--  1) Configuración de la agenda (editable por el dueño): columnas en `configuracion` + `cierres_agenda` (festivos/cierres).
--     Los valores por defecto ≡ AGENDA_ALTA de @central/module-taller (cepo test/esquema-sql.test.ts).
--  2) `citas`: servicio pedido, origen, invitación, recepción a la que se convirtió y motivo de cancelación.
--     El estado `pedida` = pendiente de que el taller la acepte; `confirmada` = aceptada (o confirmada sola, según la config).
--  3) `invitaciones_cita`: el taller invita a un cliente a pedir cita por un enlace. SOLO el HASH del token (256 bits), un solo uso,
--     caduca. El token en claro no se guarda en ningún sitio.
--  4) Canal de consentimiento `cita_enlace` (las casillas que el cliente marca —o no— al reservar).
BEGIN;

-- ─── 1. Configuración de la agenda ───────────────────────────────────────────
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS agenda_zona_horaria text NOT NULL DEFAULT 'Europe/Madrid',
  ADD COLUMN IF NOT EXISTS agenda_max_coches_franja integer NOT NULL DEFAULT 2 CHECK (agenda_max_coches_franja > 0),
  ADD COLUMN IF NOT EXISTS agenda_ocupable_pb integer NOT NULL DEFAULT 8500 CHECK (agenda_ocupable_pb BETWEEN 1 AND 10000),
  ADD COLUMN IF NOT EXISTS agenda_margen_minutos integer NOT NULL DEFAULT 15 CHECK (agenda_margen_minutos >= 0),
  ADD COLUMN IF NOT EXISTS agenda_antelacion_min_horas integer NOT NULL DEFAULT 12 CHECK (agenda_antelacion_min_horas >= 0),
  ADD COLUMN IF NOT EXISTS agenda_antelacion_max_dias integer NOT NULL DEFAULT 60 CHECK (agenda_antelacion_max_dias > 0),
  ADD COLUMN IF NOT EXISTS agenda_confirmacion text NOT NULL DEFAULT 'manual' CHECK (agenda_confirmacion IN ('automatica','manual')),
  ADD COLUMN IF NOT EXISTS agenda_diagnostico_minutos integer NOT NULL DEFAULT 60 CHECK (agenda_diagnostico_minutos > 0),
  ADD COLUMN IF NOT EXISTS agenda_invitacion_caduca_dias integer NOT NULL DEFAULT 14 CHECK (agenda_invitacion_caduca_dias > 0);

CREATE TABLE IF NOT EXISTS taller.cierres_agenda (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  fecha          date NOT NULL,              -- fecha LOCAL del taller
  motivo         text NOT NULL DEFAULT '',
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, fecha)
);

-- ─── 2. Citas ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ux_citas_taller_id') THEN
    ALTER TABLE taller.citas ADD CONSTRAINT ux_citas_taller_id UNIQUE (taller_id, id);
  END IF;
END $$;

ALTER TABLE taller.citas
  ADD COLUMN IF NOT EXISTS servicio text,                       -- código de paquete o 'diagnostico'
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'taller' CHECK (origen IN ('taller','enlace')),
  ADD COLUMN IF NOT EXISTS invitacion_id uuid,
  ADD COLUMN IF NOT EXISTS recepcion_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion text,
  ADD COLUMN IF NOT EXISTS llegada_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_citas_recepcion') THEN
    ALTER TABLE taller.citas ADD CONSTRAINT fk_citas_recepcion FOREIGN KEY (taller_id, recepcion_id) REFERENCES taller.recepciones(taller_id, id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_citas_estado ON taller.citas (taller_id, estado, inicio);
-- Una invitación da, como mucho, UNA cita (cinturón de seguridad del «un solo uso»).
CREATE UNIQUE INDEX IF NOT EXISTS ux_citas_invitacion ON taller.citas (invitacion_id) WHERE invitacion_id IS NOT NULL;

-- ─── 3. Invitaciones ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.invitaciones_cita (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL,
  nombre         text NOT NULL CHECK (length(btrim(nombre)) > 0),
  correo         text,
  matricula      text,                        -- opcional: la que el taller ya conoce
  token_hash     text NOT NULL,               -- SHA-256 del token; el token en claro NO se guarda
  creada_por     uuid NOT NULL,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  caduca_en      timestamptz NOT NULL,
  usada_en       timestamptz,
  revocada_en    timestamptz,
  cita_id        uuid,
  envio          text NOT NULL DEFAULT 'registrado' CHECK (envio IN ('registrado','enviado')),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  CONSTRAINT ux_invitaciones_cita_token UNIQUE (token_hash),
  FOREIGN KEY (taller_id, creada_por) REFERENCES taller.usuarios_taller(taller_id, id),
  FOREIGN KEY (taller_id, cita_id) REFERENCES taller.citas(taller_id, id),
  CHECK (caduca_en > creada_en)
);
CREATE INDEX IF NOT EXISTS idx_invitaciones_cita_taller ON taller.invitaciones_cita (taller_id, creada_en DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_citas_invitacion') THEN
    ALTER TABLE taller.citas ADD CONSTRAINT fk_citas_invitacion FOREIGN KEY (taller_id, invitacion_id) REFERENCES taller.invitaciones_cita(taller_id, id);
  END IF;
END $$;

-- actualizado_en, RLS forzado y política por taller (mismo patrón que 0001/0004) para las tablas nuevas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cierres_agenda','invitaciones_cita'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || t || '_actualizado_en') THEN
      EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON taller.%I
                      FOR EACH ROW EXECUTE FUNCTION taller.tocar_actualizado_en()', t, t);
    END IF;
    EXECUTE format('ALTER TABLE taller.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE taller.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'taller' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY %I ON taller.%I USING (taller_id = taller.taller_actual()) WITH CHECK (taller_id = taller.taller_actual())',
                     t || '_por_taller', t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON taller.cierres_agenda, taller.invitaciones_cita TO prisma_taller;

-- ─── 4. Canal de consentimiento «cita_enlace» ────────────────────────────────
-- Espejo de CANALES_CONSENTIMIENTO (cepo test/esquema-sql.test.ts). Ampliar la lista no toca ninguna fila existente.
ALTER TABLE taller.consentimientos DROP CONSTRAINT IF EXISTS consentimientos_canal_check;
ALTER TABLE taller.consentimientos ADD CONSTRAINT consentimientos_canal_check CHECK (canal IN ('recepcion','presupuesto_casa','app','cita_enlace'));

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);      → 0 filas
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'consentimientos_canal_check';          → incluye 'cita_enlace'
-- SELECT agenda_confirmacion, agenda_ocupable_pb FROM taller.configuracion;                                  → 'manual' / 8500 en los talleres existentes
