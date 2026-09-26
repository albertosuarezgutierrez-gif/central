-- Portal de Grupo ASegura — avisos push de lo que llega de CIMA (25/09/2026).
--
-- Recibo nuevo al cobro, recibo devuelto y movimientos de un siniestro. Lógica en
-- `@central/module-seguros-portal/avisos-cima`; cron en `app/api/cron/avisos-cima`.
--
-- `portal_aviso_cima`: una fila por (identidad, novedad) ya sellada. Es lo que evita repetir un
-- aviso y lo que hace de SEMILLA silenciosa (clave `base:<poliza>:<recibos|siniestros>`): sin ella la primera pasada
-- mandaría cada recibo devuelto de hace años. Las dos listas de tipos de los CHECK son las de
-- `TIPOS_AVISO_CIMA` (+ `base`); las compara `test/regression-portal-avisos-cima.test.ts`.
-- `portal_aviso_silenciado`: los tipos que el cliente apagó. Sin fila = encendido.
SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_aviso_cima (
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  clave        text NOT NULL CHECK (length(clave) <= 300),
  tipo         text NOT NULL CHECK (tipo IN ('base', 'recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva')),
  enviado      boolean NOT NULL DEFAULT false,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identidad_id, clave)
);

CREATE TABLE IF NOT EXISTS seguros.portal_aviso_silenciado (
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva')),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identidad_id, tipo)
);

-- Sin UPDATE ni DELETE en el sello: una novedad avisada no se «des-avisa».
GRANT SELECT, INSERT ON seguros.portal_aviso_cima TO prisma_asegura_portal;
GRANT SELECT, INSERT, DELETE ON seguros.portal_aviso_silenciado TO prisma_asegura_portal;

-- Los privilegios por defecto del schema dan DML a `crm_seguros` en cada tabla nueva: se le quitan
-- (ver el landmine de `apps/asegura-portal/CLAUDE.md`, 24/09/2026).
REVOKE ALL ON seguros.portal_aviso_cima FROM crm_seguros;
REVOKE ALL ON seguros.portal_aviso_silenciado FROM crm_seguros;

-- 26/09/2026: `poliza_nueva` («tienes una póliza nueva»). En la BD ya creada se amplían los CHECK con
-- `2026-09-26_portal_aviso_poliza_nueva.sql`; aquí queda la forma final para quien cree de cero.
