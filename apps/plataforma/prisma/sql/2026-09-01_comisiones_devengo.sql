-- Libro de comisiones de la correduría: una fila por (cuenta, compañía, periodo).
-- Tres ejes: lo DEVENGADO (recibos cobrados), lo LIQUIDADO (extracto de la
-- compañía) y lo COBRADO (BBVA). El agregado anual de bruto y retención es lo
-- que va a la asesoría y se contrasta contra el borrador de la AEAT.
--
-- 🚨 Los tres importes son NULLABLE a propósito: NULL = no ha llegado, 0 =
-- comprobado y es cero. Colapsarlos convertiría «Mapfre no me ha liquidado» en
-- «Mapfre me liquidó 0 €», que es la afirmación falsa que este libro evita.
CREATE TABLE IF NOT EXISTS comisiones_devengo (
  cuenta_id        UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  -- La CLAVE es el código DGS ('C0109'), no el nombre: el nombre comercial
  -- cambia (Catalana Occidente → Occident) y el código no.
  compania_codigo  TEXT NOT NULL,
  compania         TEXT NOT NULL,
  -- Fechas REALES, no 'YYYY-MM': CIMA trae periodos como 31/05 → 01/07 que un
  -- 'YYYY-MM' destruiría (error de la tabla cima_liquidaciones que esto retira).
  periodo_inicio   DATE NOT NULL,
  periodo_fin      DATE NOT NULL,

  -- Eje 1 — DEVENGADO: comisión de los recibos que pasaron a cobrado.
  esperado_bruto        NUMERIC(12,2),
  esperado_recibos      INTEGER,

  -- Eje 2 — LIQUIDADO: lo que la compañía reconoce. La remesa que llega al
  -- banco es bruto − retención (IRPF 15 %, que la cía declara en el modelo 190).
  liq_bruto             NUMERIC(12,2),
  liq_retencion         NUMERIC(12,2),
  liq_remesa            NUMERIC(12,2),
  liq_origen            TEXT,          -- 'cima' | 'pdf' | 'manual'
  liq_hash              TEXT,          -- eiac_xml_hash / hash del PDF: idempotencia
  liq_email_message_id  TEXT,
  liq_confirmado_at     TIMESTAMPTZ,   -- solo si liq_origen = 'manual'

  -- Eje 3 — COBRADO: el ingreso en el BBVA.
  banco_total           NUMERIC(12,2),
  banco_movimiento_ids  UUID[],

  -- false = alguna fuente no se pudo leer. Distingue «no lo sé» de «no hay»:
  -- sin esto, una caída de red se pintaría como «la compañía no te ha pagado».
  leido_ok         BOOLEAN NOT NULL DEFAULT true,
  actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (cuenta_id, compania_codigo, periodo_inicio, periodo_fin)
);

CREATE INDEX IF NOT EXISTS idx_comisiones_devengo_periodo
  ON comisiones_devengo (cuenta_id, periodo_inicio);

-- Qué fuente cubre a cada compañía y desde cuándo. Sin esta tabla el total
-- anual parecería completo estando ciego a Generali, que hoy no tiene ninguna
-- fuente de importe. «Sin cobertura» es una GESTIÓN pendiente, no un dato que
-- esté por llegar — y son cosas distintas para quien las lee.
CREATE TABLE IF NOT EXISTS comisiones_cobertura (
  cuenta_id            UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  compania_codigo      TEXT NOT NULL,
  compania             TEXT NOT NULL,
  tiene_recibos_cima   BOOLEAN NOT NULL DEFAULT false,
  desde_recibos        DATE,
  tiene_liq_cima       BOOLEAN NOT NULL DEFAULT false,
  tiene_correo_importe BOOLEAN NOT NULL DEFAULT false,
  remitente            TEXT,
  nota_gestion         TEXT,
  actualizado_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, compania_codigo)
);

-- El intento anterior de leer CIMA: SOAP contra un endpoint que nunca se validó
-- (404), parser del fichero LIQ adivinado por su propio comentario y códigos de
-- compañía numéricos cuando los reales son C0058/C0109/C0468/C0613. Se retira
-- con su tabla, que nunca llegó a escribirse (0 filas, comprobado 01/09/2026).
DROP TABLE IF EXISTS cima_liquidaciones;
