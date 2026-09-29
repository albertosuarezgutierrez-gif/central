-- Portal de Grupo ASegura — avisos de la campana ya leídos (29/09/2026).
--
-- Al pulsar un aviso INFORMATIVO de la campana (vencimiento, póliza nueva o modificada, parte,
-- felicitación, carné por caducar) se sella aquí y deja de salir. La clave es `tipo:id`
-- (`claveAviso` de `@central/module-seguros-portal`); el id ya cambia por ciclo o por cambio nuevo,
-- así que el siguiente vencimiento o la siguiente modificación vuelven a avisar.
SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_aviso_leido (
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  clave        text NOT NULL CHECK (length(clave) <= 300),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identidad_id, clave)
);

-- Sin UPDATE ni DELETE: un aviso leído no se «des-lee».
GRANT SELECT, INSERT ON seguros.portal_aviso_leido TO prisma_asegura_portal;

-- Los privilegios por defecto del schema dan DML a `crm_seguros` en cada tabla nueva: se le quitan
-- (landmine de `apps/asegura-portal/CLAUDE.md`, 24/09/2026).
REVOKE ALL ON seguros.portal_aviso_leido FROM crm_seguros;
