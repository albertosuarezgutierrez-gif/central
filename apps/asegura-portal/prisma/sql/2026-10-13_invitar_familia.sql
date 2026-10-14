-- «Invita a tu familia a Grupo ASegura» — enlace PERSONAL y compartible (Web Share / copiar).
-- Aditivo. Reglas en `lib/invitar-familia.ts` y `lib/invitar-familia-bd.ts`.
--
-- Por qué NO reutiliza `portal_invitacion`: aquella ata la aceptación a un CORREO concreto
-- (`destinatario_canal_hash NOT NULL`). Un enlace que se comparte por WhatsApp no tiene destinatario
-- conocido. Aquí el enlace solo PRESENTA el portal («solo te presento», alcance `ninguno`): no abre
-- ni un seguro, no abre sesión y no lleva datos de pólizas. Quién eres lo sigue diciendo el código al correo.
BEGIN;
SET LOCAL search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_invitacion_enlace (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id          uuid NOT NULL REFERENCES seguros.corredurias(id),
  creada_por_identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  -- 🚨 HASHEADO (hashCanal): en claro solo existe en el enlace que sale por el menú de compartir.
  token_hash             text NOT NULL,
  creada_en              timestamptz NOT NULL DEFAULT now(),
  caduca_en              timestamptz NOT NULL,
  revocada_en            timestamptz,
  max_usos               integer NOT NULL DEFAULT 10,
  CONSTRAINT portal_invitacion_enlace_caduca_despues CHECK (caduca_en > creada_en),
  CONSTRAINT portal_invitacion_enlace_max_usos CHECK (max_usos BETWEEN 1 AND 50)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_invitacion_enlace_token
  ON seguros.portal_invitacion_enlace (token_hash);
-- El tope diario se cuenta aquí (identidad + ventana de 24 h).
CREATE INDEX IF NOT EXISTS idx_portal_invitacion_enlace_creador
  ON seguros.portal_invitacion_enlace (creada_por_identidad_id, creada_en DESC);

-- Quién ENTRÓ por un enlace y creó su identidad. UNA fila por identidad: el aviso al corredor sale
-- solo si el INSERT entra (el índice único es el que impide el doble aviso).
CREATE TABLE IF NOT EXISTS seguros.portal_invitacion_enlace_uso (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enlace_id           uuid NOT NULL REFERENCES seguros.portal_invitacion_enlace(id) ON DELETE CASCADE,
  identidad_id        uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  usado_en            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_invitacion_enlace_uso_identidad
  ON seguros.portal_invitacion_enlace_uso (identidad_id);
CREATE INDEX IF NOT EXISTS idx_portal_invitacion_enlace_uso_enlace
  ON seguros.portal_invitacion_enlace_uso (enlace_id);

ALTER TABLE seguros.portal_invitacion_enlace DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_invitacion_enlace_uso DISABLE ROW LEVEL SECURITY;

-- Mínimo: crear, leer, revocar (UPDATE). Sin DELETE: el registro es la prueba.
GRANT SELECT, INSERT, UPDATE ON seguros.portal_invitacion_enlace TO prisma_asegura_portal;
GRANT SELECT, INSERT ON seguros.portal_invitacion_enlace_uso TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_invitacion_enlace FROM crm_seguros;
REVOKE ALL ON seguros.portal_invitacion_enlace_uso FROM crm_seguros;

COMMIT;

-- Marcha atrás (antes, revertir el código):
--   DROP TABLE IF EXISTS seguros.portal_invitacion_enlace_uso; DROP TABLE IF EXISTS seguros.portal_invitacion_enlace;
