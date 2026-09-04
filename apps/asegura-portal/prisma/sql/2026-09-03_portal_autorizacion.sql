-- Portal de Grupo ASegura — Fase 5 (03/09/2026): autorizar a un TERCERO, con consentimiento acreditable.
--
-- Sustituye a `cliente_relaciones.puede_ver_polizas`, que no podía sostenerse: no decía quién lo
-- concedió, ni cuándo, ni con qué texto, ni cómo se revoca (art. 7.1 RGPD pide poder DEMOSTRARLO).
-- Las reglas viven en `@central/module-seguros-portal/autorizacion`; aquí solo su forma en la BD.
--
-- Este fichero hace TRES cosas, y la segunda toca datos existentes:
--   1. Crea `portal_autorizacion` (el consentimiento) y `portal_autorizacion_uso` (el registro de
--      accesos que el OTORGANTE puede ver — la pieza que convierte la autorización en algo real
--      y no en un cheque en blanco).
--   2. Apaga las 104 filas de `cliente_relaciones` que traían `puede_ver_polizas = true` desde el
--      volcado del CRM del 21/06/2026. 🚨 NO se pierde nada: antes se copian a
--      `cliente_relaciones_permiso_volcado`, así que revertirlo es un UPDATE desde esa tabla.
--      Se hace HOY porque `portal_vinculo` está a 0 filas: nadie ha entrado aún, así que no hay
--      acceso indebido que notificar. El día después de la primera invitación, esto sería art. 33.
--   3. Le quita al rol del portal el permiso de LEER esa columna, para que no pueda volver por
--      descuido. El resto de `cliente_relaciones` se le deja: el portal necesita las relaciones
--      para ofrecerle a José a quién puede autorizar.
SET search_path = seguros, public;

-- ─── 1. El consentimiento ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_autorizacion (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id             uuid NOT NULL REFERENCES seguros.corredurias(id),
  -- Quién cede sus datos, y a quién. Fichas de la cartera (no identidades): la
  -- autorización vale desde el momento en que el autorizado entra al portal,
  -- aunque hoy todavía no tenga cuenta.
  otorgante_cliente_id      uuid NOT NULL REFERENCES seguros.clientes(id),
  autorizado_cliente_id     uuid NOT NULL REFERENCES seguros.clientes(id),
  alcance                   text NOT NULL CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos')),
  -- Con qué título representa a la SOCIEDAD quien recibe un apoderamiento. Solo tiene
  -- sentido cuando quien cede es una persona JURÍDICA: el RGPD protege a las personas
  -- físicas, y por eso de una física solo se delega mirar; una sociedad no tiene datos
  -- personales y lo que hay ahí no es consentimiento sino REPRESENTACIÓN mercantil.
  -- 🚨 Y de una representación tiene que constar CÓMO: si quien la ejerce da un parte,
  -- la que queda obligada es la sociedad, y «alguien de la empresa» no es un título.
  titulo_representacion     text,
  -- Por dónde entró el consentimiento. `corredor` = la correduría anota uno recibido
  -- por teléfono o en papel. 🚨 Que se distinga NO es contabilidad: un consentimiento
  -- que la correduría se auto-anota no puede ser indistinguible del que dio el
  -- interesado — y sigue sin abrir nada hasta que el autorizado lo ACEPTE.
  origen                    text NOT NULL DEFAULT 'portal' CHECK (origen IN ('portal', 'corredor')),
  -- Quién la concedió DE VERDAD: la identidad que estaba en la sesión, no «el cliente».
  otorgado_en               timestamptz NOT NULL DEFAULT now(),
  otorgado_por_identidad_id uuid REFERENCES seguros.portal_identidad(id),
  -- Y si entró por el corredor, qué persona de la correduría la anotó.
  otorgado_por_actor        text,
  -- Doble aceptación: sin esto la autorización existe pero no abre nada.
  aceptado_en               timestamptz,
  aceptado_por_identidad_id uuid REFERENCES seguros.portal_identidad(id),
  -- No se prorroga sola. Es lo único que resuelve el divorcio: nadie entra a revocar ese día.
  caduca_en                 timestamptz NOT NULL,
  revocado_en               timestamptz,
  -- 🚨 `caducidad` NO es una revocación: cierra una que YA había caducado, para liberar
  -- el sitio del índice único parcial al renovarla. Sin ese cuarto valor, renovar una
  -- autorización caducada choca con el índice y el usuario ve un error que no entiende.
  revocado_por              text CHECK (revocado_por IN ('otorgante', 'autorizado', 'corredor', 'caducidad')),
  -- Simetría de la prueba: de la aceptación consta QUIÉN la firmó; de la revocación
  -- constaba solo el LADO. Una tabla construida para poder demostrar no puede ser asimétrica.
  revocado_por_identidad_id uuid REFERENCES seguros.portal_identidad(id),
  revocado_por_actor        text,
  -- Qué texto aceptó. Sin él, «consintió» no se puede demostrar (art. 7.1 RGPD).
  version_texto             text NOT NULL,
  ip                        inet,
  user_agent                text,
  CONSTRAINT portal_autorizacion_no_a_si_mismo
    CHECK (otorgante_cliente_id <> autorizado_cliente_id),
  -- Nunca las dos, nunca ninguna: sin saber quién la otorgó no hay nada que demostrar.
  CONSTRAINT portal_autorizacion_quien_otorga CHECK (
    (origen = 'portal'   AND otorgado_por_identidad_id IS NOT NULL AND otorgado_por_actor IS NULL)
    OR
    (origen = 'corredor' AND otorgado_por_actor IS NOT NULL AND otorgado_por_identidad_id IS NULL)
  ),
  -- Una aceptación sin quién la firmó no acredita nada; y al revés no significa nada.
  CONSTRAINT portal_autorizacion_acepta_con_quien
    CHECK ((aceptado_en IS NULL) = (aceptado_por_identidad_id IS NULL)),
  CONSTRAINT portal_autorizacion_revoca_con_quien
    CHECK ((revocado_en IS NULL) = (revocado_por IS NULL)),
  CONSTRAINT portal_autorizacion_caduca_despues
    CHECK (caduca_en > otorgado_en),
  -- El vocabulario de los títulos, en la BD y no solo en el código: una fila con
  -- «jefe» dentro sería un poder que nadie sabría interpretar tres años después.
  CONSTRAINT portal_autorizacion_titulo CHECK (
    titulo_representacion IS NULL
    OR titulo_representacion IN ('administrador', 'apoderado', 'empleado_autorizado')
  ),
  -- 🚨 Apoderamiento SIN título no entra. `partes` y `documentos` son actuar en nombre
  -- de otro, y sin saber con qué título se actuó no hay nada que oponerle a la compañía
  -- el día que discuta la cobertura (art. 16 LCS). Los alcances de lectura no lo piden:
  -- ahí `NULL` es «no aplica», no un hueco.
  CONSTRAINT portal_autorizacion_apoderamiento_con_titulo CHECK (
    alcance NOT IN ('partes', 'documentos') OR titulo_representacion IS NOT NULL
  )
);

-- Una VIVA por (otorgante, autorizado, alcance). Las revocadas se quedan: son el historial que
-- demuestra qué hubo y hasta cuándo, y volver a conceder crea una fila nueva, no revive la vieja.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_autorizacion_viva
  ON seguros.portal_autorizacion (otorgante_cliente_id, autorizado_cliente_id, alcance)
  WHERE revocado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_portal_autorizacion_otorgante ON seguros.portal_autorizacion (otorgante_cliente_id);
CREATE INDEX IF NOT EXISTS idx_portal_autorizacion_autorizado ON seguros.portal_autorizacion (autorizado_cliente_id);

-- ─── El registro de accesos, que ve el OTORGANTE ─────────────────────────────
-- Una fila por autorización, identidad y DÍA: José ve «María miró tus seguros el 3 y el 12»
-- sin que esto se convierta en un log de una fila por render.
CREATE TABLE IF NOT EXISTS seguros.portal_autorizacion_uso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  autorizacion_id uuid NOT NULL REFERENCES seguros.portal_autorizacion(id) ON DELETE CASCADE,
  identidad_id    uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  dia             date NOT NULL,
  visitas         integer NOT NULL DEFAULT 1 CHECK (visitas > 0),
  primera_en      timestamptz NOT NULL DEFAULT now(),
  ultima_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (autorizacion_id, identidad_id, dia)
);
CREATE INDEX IF NOT EXISTS idx_portal_autorizacion_uso_autorizacion
  ON seguros.portal_autorizacion_uso (autorizacion_id, dia DESC);

-- ─── 2. Apagar lo heredado, SIN perderlo ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.cliente_relaciones_permiso_volcado (
  relacion_id             uuid PRIMARY KEY REFERENCES seguros.cliente_relaciones(id) ON DELETE CASCADE,
  puede_ver_polizas_antes boolean NOT NULL,
  apagado_en              timestamptz NOT NULL DEFAULT now(),
  motivo                  text NOT NULL
);
COMMENT ON TABLE seguros.cliente_relaciones_permiso_volcado IS
  'Foto de las relaciones que traían puede_ver_polizas=true del volcado del CRM (21/06/2026) antes de apagarlas el 03/09/2026. Revertir = UPDATE cliente_relaciones r SET puede_ver_polizas = v.puede_ver_polizas_antes FROM cliente_relaciones_permiso_volcado v WHERE v.relacion_id = r.id.';

INSERT INTO seguros.cliente_relaciones_permiso_volcado (relacion_id, puede_ver_polizas_antes, motivo)
SELECT id, puede_ver_polizas,
       'volcado CRM 21/06/2026 sin consentimiento acreditable (RGPD arts. 5.2 y 7.1); apagado 03/09/2026 antes de la primera invitacion al portal'
FROM seguros.cliente_relaciones
WHERE puede_ver_polizas
ON CONFLICT (relacion_id) DO NOTHING;

UPDATE seguros.cliente_relaciones SET puede_ver_polizas = false WHERE puede_ver_polizas;

COMMENT ON COLUMN seguros.cliente_relaciones.puede_ver_polizas IS
  'MUERTA para el portal desde el 03/09/2026: el consentimiento vive en portal_autorizacion. El rol del portal ya no puede leer esta columna. No la vuelvas a usar para decidir accesos.';

-- ─── 3. Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON seguros.portal_autorizacion TO prisma_asegura_portal;
GRANT SELECT, INSERT, UPDATE ON seguros.portal_autorizacion_uso TO prisma_asegura_portal;
-- El corredor las ve y las puede revocar desde /correduria; no las concede por el cliente.
GRANT SELECT, INSERT, UPDATE ON seguros.portal_autorizacion TO prisma_seguros;
GRANT SELECT ON seguros.portal_autorizacion_uso, seguros.cliente_relaciones_permiso_volcado TO prisma_seguros;

-- Que no pueda volver por descuido: el portal deja de poder LEER el booleano viejo.
-- El resto de columnas de `cliente_relaciones` se le dejan — las necesita para ofrecerle
-- a José a quién puede autorizar.
REVOKE SELECT (puede_ver_polizas) ON seguros.cliente_relaciones FROM prisma_asegura_portal;
