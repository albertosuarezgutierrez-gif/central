-- ✅ APLICADO el 04/09/2026 contra la Supabase compartida (schema `seguros`).
-- Verificado después de aplicarlo: 17 columnas, 12 constraints (5 CHECK + FKs),
-- 4 índices, y `has_table_privilege()` confirma que `prisma_asegura_portal`
-- tiene INSERT y UPDATE y **NO tiene DELETE** (una petición retirada se marca,
-- no se borra), y que `prisma_seguros` la lee.
--
-- ⚠️ El GRANT era obligatorio, no decorativo: los permisos de este schema se
-- conceden TABLA POR TABLA (ver `2026-09-02_portal_rol_vinculo_grants.sql`,
-- líneas 47-52) y no hay ningún `ALTER DEFAULT PRIVILEGES` ni `ALL TABLES IN
-- SCHEMA` en todo `prisma/sql/`. Una tabla `portal_*` nueva nace SIN permisos:
-- el modelo Prisma compilaría igual y la primera consulta moriría en la BD.

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_peticion_acceso (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id              uuid NOT NULL REFERENCES seguros.corredurias(id),

  -- Quien PIDE. Siempre hay identidad (ha entrado al portal); la ficha de la cartera puede no
  -- existir todavía, y por eso `solicitante_cliente_id` es opcional.
  solicitante_identidad_id   uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  solicitante_cliente_id     uuid REFERENCES seguros.clientes(id),

  -- El índice ciego del correo del destinatario (el MISMO HMAC que `clientes.email_lookup_hash`).
  -- Nunca el correo en claro: esta tabla la puede llenar cualquiera que entre al portal.
  destinatario_email_hash    text NOT NULL,
  -- La ficha del destinatario, resuelta por ese hash EN EL SERVIDOR. NULL = no había ninguna, o
  -- había varias y no se adivina. Quien pidió no ve la diferencia.
  destinatario_cliente_id    uuid REFERENCES seguros.clientes(id),

  -- Qué pide. Solo los dos alcances de LECTURA (`ALCANCES_CONCEDIBLES` del módulo).
  alcance                    text NOT NULL,
  -- Texto libre de quien pide, para que el otro sepa quién le escribe. Máx. 300; NULL si venía
  -- vacío (la cadena vacía es el valor de cajón que se cuela por todas las guardas de NULL).
  mensaje                    text,

  creada_en                  timestamptz NOT NULL DEFAULT now(),
  -- Una pendiente caduca a los 30 días (`DIAS_VIGENCIA_PETICION`).
  caduca_en                  timestamptz NOT NULL,

  -- Las TRES formas de resolverse. Lo resuelto gana a la caducidad (`estadoPeticion()`).
  concedida_en               timestamptz,
  autorizacion_id            uuid REFERENCES seguros.portal_autorizacion(id),
  rechazada_en               timestamptz,
  retirada_en                timestamptz,
  resuelta_por_identidad_id  uuid REFERENCES seguros.portal_identidad(id),

  ip                         inet,
  user_agent                 text
);

-- ─── Los CHECK, reejecutables ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- 1. Solo se piden los alcances de LECTURA. `partes` y `documentos` son actuar en nombre de
  --    otro y NO se conceden en esta fase (`ALCANCES_CONCEDIBLES`): un tick no es un poder.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_peticion_alcance_concedible') THEN
    ALTER TABLE seguros.portal_peticion_acceso
      ADD CONSTRAINT portal_peticion_alcance_concedible
      CHECK (alcance IN ('ver', 'ver_economico'));
  END IF;

  -- 2. El mensaje va a acabar delante de OTRA persona. El tope del módulo
  --    (`MAX_MENSAJE_PETICION`) también en la BD: recortar solo en el cliente no es un tope.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_peticion_mensaje_max') THEN
    ALTER TABLE seguros.portal_peticion_acceso
      ADD CONSTRAINT portal_peticion_mensaje_max
      CHECK (mensaje IS NULL OR char_length(mensaje) <= 300);
  END IF;

  -- 3. Una petición resuelta tiene que decir CÓMO. Concedida, rechazada y retirada son tres
  --    hechos distintos y excluyentes: retirar es «me he arrepentido» y rechazar es «me han
  --    dicho que no». Dos sellos a la vez dejarían el historial contando dos historias.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_peticion_una_resolucion') THEN
    ALTER TABLE seguros.portal_peticion_acceso
      ADD CONSTRAINT portal_peticion_una_resolucion
      CHECK (
        (CASE WHEN concedida_en IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN rechazada_en IS NOT NULL THEN 1 ELSE 0 END)
        + (CASE WHEN retirada_en  IS NOT NULL THEN 1 ELSE 0 END) <= 1
      );
  END IF;

  -- 4. Conceder deja RASTRO. Una concesión sin la autorización que salió de ella es una
  --    afirmación sin prueba: el solicitante vería «te lo concedieron» y no habría nada que
  --    abriera nada. Y sin la identidad que la resolvió no se puede demostrar quién consintió
  --    (art. 7.1 RGPD), que es exactamente el agujero del booleano `puede_ver_polizas`.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_peticion_concede_con_prueba') THEN
    ALTER TABLE seguros.portal_peticion_acceso
      ADD CONSTRAINT portal_peticion_concede_con_prueba
      CHECK (
        concedida_en IS NULL
        OR (autorizacion_id IS NOT NULL AND resuelta_por_identidad_id IS NOT NULL)
      );
  END IF;

  -- 5. Una caducidad anterior a la creación nace muerta y nadie lo vería: la petición saldría
  --    `caducada` en el mismo instante en que se creó.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_peticion_caduca_despues') THEN
    ALTER TABLE seguros.portal_peticion_acceso
      ADD CONSTRAINT portal_peticion_caduca_despues
      CHECK (caduca_en > creada_en);
  END IF;
END $$;

-- ─── Índices ─────────────────────────────────────────────────────────────────────────────────
-- 🚨 El que hace idempotente el «ya se lo pediste»: un mismo solicitante NO puede tener dos
-- peticiones PENDIENTES sobre el mismo destinatario. Sin él, insistir crea filas nuevas y el
-- destinatario recibe la misma pregunta N veces; y el resultado `ya_pendiente` —que sale por la
-- misma puerta que `registrada`, para no convertir el portal en un oráculo— no tendría cómo
-- detectarse sin una carrera. Parcial: las resueltas se quedan (son el historial) y no ocupan
-- sitio, así que volver a pedir después de un «no» crea una fila nueva, no revive la vieja.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_peticion_pendiente
  ON seguros.portal_peticion_acceso (solicitante_identidad_id, destinatario_email_hash)
  WHERE concedida_en IS NULL AND rechazada_en IS NULL AND retirada_en IS NULL;

-- La bandeja del DESTINATARIO: lo que tiene pendiente de contestar.
CREATE INDEX IF NOT EXISTS idx_portal_peticion_destinatario
  ON seguros.portal_peticion_acceso (destinatario_cliente_id, concedida_en, rechazada_en);
-- Lo que ve QUIEN PIDIÓ, y el cupo diario por SOLICITANTE (`MAX_PETICIONES_DIA`).
CREATE INDEX IF NOT EXISTS idx_portal_peticion_solicitante
  ON seguros.portal_peticion_acceso (solicitante_identidad_id, creada_en);

-- ─── Grants ──────────────────────────────────────────────────────────────────────────────────
-- El GRANT del portal es por TABLA, nombrada una a una (2026-09-02_portal_rol_vinculo_grants.sql,
-- «GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.portal_identidad, ... TO prisma_asegura_portal»)
-- y en todo `prisma/sql/` NO hay ni un `ALTER DEFAULT PRIVILEGES` ni un `ALL TABLES IN SCHEMA`:
-- una tabla portal_* nueva nace SIN permisos y hay que concederla aquí.
-- Sin DELETE a propósito: una petición retirada se MARCA (`retirada_en`), no se borra — borrarla
-- dejaría al destinatario sin saber que existió y al solicitante sin su historial.
GRANT SELECT, INSERT, UPDATE ON seguros.portal_peticion_acceso TO prisma_asegura_portal;
-- El corredor la LEE desde /correduria (ve qué se pide y a quién), pero no pide por nadie.
GRANT SELECT ON seguros.portal_peticion_acceso TO prisma_seguros;

-- ─── COMMENT ON (solo ASCII: los acentos y las comillas dan problemas al aplicarlo por el MCP) ─
COMMENT ON TABLE seguros.portal_peticion_acceso IS
  'Peticiones de acceso: el hijo PIDE ver la poliza del padre, la direccion contraria a portal_autorizacion. Existe porque quien menos usa el portal es justo quien tendria que empezar la invitacion. Tabla aparte de portal_autorizacion: una peticion concedida ya nace aceptada por el autorizado, y mezclarlas ensuciaria la cuenta de autorizaciones pendientes de aceptar, que es la prueba del art. 7.1 RGPD. Reglas puras en packages/module-seguros-portal/src/peticion-acceso.ts.';

COMMENT ON COLUMN seguros.portal_peticion_acceso.destinatario_email_hash IS
  'Indice ciego del correo del destinatario (mismo HMAC que clientes.email_lookup_hash), NUNCA el correo en claro. Se guarda por hash y no por cliente_id porque para pedir hay que escribir un correo cualquiera, y esta tabla la llena gente de la calle: si el portal distinguiera esa persona no esta con nosotros de peticion enviada, seria una maquina de recorrer correos y sacar quien es cliente de la correduria, a razon de un intento por correo, sin limite y sin que pareciera un ataque. Con 32.600 fichas detras eso es la cartera entera expuesta. Guardar el hash permite registrar la peticion SIN tener que responder si existe: respuestaPublica() colapsa no existe, ya te autorizo y ya se lo pediste en una sola frase.';

COMMENT ON COLUMN seguros.portal_peticion_acceso.destinatario_cliente_id IS
  'La ficha resuelta por ese hash EN EL SERVIDOR, nunca enviada por el cliente. NULL tiene dos significados que aqui NO se distinguen a proposito: no habia ninguna ficha, o habia varias y no se adivina. Quien pidio recibe la misma respuesta en los dos casos, por lo mismo del oraculo. Se resuelve al crear la peticion porque es el unico momento con el correo en claro.';

COMMENT ON COLUMN seguros.portal_peticion_acceso.retirada_en IS
  'La retira QUIEN PIDIO. No se colapsa con rechazada_en, que la pone el destinatario: uno dice me he arrepentido y el otro me han dicho que no, y confundirlos borraria el unico rastro de que alguien dijo que no. Se MARCA y no se borra la fila: el portal no tiene DELETE sobre esta tabla.';

COMMENT ON COLUMN seguros.portal_peticion_acceso.autorizacion_id IS
  'La portal_autorizacion que salio de conceder esto: la costura entre las dos tablas. Es lo que permite ensenarle al solicitante que su peticion sirvio de verdad, en vez de una pantalla que afirma te lo concedieron sin nada detras que abra nada. Por eso el CHECK portal_peticion_concede_con_prueba exige que este relleno junto a resuelta_por_identidad_id en cuanto hay concedida_en.';
