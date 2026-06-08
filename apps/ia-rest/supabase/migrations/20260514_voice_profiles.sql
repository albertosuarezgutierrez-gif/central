-- ── VOICE PROFILES ──────────────────────────────────────────────────────────
-- Perfiles de voz para speaker recognition (Azure Cognitive Services)
-- Cada camarero puede tener un perfil calibrado que se usa como filtro
-- no bloqueante en el pipeline de comandas (EAR → BRAIN)

CREATE TABLE IF NOT EXISTS voice_profiles (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  camarero_id         UUID NOT NULL UNIQUE REFERENCES camareros(id) ON DELETE CASCADE,
  restaurante_id      UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  azure_profile_id    TEXT,                          -- ID del perfil en Azure Speaker Recognition
  estado              TEXT NOT NULL DEFAULT 'sin_calibrar'
                        CHECK (estado IN ('sin_calibrar','calibrando','activo','error')),
  frases_completadas  INT NOT NULL DEFAULT 0,        -- frases grabadas (de 5 requeridas)
  segundos_enrollados NUMERIC NOT NULL DEFAULT 0,    -- segundos de audio acumulados en Azure
  ultimo_score        NUMERIC,                       -- último score de verificación (0.0–1.0)
  ultimo_score_at     TIMESTAMPTZ,
  error_msg           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role lo gestiona todo desde API routes
ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_profiles_service_access" ON voice_profiles
  USING (true) WITH CHECK (true);

-- Columna speaker_match en transcripciones (null = sin perfil o no verificado)
ALTER TABLE transcripciones ADD COLUMN IF NOT EXISTS speaker_match NUMERIC;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_voice_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trig_voice_profiles_updated_at ON voice_profiles;
CREATE TRIGGER trig_voice_profiles_updated_at
  BEFORE UPDATE ON voice_profiles
  FOR EACH ROW EXECUTE FUNCTION set_voice_profiles_updated_at();
