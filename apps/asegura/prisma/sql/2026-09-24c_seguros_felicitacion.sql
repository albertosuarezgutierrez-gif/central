-- Felicitación de cumpleaños (24/09/2026, Alberto: «felicitar por mail y app los cumpleaños»).
-- Una fila por persona y año: es el SELLO (el cron no repite) y lo que la campana del portal lee
-- para decir «¡Feliz cumpleaños!» ese día. La escribe solo el cron de asegura, que es quien puede
-- descifrar la fecha de nacimiento. `canal`: 'correo' si salió el correo; 'solo_app' si no había a
-- dónde escribir (o el envío falló) y solo se felicita en el portal.
-- Aplicada como migración `seguros_felicitacion`; los 3 CHECK/UNIQUE vistos morder en un bloque revertido.
CREATE TABLE IF NOT EXISTS seguros.felicitacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id    uuid NOT NULL REFERENCES seguros.clientes (id),
  anio          smallint NOT NULL,
  dia           date NOT NULL,
  canal         text NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT felicitacion_una_por_anio UNIQUE (cliente_id, anio),
  CONSTRAINT felicitacion_anio_del_dia CHECK (anio = extract(year FROM dia)),
  CONSTRAINT felicitacion_canal CHECK (canal IN ('correo', 'solo_app'))
);
CREATE INDEX IF NOT EXISTS idx_felicitacion_dia ON seguros.felicitacion (dia);
-- Los privilegios por defecto del schema se la darían al CRM de Manuel.
REVOKE ALL ON seguros.felicitacion FROM crm_seguros;
REVOKE ALL ON seguros.felicitacion FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.felicitacion TO prisma_seguros;
GRANT UPDATE (canal) ON seguros.felicitacion TO prisma_seguros;
GRANT SELECT (id, cliente_id, dia) ON seguros.felicitacion TO prisma_asegura_portal;
