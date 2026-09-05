-- La HOJA de la nevera y su QR (05/09/2026).
--
-- Alberto: «crear QR y ahí seleccionas si todas las pólizas, una o algunas… y
-- luego se crea el QR», con «el qr se puede borrar y se anularía el acceso».
--
-- Lee la cabecera de packages/module-seguros-portal/src/hoja-qr.ts antes de
-- tocar nada: aquí solo está la forma, las reglas están allí.
--
-- 🚨 Lo que esta DDL sostiene y el código no puede garantizar solo:
--
--   1. El TOKEN NO SE GUARDA. Solo su hash (SHA-256 con la pimienta del portal,
--      el mismo hashCanal). Una tabla de QR con sus enlaces legibles es una
--      tabla de llaves — y esta la puede leer cualquier consulta que se cuele.
--
--   2. ANULAR NO BORRA: al rol NO se le da DELETE. La fila anulada es lo único
--      que permite decirle a quien tiene el papel viejo «esto ya no vale» en
--      vez de «esto no existe», y la fecha es la prueba de cuándo dejó de dar
--      acceso.
--
--   3. La selección apunta a UNA póliza de la cartera O a UNA aportada, nunca a
--      las dos ni a ninguna (CHECK). Desde que las dos viven en la misma lista
--      del portal, una hoja puede llevar de los dos tipos.
--
--   4. `todas` es la AUSENCIA de filas en portal_hoja_qr_poliza, igual que
--      portal_autorizacion.poliza_id NULL. Incluye las pólizas futuras, y eso
--      la pantalla tiene que decirlo al crear.

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_hoja_qr (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id  uuid NOT NULL REFERENCES seguros.portal_identidad (id) ON DELETE CASCADE,
  -- El hash del token, nunca el token. 64 hex de SHA-256.
  token_hash    text NOT NULL UNIQUE,
  -- Para distinguir unas de otras («Coche de Pilar»). Opcional: la fecha y el
  -- contenido ya las identifican.
  nombre        text,
  creada_en     timestamptz NOT NULL DEFAULT now(),
  -- NULL = viva. Con fecha = anulada (punto 2).
  anulada_en    timestamptz,
  -- Para que su dueño sepa si alguien la ha llegado a escanear. NULL = nunca.
  ultimo_uso_en timestamptz,
  CONSTRAINT portal_hoja_qr_token_hex CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT portal_hoja_qr_nombre_corto CHECK (nombre IS NULL OR char_length(nombre) <= 60)
);

CREATE INDEX IF NOT EXISTS portal_hoja_qr_identidad_idx
  ON seguros.portal_hoja_qr (identidad_id, creada_en DESC);

CREATE TABLE IF NOT EXISTS seguros.portal_hoja_qr_poliza (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id               uuid NOT NULL REFERENCES seguros.portal_hoja_qr (id) ON DELETE CASCADE,
  -- Una de las dos, nunca las dos ni ninguna (punto 3).
  poliza_id             uuid REFERENCES seguros.polizas (id) ON DELETE CASCADE,
  poliza_declarada_id   uuid REFERENCES seguros.portal_poliza_declarada (id) ON DELETE CASCADE,
  CONSTRAINT portal_hoja_qr_poliza_una_sola CHECK (num_nonnulls(poliza_id, poliza_declarada_id) = 1)
);

-- La misma póliza no puede entrar dos veces en la misma hoja. Dos índices
-- parciales y no uno compuesto: en Postgres dos NULL nunca son iguales, así que
-- un UNIQUE (hoja_id, poliza_id, poliza_declarada_id) dejaría duplicar
-- libremente — la misma trampa que ya mordió en portal_autorizacion el 04/09.
CREATE UNIQUE INDEX IF NOT EXISTS portal_hoja_qr_poliza_unica
  ON seguros.portal_hoja_qr_poliza (hoja_id, poliza_id)
  WHERE poliza_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS portal_hoja_qr_declarada_unica
  ON seguros.portal_hoja_qr_poliza (hoja_id, poliza_declarada_id)
  WHERE poliza_declarada_id IS NOT NULL;

-- 🚨 SIN DELETE, a propósito (punto 2). El UPDATE se concede solo sobre las dos
-- columnas que el portal escribe después de crear la fila: anular y sellar el
-- último uso. No puede reescribir la selección ni el token de una hoja ya hecha.
GRANT SELECT, INSERT ON seguros.portal_hoja_qr TO prisma_asegura_portal;
GRANT UPDATE (anulada_en, ultimo_uso_en) ON seguros.portal_hoja_qr TO prisma_asegura_portal;
-- Tampoco DELETE aquí: la selección se escribe UNA vez, al crear la hoja. Si se
-- pudiera reescribir, un QR ya impreso pasaría a enseñar otras pólizas sin que
-- cambiara ni el papel ni el enlace — que es la definición de una hoja que
-- miente. Para cambiar lo que enseña se anula y se crea otro.
GRANT SELECT, INSERT ON seguros.portal_hoja_qr_poliza TO prisma_asegura_portal;

COMMIT;
