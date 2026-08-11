-- Dos señales nuevas del agente de subastas (30/07/2026):
--
-- 1. REAPARICIONES: la misma finca vuelve a subasta con el tipo rebajado tras
--    quedar desierta. Cada convocatoria trae un identificador `SUB-JA-…` distinto,
--    así que se empareja por REFERENCIA CATASTRAL (o finca+registro). Es de las
--    mejores oportunidades del canal: llega ya estudiada y un 30% más abajo.
--
-- 2. VALORACIÓN PACTADA: la certificación registral recoge el valor que la
--    escritura de hipoteca fijó «a efectos de subasta» (47.274,90€ en 2009 para
--    Belmonte). Es una tasación bancaria real; acumulándolas se construye una
--    serie de €/m² propia, independiente de los portales.

-- Un par (convocatoria actual, convocatoria anterior) avisado una sola vez.
CREATE TABLE IF NOT EXISTS subastas_reapariciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key           text NOT NULL,
  dedupe_key_anterior  text NOT NULL,
  -- Bajada en tanto por uno (0.36 = 36% más barata).
  bajada_pct           numeric,
  avisado_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subastas_reapariciones_par_unico UNIQUE (dedupe_key, dedupe_key_anterior)
);

CREATE INDEX IF NOT EXISTS idx_subastas_reapariciones_key
  ON subastas_reapariciones (dedupe_key);

-- Tasación pactada leída de la certificación + su año.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS valoracion_pactada numeric;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS valoracion_pactada_anio integer;

-- El emparejamiento de reapariciones filtra por estas dos vías de identidad.
CREATE INDEX IF NOT EXISTS idx_subastas_ref_catastral
  ON subastas (ref_catastral)
  WHERE ref_catastral IS NOT NULL;

-- 3. CONSULTAS AL JUZGADO: constancia de lo que se ha preguntado y su respuesta.
--    El botón «📨 Enviar al juzgado» manda el escrito desde el buzón del monorepo
--    con Reply-To a Alberto, de modo que la respuesta le llegue a él y el triaje
--    de correo pueda reconocerla y volcarla aquí.
CREATE TABLE IF NOT EXISTS subastas_consultas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key    text NOT NULL,
  email_destino text NOT NULL,
  escrito       text NOT NULL,
  enviado_at    timestamptz NOT NULL DEFAULT now(),
  respuesta     text,
  respondido_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_subastas_consultas_key
  ON subastas_consultas (dedupe_key, enviado_at DESC);
