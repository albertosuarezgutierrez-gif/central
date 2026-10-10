-- Google Contacts: «un número, un contacto» y «enriquecer ficha» (05/10/2026, decisión de Alberto).
--
-- · `google_contactos_titular_telefono`: de QUIÉN es un teléfono que comparten varias fichas (la empresa y
--   la persona que la lleva…), elegido por Alberto en la cola («Este número es de…»). Ese número es UN
--   contacto en Google (el de esa ficha); las demás van dentro como organization y en la nota.
--   🚨 Solo presentación en Google: las fichas del CRM NO se fusionan. Clave = índice ciego del número
--   (`computeTelefonoLookupHash`, HMAC con PII_LOOKUP_KEY, el mismo de `clientes.telefono_lookup_hash`):
--   el teléfono NUNCA se guarda en claro.
-- · `google_contactos_revision`: tipos nuevos `telefono_titular` y `telefono_muchas_fichas` (informativa,
--   >3 fichas: centralita/gestoría; ambos con `telefono_hash` y `candidatos`) y
--   `enriquecer_ficha` (el dato va en `propuesta_cifrada`, cifrado como siempre); botones nuevos
--   `elegir_titular` y `anadir_a_ficha`. INSERT lo cubre el GRANT de tabla; UPDATE sigue limitado a las
--   columnas de resolución (elegir_titular escribe `cliente_id`, ya concedida).
-- 🚪 Permisos como las hermanas: solo `prisma_seguros`; RLS activada sin políticas.
-- 🚨 GATE DDL. Aplicar ANTES de desplegar el código: sin la tabla el cron falla al leer los titulares
-- (y NO escribe nada en Google); sin las columnas, la cola no puede encolar. Idempotente.

CREATE TABLE IF NOT EXISTS seguros.google_contactos_titular_telefono (
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  telefono_hash  text NOT NULL CHECK (telefono_hash ~ '^[0-9a-f]{64}$'),
  cliente_id     uuid NOT NULL REFERENCES seguros.clientes (id) ON DELETE CASCADE,
  elegido_por    text NOT NULL,
  elegido_en     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correduria_id, telefono_hash)
);
ALTER TABLE seguros.google_contactos_titular_telefono ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.google_contactos_titular_telefono FROM PUBLIC, anon, authenticated, crm_seguros;
-- Los privilegios por defecto del bootstrap le dan DELETE a prisma_seguros: la elección solo se crea o
-- se cambia (upsert); desaparece sola con la ficha (CASCADE).
REVOKE DELETE ON seguros.google_contactos_titular_telefono FROM prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.google_contactos_titular_telefono TO prisma_seguros;
COMMENT ON TABLE seguros.google_contactos_titular_telefono IS
  'Titular elegido de un teléfono compartido por varias fichas (Google Contacts: un número, un contacto). Índice ciego, nunca el número.';

ALTER TABLE seguros.google_contactos_revision ADD COLUMN IF NOT EXISTS telefono_hash text;
ALTER TABLE seguros.google_contactos_revision ADD COLUMN IF NOT EXISTS candidatos uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE seguros.google_contactos_revision DROP CONSTRAINT IF EXISTS google_contactos_revision_tipo_check;
ALTER TABLE seguros.google_contactos_revision ADD CONSTRAINT google_contactos_revision_tipo_check
  CHECK (tipo IN ('cambio_en_google', 'borrado_en_google', 'sacado_del_grupo', 'propuesta_lead', 'duplicado_ambiguo',
                  'telefono_titular', 'telefono_muchas_fichas', 'enriquecer_ficha'));

ALTER TABLE seguros.google_contactos_revision DROP CONSTRAINT IF EXISTS google_contactos_revision_resolucion_check;
ALTER TABLE seguros.google_contactos_revision ADD CONSTRAINT google_contactos_revision_resolucion_check
  CHECK (resolucion IN ('aceptar_lead', 'descartar', 'mantener_crm', 'unificar', 'unificar_nombre_crm', 'usar_como_mote',
                        'elegir_titular', 'anadir_a_ficha'));

-- `telefono_hash` y `candidatos` solo (y siempre) en «Este número es de…» y en la informativa de >3 fichas.
ALTER TABLE seguros.google_contactos_revision DROP CONSTRAINT IF EXISTS google_contactos_revision_titular_check;
ALTER TABLE seguros.google_contactos_revision ADD CONSTRAINT google_contactos_revision_titular_check
  CHECK (
    CASE WHEN tipo IN ('telefono_titular', 'telefono_muchas_fichas')
      THEN telefono_hash ~ '^[0-9a-f]{64}$' AND cardinality(candidatos) >= 2
      ELSE telefono_hash IS NULL AND cardinality(candidatos) = 0
    END
  );
