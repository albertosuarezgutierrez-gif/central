-- La «vista de corredor» (08/09/2026): Alberto abre el portal COMO lo ve un
-- cliente, desde la ficha de plataforma. Dictado: «el corredor puede acceder a
-- cualquier cosa». Reglas puras en `@central/module-seguros-portal/vista-corredor`.
--
-- Tres piezas:
--   1. Una identidad REAL dedicada al corredor, SIN canales (nadie puede entrar
--      como ella con un código). El id es fijo y vive en el módulo compartido:
--      las dos apps tienen que coincidir y una env desincronizada no falla.
--   2. `portal_vinculo.origen = 'corredor'` para el vínculo TEMPORAL entre esa
--      identidad y la ficha que se mira. asegura EXCLUYE ese origen al decir
--      «ya entra al portal»: mirar una ficha no puede convertirla en «entra».
--   3. El enlace de un solo uso que asegura crea y el portal consume. Hash
--      SHA-256 a secas (las dos apps no comparten pimienta), 10 minutos.
BEGIN;

INSERT INTO seguros.portal_identidad (id, nombre)
VALUES ('5c0aa8e2-1d3b-4c7e-9a41-c0aaed0c0de1', 'Corredor · Grupo ASegura')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE seguros.portal_vinculo DROP CONSTRAINT IF EXISTS portal_vinculo_origen_check;
ALTER TABLE seguros.portal_vinculo
  ADD CONSTRAINT portal_vinculo_origen_check
  CHECK (origen = ANY (ARRAY['email_hash'::text, 'manual'::text, 'corredor'::text]));

CREATE TABLE IF NOT EXISTS seguros.portal_vista_corredor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL REFERENCES seguros.corredurias (id) ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES seguros.clientes (id) ON DELETE CASCADE,
  -- El hash del token, nunca el token. 64 hex de SHA-256.
  token_hash    text NOT NULL UNIQUE,
  -- Quién lo pidió desde plataforma (su email de sesión). Es registro, no permiso.
  actor         text NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  -- NULL = sin abrir todavía. Con fecha = consumido: un enlace abre UNA vez.
  usado_en      timestamptz,
  CONSTRAINT portal_vista_corredor_token_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT portal_vista_corredor_actor_corto CHECK (char_length(actor) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS portal_vista_corredor_cliente_idx
  ON seguros.portal_vista_corredor (cliente_id, creado_en DESC);

-- asegura (corredor) crea el enlace; el portal solo lo lee y lo sella.
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.portal_vista_corredor TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.portal_vista_corredor TO crm_seguros;
GRANT SELECT ON seguros.portal_vista_corredor TO prisma_asegura_portal;
GRANT UPDATE (usado_en) ON seguros.portal_vista_corredor TO prisma_asegura_portal;

COMMIT;
