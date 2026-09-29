-- 2026-09-29d — El cliente pide desde el portal cambiar la cuenta de domiciliación de sus recibos.
--
-- Por qué una tabla y no escribir la ficha directamente: la cuenta que carga la compañía NO la
-- cambiamos nosotros (CIMA solo trae datos). Alberto tiene que cambiarla en cada compañía, y hasta
-- que lo haga los recibos siguen yendo a la vieja. La solicitud queda PENDIENTE en la cola de «Hoy»
-- con el IBAN cifrado; al marcarla hecha se copia a `clientes.cuenta_bancaria`.
--
-- El IBAN va cifrado (`v1:` de module-seguros-pii) y la máscara aparte, para listar sin descifrar.

CREATE TABLE IF NOT EXISTS seguros.cambio_cuenta_solicitud (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias(id),
  cliente_id      uuid NOT NULL REFERENCES seguros.clientes(id),
  identidad_id    text NOT NULL,
  iban_cifrado    text NOT NULL,
  mascara         text NOT NULL,
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecha', 'descartada')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resuelta_at     timestamptz,
  resuelta_por    text,
  nota            text
);

-- Una sola pendiente por cliente: si vuelve a pedirlo, la nueva sustituye a la anterior (la app
-- descarta la vieja en la misma transacción).
CREATE UNIQUE INDEX IF NOT EXISTS cambio_cuenta_pendiente
  ON seguros.cambio_cuenta_solicitud (correduria_id, cliente_id) WHERE estado = 'pendiente';

ALTER TABLE seguros.cambio_cuenta_solicitud ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON seguros.cambio_cuenta_solicitud TO prisma_seguros;
