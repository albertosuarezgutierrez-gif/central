-- «Hay cambios en tu póliza» (27/09/2026). Alberto, 15/09: a cualquier notificación o
-- modificación de su póliza, aviso en la intranet + correo cortito con acceso directo.
--
-- No hay disparador en `polizas` (CIMA escribe desde el CRM de Manuel): el aviso se DERIVA. El cron
-- de avisos de la intranet (`apps/asegura/lib/poliza-cambios-detector.ts`) saca cada día una FOTO de
-- cada póliza de la cartera viva, la compara con la guardada y, si difiere en algo que importa al
-- cliente, escribe un cambio. La comparación es pura: `camposCambiados()` de
-- `@central/module-seguros-portal` (`poliza-cambios.ts`).
--
-- 🚨 La primera foto de una póliza NO es un cambio (semilla silenciosa), y una pasada en la que
-- «cambia» media cartera se re-siembra sin avisar (`cambioMasivo`): es un cambio de formato, no 50
-- clientes tocando su póliza el mismo día.
SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.portal_poliza_foto (
  poliza_id      uuid PRIMARY KEY REFERENCES seguros.polizas(id) ON DELETE CASCADE,
  correduria_id  uuid NOT NULL,
  -- `FotoPoliza` (lleva su versión `v`): estado agrupado, fechas, prima, forma de pago, coberturas,
  -- ids de documentos visibles y siniestros. Ni un dato personal: importes y fechas de la póliza.
  foto           jsonb NOT NULL,
  actualizada_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seguros.portal_poliza_cambio (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL,
  poliza_id     uuid NOT NULL REFERENCES seguros.polizas(id) ON DELETE CASCADE,
  -- El TOMADOR en el momento del cambio: a quién se avisa.
  cliente_id    uuid NOT NULL REFERENCES seguros.clientes(id) ON DELETE CASCADE,
  -- `CAMPOS_CAMBIO_POLIZA`: qué cambió, nunca el valor.
  campos        text[] NOT NULL CHECK (cardinality(campos) > 0),
  -- Grupo de estado nuevo (`grupoEstado`) cuando el estado es uno de los cambios.
  estado_nuevo  text,
  detectado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_poliza_cambio_cliente
  ON seguros.portal_poliza_cambio (cliente_id, detectado_en DESC);

-- Escribe el detector (asegura, `prisma_seguros`); la campana del portal solo lee los cambios.
GRANT SELECT, INSERT, UPDATE ON seguros.portal_poliza_foto TO prisma_seguros;
GRANT SELECT, INSERT ON seguros.portal_poliza_cambio TO prisma_seguros;
GRANT SELECT ON seguros.portal_poliza_cambio TO prisma_asegura_portal;

-- Los privilegios por defecto del schema dan DML al CRM de Manuel en cada tabla nueva; no la toca.
REVOKE ALL ON seguros.portal_poliza_foto FROM crm_seguros;
REVOKE ALL ON seguros.portal_poliza_cambio FROM crm_seguros;
