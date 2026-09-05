-- ⏸️ NO APLICADA todavía. Se aplica contra la Supabase compartida (schema `seguros`)
-- en el mismo paso en que se despliega el portal con esta pantalla: una tabla sin
-- pantalla no recoge nada, y una pantalla sin tabla promete un derecho y falla al
-- guardarlo, que es peor que no ofrecerlo.
--
-- ⚠️ El GRANT del final es obligatorio, no decorativo: los permisos de este schema se
-- conceden TABLA POR TABLA (ver `2026-09-02_portal_rol_vinculo_grants.sql`) y no hay
-- ningún `ALTER DEFAULT PRIVILEGES` ni `ALL TABLES IN SCHEMA` en todo `prisma/sql/`.
-- Una tabla `portal_*` nueva nace SIN permisos: el modelo Prisma compilaría igual y la
-- primera consulta moriría en la BD.
--
-- 🚨 QUÉ ES ESTA TABLA, Y SOBRE TODO QUÉ NO ES: es el registro de una SOLICITUD de
-- supresión (art. 17 RGPD), no un borrado. El art. 17.3.b y el 17.3.e excluyen la
-- supresión cuando el tratamiento hace falta para cumplir una obligación legal o para
-- defender reclamaciones, y una correduría tiene las dos cosas (normativa de seguros y
-- prevención del blanqueo). Lo obligatorio es RECIBIR la solicitud, acusarla y
-- CONTESTAR EN UN MES (art. 12.3) diciendo qué se borra y qué no, con su base legal
-- (art. 12.4: la negativa parcial hay que motivarla).
--
-- Reglas puras y plazos: `packages/module-seguros-portal/src/supresion.ts`.

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_supresion (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id             uuid NOT NULL REFERENCES seguros.corredurias(id),

  -- Quien la pide. Siempre hay identidad (ha entrado al portal); la ficha de la cartera
  -- puede no existir (los ~32.520 leads también tienen derecho a pedirlo), y por eso
  -- `cliente_id` es opcional. NULL aquí NO significa «no es cliente»: significa que su
  -- acceso no está enlazado con ninguna ficha.
  identidad_id              uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  cliente_id                uuid REFERENCES seguros.clientes(id),

  -- 🕐 EL RELOJ DEL ART. 12.3. `recibida_en` es el instante en que la persona pulsó, no
  -- el instante en que el corredor la abre: si el plazo arrancara al mirarla, no mirarla
  -- nunca sería una forma de no incumplir jamás.
  recibida_en               timestamptz NOT NULL DEFAULT now(),
  estado                    text NOT NULL DEFAULT 'recibida',

  -- La prórroga del art. 12.3 (dos meses más). Se sella CUANDO SE AVISA al interesado,
  -- porque prorrogar en silencio incumple igual que no contestar: el sello es la prueba
  -- de que se le dijo, y el motivo es lo que hay que decirle.
  prorrogada_en             timestamptz,
  prorroga_motivo           text,

  -- La resolución. `respuesta` es lo que se le contestó, en sus palabras: es lo que
  -- acredita el art. 12.4 el día que alguien pregunte por qué no se borró todo.
  resuelta_en               timestamptz,
  respuesta                 text,
  resuelta_por              text,

  -- Texto libre de quien pide (por qué lo pide, qué le preocupa). Máx. 1.000; NULL si
  -- venía vacío — la cadena vacía es el valor de cajón que se cuela por las guardas de NULL.
  motivo                    text,

  -- La versión de los textos legales que se le enseñó al pedirlo. Sin ella no se puede
  -- demostrar QUÉ se le dijo que se iba a conservar: el alcance cambia cuando cambian
  -- los textos, y una solicitud sin versión no se puede reconstruir.
  version_textos            text NOT NULL,

  ip                        inet,
  user_agent                text
);

-- ─── Los CHECK, reejecutables ────────────────────────────────────────────────────────
DO $$
BEGIN
  -- 1. El vocabulario de estados lo fija el módulo puro (`ESTADOS_SUPRESION`). Un estado
  --    inventado dejaría la solicitud fuera de toda cola: ni pendiente ni resuelta.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_supresion_estado') THEN
    ALTER TABLE seguros.portal_supresion
      ADD CONSTRAINT portal_supresion_estado
      CHECK (estado IN ('recibida', 'en_curso', 'resuelta_total', 'resuelta_parcial', 'denegada', 'retirada'));
  END IF;

  -- 2. 🚨 Una solicitud RESUELTA tiene que decir QUÉ se contestó y CUÁNDO. Un estado
  --    `resuelta_parcial` sin `resuelta_en` ni `respuesta` es marcar el plazo como
  --    cumplido sin nada que lo acredite — y el reloj deja de correr en la pantalla del
  --    corredor, así que el incumplimiento se vuelve invisible justo al producirse.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_supresion_resuelta_con_prueba') THEN
    ALTER TABLE seguros.portal_supresion
      ADD CONSTRAINT portal_supresion_resuelta_con_prueba
      CHECK (
        estado IN ('recibida', 'en_curso')
        OR (resuelta_en IS NOT NULL AND respuesta IS NOT NULL AND char_length(btrim(respuesta)) > 0)
      );
  END IF;

  -- 3. Y al revés: sellar la fecha sin cambiar el estado dejaría una resuelta contando
  --    como pendiente para siempre en la cola.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_supresion_sello_coherente') THEN
    ALTER TABLE seguros.portal_supresion
      ADD CONSTRAINT portal_supresion_sello_coherente
      CHECK (resuelta_en IS NULL OR estado NOT IN ('recibida', 'en_curso'));
  END IF;

  -- 4. La prórroga se AVISA (art. 12.3): sin motivo no se puede haber avisado de nada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_supresion_prorroga_motivada') THEN
    ALTER TABLE seguros.portal_supresion
      ADD CONSTRAINT portal_supresion_prorroga_motivada
      CHECK (
        prorrogada_en IS NULL
        OR (prorroga_motivo IS NOT NULL AND char_length(btrim(prorroga_motivo)) > 0)
      );
  END IF;

  -- 5. Topes también en la BD: recortar solo en el cliente no es un tope.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_supresion_motivo_max') THEN
    ALTER TABLE seguros.portal_supresion
      ADD CONSTRAINT portal_supresion_motivo_max
      CHECK (motivo IS NULL OR char_length(motivo) <= 1000);
  END IF;
END $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────────────
-- 🚨 El que hace idempotente el «ya la tienes pedida»: una identidad NO puede tener dos
-- solicitudes PENDIENTES. Sin él, insistir crea filas nuevas y multiplica los relojes
-- legales sobre el mismo caso — y `puedeRegistrar()` no tendría cómo detectarlo sin una
-- carrera. Parcial: las resueltas se quedan (son el historial y la prueba de que se
-- atendió), así que volver a pedirlo más adelante crea una fila nueva, no revive la vieja.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_supresion_pendiente
  ON seguros.portal_supresion (identidad_id)
  WHERE estado IN ('recibida', 'en_curso');

-- La COLA DEL CORREDOR, que es la razón de que esto exista en plataforma: lo pendiente,
-- ordenado por el reloj legal y no por orden de llegada.
CREATE INDEX IF NOT EXISTS idx_portal_supresion_cola
  ON seguros.portal_supresion (estado, recibida_en);

-- ─── Grants ──────────────────────────────────────────────────────────────────────────
-- El portal registra y retira (UPDATE), pero NO resuelve: quien contesta es el corredor.
-- Sin DELETE a propósito — una solicitud retirada se MARCA. Borrarla dejaría al corredor
-- sin saber que existió y al interesado sin la prueba de que la hizo, que es justo lo que
-- el art. 12 le da.
GRANT SELECT, INSERT, UPDATE ON seguros.portal_supresion TO prisma_asegura_portal;
-- El corredor la lee y la RESUELVE desde /correduria, por el puerto de `apps/asegura`.
GRANT SELECT, UPDATE ON seguros.portal_supresion TO prisma_seguros;

-- ─── COMMENT ON (solo ASCII: los acentos y las comillas dan problemas por el MCP) ─────
COMMENT ON TABLE seguros.portal_supresion IS
  'Solicitudes del derecho de supresion (art. 17 RGPD). NO es un borrado: el art. 17.3.b y el 17.3.e excluyen la supresion cuando hace falta cumplir una obligacion legal o defender reclamaciones, y una correduria tiene las dos (normativa de seguros y prevencion del blanqueo). Un boton que dijera borrado y dejara los datos seria una mentira al interesado; uno que borrara de verdad destruiria documentacion que la ley obliga a guardar. Lo obligatorio y lo que esta tabla soporta es: recibir, acusar y contestar en un mes (art. 12.3) diciendo que se borra y que se conserva con su base legal (art. 12.4). Reglas y plazos en packages/module-seguros-portal/src/supresion.ts.';

COMMENT ON COLUMN seguros.portal_supresion.recibida_en IS
  'Cuando la persona la envio, NO cuando el corredor la abre. Es el instante desde el que corre el mes del art. 12.3: si el reloj arrancara al mirarla, no mirarla nunca seria una forma de no incumplir jamas.';

COMMENT ON COLUMN seguros.portal_supresion.prorrogada_en IS
  'Sello de la prorroga del art. 12.3 (dos meses mas). Se pone CUANDO SE AVISA al interesado, no cuando se decide: prorrogar en silencio incumple igual que no contestar. Por eso el CHECK exige prorroga_motivo, que es lo que hay que decirle.';

COMMENT ON COLUMN seguros.portal_supresion.respuesta IS
  'Lo que se le contesto, en sus palabras. Es lo que acredita el art. 12.4 el dia que alguien pregunte por que no se borro todo: una negativa parcial sin motivo escrito es exactamente lo que ese articulo prohibe. El CHECK portal_supresion_resuelta_con_prueba impide marcarla resuelta sin esto.';

COMMENT ON COLUMN seguros.portal_supresion.cliente_id IS
  'La ficha de la cartera enlazada, si la hay. NULL NO significa que no sea cliente: significa que su acceso no esta enlazado con ninguna ficha. Los leads tambien pueden ejercer el derecho, y la solicitud se registra igual.';

COMMENT ON COLUMN seguros.portal_supresion.version_textos IS
  'Version de los textos legales que se le enseno al pedirlo. Sin ella no se puede demostrar QUE se le dijo que se iba a conservar: el alcance cambia cuando cambian los textos, y una solicitud sin version no se puede reconstruir despues.';
