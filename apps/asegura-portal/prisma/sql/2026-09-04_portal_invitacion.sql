-- «Te invito a ver mis seguros» — la TERCERA puerta de la autorización.
--
-- Las reglas están en `packages/module-seguros-portal/src/invitacion.ts`; léelo
-- antes de tocar nada de aquí. Esto es solo la forma que tienen en la BD.
--
-- ── POR QUÉ UNA TABLA Y NO UNA `portal_autorizacion` EN ESTADO RARO ─────────
--
-- Porque a quien se invita **todavía no existe**: no tiene ficha en la cartera
-- ni identidad en el portal hasta que entra por primera vez. Una autorización
-- necesita apuntar a una de las dos (CHECK `portal_autorizacion_destinatario_unico`),
-- así que meterla ahí obligaría a inventarle una ficha fantasma o una identidad
-- sin nadie detrás — y las dos ensucian justo lo que este portal cuida.
--
-- La invitación se convierte en autorización cuando alguien PRUEBA ser ese
-- correo, y no antes. `autorizacion_id` es la costura entre las dos tablas.

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_invitacion (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id             uuid NOT NULL REFERENCES seguros.corredurias(id),

  -- Quién invita: la ficha cuyos seguros se abren, y la identidad que pulsó el
  -- botón. Las dos, porque una ficha puede tener varias personas detrás y el
  -- registro tiene que decir CUÁL de ellas lo hizo (art. 7.1 RGPD: no basta con
  -- tener el consentimiento, hay que poder demostrarlo).
  otorgante_cliente_id      uuid NOT NULL REFERENCES seguros.clientes(id),
  otorgada_por_identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id),

  -- 🚨 A quién se invita, por el hash del canal (`hashCanal()`, SHA-256 con la
  -- pimienta propia del portal). NUNCA el correo en claro: esta tabla la puede
  -- llenar cualquier cliente escribiendo direcciones, así que en claro sería una
  -- agenda de correos de terceros que no han consentido nada.
  --
  -- Es el MISMO hash que `portal_canal.valor_hash`, y eso es lo que permite que
  -- la aceptación se ate al CORREO y no al token: quien entra con ese correo
  -- casa, quien reenvía el enlace a otro no.
  destinatario_canal_hash   text NOT NULL,

  -- 🚨 El token del enlace, HASHEADO. En claro solo existe dentro del correo que
  -- sale. Una tabla de invitaciones con sus tokens legibles es una tabla de
  -- llaves: quien la lea entra en la invitación de cualquiera.
  --
  -- Y el token NO abre sesión por sí mismo (ver la cabecera del módulo puro):
  -- dice QUÉ invitación es; quién eres lo dice el código de un solo uso que
  -- llega a ese mismo correo.
  token_hash                text NOT NULL,

  alcance                   text NOT NULL,

  -- La ÚNICA póliza que se abrirá. NULL = todas las del otorgante, futuras
  -- incluidas. Misma FK COMPUESTA que en `portal_autorizacion`: la BD exige que
  -- la póliza sea DEL OTORGANTE, así que un id manipulado no cuela la de un
  -- tercero.
  poliza_id                 uuid,

  -- Texto libre de quien invita, para que el otro sepa quién le escribe. Va a
  -- acabar delante de otra persona: se escapa al pintarlo y no entra en un
  -- asunto de correo ni en una cabecera.
  mensaje                   text,

  creada_en                 timestamptz NOT NULL DEFAULT now(),
  caduca_en                 timestamptz NOT NULL,

  -- Aceptar crea la autorización, y las dos cosas van juntas o no van: una
  -- invitación «aceptada» sin autorización es un recibo de algo que no pasó.
  aceptada_en               timestamptz,
  aceptada_por_identidad_id uuid REFERENCES seguros.portal_identidad(id),
  autorizacion_id           uuid REFERENCES seguros.portal_autorizacion(id),

  -- Rechaza el INVITADO. Retira quien invitó. No es lo mismo y no se colapsan:
  -- uno dice «no quiero» y el otro «me he arrepentido de ofrecértelo».
  rechazada_en              timestamptz,
  rechazada_por_identidad_id uuid REFERENCES seguros.portal_identidad(id),
  retirada_en               timestamptz,

  ip                        inet,
  user_agent                text,

  CONSTRAINT portal_invitacion_alcance
    CHECK (alcance IN ('ver', 'ver_economico')),
  CONSTRAINT portal_invitacion_caduca_despues
    CHECK (caduca_en > creada_en),
  -- Un desenlace como mucho. Sin esto, una invitación podría estar aceptada y
  -- rechazada a la vez y `estadoInvitacion()` contestaría lo primero que mira.
  CONSTRAINT portal_invitacion_un_solo_desenlace
    CHECK (num_nonnulls(aceptada_en, rechazada_en, retirada_en) <= 1),
  -- Aceptada exige constar QUIÉN aceptó Y qué autorización salió. «Aceptado por
  -- el que tenía el enlace» no es una prueba de consentimiento: es una firma en
  -- blanco.
  CONSTRAINT portal_invitacion_acepta_con_sello
    CHECK (
      (aceptada_en IS NULL AND aceptada_por_identidad_id IS NULL AND autorizacion_id IS NULL)
      OR (aceptada_en IS NOT NULL AND aceptada_por_identidad_id IS NOT NULL AND autorizacion_id IS NOT NULL)
    ),
  CONSTRAINT portal_invitacion_rechaza_con_quien
    CHECK ((rechazada_en IS NULL) = (rechazada_por_identidad_id IS NULL)),
  CONSTRAINT portal_invitacion_mensaje_corto
    CHECK (mensaje IS NULL OR length(mensaje) <= 300),
  CONSTRAINT portal_invitacion_poliza_del_otorgante
    FOREIGN KEY (otorgante_cliente_id, poliza_id) REFERENCES seguros.polizas (cliente_id, id)
);

-- El token es la llave: dos invitaciones no pueden compartirlo jamás.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_invitacion_token
  ON seguros.portal_invitacion (token_hash);

-- 🚨 Una sola invitación VIVA por (quien invita, a quién, qué póliza, qué
-- alcance). Sin esto, cinco clics seguidos mandan cinco correos idénticos a un
-- desconocido — que desde su buzón se ve exactamente igual que un ataque.
--
-- `COALESCE` sobre la póliza porque en Postgres **dos NULL no son iguales**, y
-- «todas mis pólizas» tiene que poder chocar consigo mismo. Es la misma trampa
-- que ya mordió en `portal_autorizacion` el mismo día.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_invitacion_viva
  ON seguros.portal_invitacion (
    otorgante_cliente_id,
    destinatario_canal_hash,
    COALESCE(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid),
    alcance
  )
  WHERE aceptada_en IS NULL AND rechazada_en IS NULL AND retirada_en IS NULL;

-- Por destinatario: es la consulta que corre en CADA entrada al portal («¿me
-- han invitado a algo?»), así que no puede ser un barrido de la tabla.
CREATE INDEX IF NOT EXISTS idx_portal_invitacion_destinatario
  ON seguros.portal_invitacion (destinatario_canal_hash);

CREATE INDEX IF NOT EXISTS idx_portal_invitacion_otorgante
  ON seguros.portal_invitacion (otorgante_cliente_id, creada_en DESC);

-- El cupo diario se cuenta por IDENTIDAD que invita, no por destinatario: un
-- límite por destinatario volvería a filtrar («a este puedo invitarle diez
-- veces, luego…»).
CREATE INDEX IF NOT EXISTS idx_portal_invitacion_cupo
  ON seguros.portal_invitacion (otorgada_por_identidad_id, creada_en DESC);

-- ── Permisos ───────────────────────────────────────────────────────────────
--
-- El portal INSERTA y ACTUALIZA (aceptar, rechazar, retirar) pero **no BORRA**:
-- una invitación retirada se queda como historial, que es lo que permite
-- demostrar qué se ofreció y cuándo se retiró.
GRANT SELECT, INSERT, UPDATE ON seguros.portal_invitacion TO prisma_asegura_portal;
GRANT SELECT ON seguros.portal_invitacion TO prisma_seguros;

COMMENT ON TABLE seguros.portal_invitacion IS
  'La invitacion por correo: un cliente abre sus seguros a alguien que NO esta en la cartera. Es la tercera puerta de la autorizacion (las otras dos: conceder a un cliente, y que el de fuera pida). Existe como tabla aparte porque al invitado todavia no se le puede apuntar: no tiene ficha ni identidad hasta que entra. Se convierte en portal_autorizacion cuando alguien PRUEBA ser ese correo, y no antes.
🚨 El token del enlace NO abre sesion. Dice QUE invitacion es; quien eres lo dice el codigo de un solo uso que llega a ese mismo correo. Un enlace reenviado no le sirve a nadie mas, y la aceptacion consta a nombre de una identidad concreta en vez de "el que tenia el enlace".';

COMMENT ON COLUMN seguros.portal_invitacion.destinatario_canal_hash IS
  'Hash del correo invitado (hashCanal(), SHA-256 con la pimienta del portal). El MISMO que portal_canal.valor_hash, que es lo que permite atar la aceptacion al correo y no al token. Nunca en claro: esta tabla la llena cualquier cliente escribiendo direcciones de terceros.';
