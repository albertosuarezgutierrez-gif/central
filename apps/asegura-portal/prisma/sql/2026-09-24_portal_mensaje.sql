-- Mensajes con tu corredor (ASegura OS §Q.7, 24/09/2026).
--
-- Un hilo por TEMA: la póliza (`poliza_id`) o «general» (NULL). El cliente escribe desde el portal
-- (`prisma_asegura_portal`); Alberto contesta desde /correduria de plataforma, que llega por el
-- puerto de `apps/asegura` (`prisma_seguros`). Sustituye al «te mando un correo y espero» y queda en
-- la ficha, que es donde se busca después.
--
-- 🚨 La ficha sale SIEMPRE de `portal_vinculo` de la sesión (portal) o de la cartera (corredor), nunca
-- de un id que venga en la petición. Con un rol sin RLS, un `cliente_id` de fuera no falla: escribe
-- en la ficha de otro.
--
-- APLICADA el 24/09/2026 (migraciones seguros_portal_mensaje + _sin_borrado). Cepos vistos morder
-- en bloque revertido: póliza de otra ficha → 23503; autor cliente sin identidad → 23514; cuerpo en
-- blanco → 23514.
--
-- 🦷 La FK compuesta (cliente_id, poliza_id) → polizas(cliente_id, id) impide colgar un mensaje de la
-- póliza de OTRA persona aunque llegue un id manipulado: es el mismo cepo que `portal_autorizacion`.
--
-- 🚫 No se borra ni se edita el cuerpo: un mensaje es una comunicación, no un borrador. Los roles solo
-- tienen UPDATE sobre `leido_at`.

CREATE TABLE IF NOT EXISTS seguros.portal_mensaje (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id     uuid NOT NULL REFERENCES seguros.clientes(id),
  poliza_id      uuid NULL,
  autor          text NOT NULL,
  identidad_id   uuid NULL REFERENCES seguros.portal_identidad(id),
  actor          text NULL,
  cuerpo         text NOT NULL,
  creado_at      timestamptz NOT NULL DEFAULT now(),
  -- Leído por el DESTINATARIO: si escribe el cliente, lo lee el corredor, y al revés.
  -- NULL = no consta que lo haya leído (no es «no lo ha leído»).
  leido_at       timestamptz NULL,
  CONSTRAINT portal_mensaje_poliza_de_la_ficha
    FOREIGN KEY (cliente_id, poliza_id) REFERENCES seguros.polizas(cliente_id, id),
  CONSTRAINT portal_mensaje_autor CHECK (autor IN ('cliente', 'corredor')),
  -- Quién escribió consta SIEMPRE, y de la forma que corresponde a su lado.
  CONSTRAINT portal_mensaje_autor_consta CHECK (
    (autor = 'cliente' AND identidad_id IS NOT NULL AND actor IS NULL)
    OR (autor = 'corredor' AND actor IS NOT NULL AND identidad_id IS NULL)
  ),
  CONSTRAINT portal_mensaje_cuerpo CHECK (char_length(btrim(cuerpo)) BETWEEN 1 AND 4000),
  CONSTRAINT portal_mensaje_actor_largo CHECK (actor IS NULL OR char_length(actor) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_portal_mensaje_hilo ON seguros.portal_mensaje (cliente_id, creado_at);
-- La cola de Alberto: lo que ha escrito un cliente y nadie ha leído.
CREATE INDEX IF NOT EXISTS idx_portal_mensaje_sin_leer
  ON seguros.portal_mensaje (correduria_id, creado_at) WHERE autor = 'cliente' AND leido_at IS NULL;

GRANT SELECT, INSERT ON seguros.portal_mensaje TO prisma_asegura_portal;
GRANT UPDATE (leido_at) ON seguros.portal_mensaje TO prisma_asegura_portal;
-- Los privilegios por defecto del schema dan DML completo a prisma_seguros: se le quitan
-- DELETE y el UPDATE de tabla (medido al aplicar, 24/09/2026) y se deja solo `leido_at`.
REVOKE DELETE, UPDATE, TRUNCATE ON seguros.portal_mensaje FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.portal_mensaje TO prisma_seguros;
GRANT UPDATE (leido_at) ON seguros.portal_mensaje TO prisma_seguros;
REVOKE ALL ON seguros.portal_mensaje FROM crm_seguros;

COMMENT ON TABLE seguros.portal_mensaje IS
  'Mensajes cliente <-> corredor, un hilo por poliza (NULL = general). Sin DELETE ni UPDATE del cuerpo: es una comunicacion.';
