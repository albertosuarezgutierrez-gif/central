-- ────────────────────────────────────────────────────────────────────────────
-- SIVRA · EXTRAS COBRADOS AL HUÉSPED (28/08/2026)
--
-- El agente de huéspedes ya sabía responder «la cuna son 20€», pero ahí se
-- acababa: no había forma de cobrarlo ni de que nadie montara la cuna. Estas dos
-- tablas cierran el ciclo oferta → cobro → aviso a la limpieza.
--
-- 🚨 POR QUÉ EL PRECIO VIVE AQUÍ Y NO EN LA GUÍA DEL PISO. Hasta hoy los 20€
-- estaban sueltos en la guía / en `mensajes_hechos`, es decir, en texto libre que
-- lee un LLM. Nada impedía que la guía dijera un precio y se cobrara otro. El
-- catálogo es la ÚNICA fuente del importe: el borrador que lleve una cifra que no
-- esté aquí escala a Alberto en vez de enviarse.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sivra_extras_catalogo (
  codigo                text PRIMARY KEY,
  nombre_es             text NOT NULL,
  nombre_en             text NOT NULL,
  nombre_fr             text NOT NULL,
  nombre_de             text NOT NULL,
  nombre_it             text NOT NULL,
  precio_cents          integer NOT NULL CHECK (precio_cents > 0),
  unidad                text NOT NULL DEFAULT 'estancia',

  -- Dictado por Alberto el 28/08/2026: estos extras van SIN IVA. Es un campo y no
  -- una constante para que cambiar el criterio sea editar una fila, no desplegar.
  iva_pct               numeric(5,2) NOT NULL DEFAULT 0,

  -- NULL = aplica a todos los pisos. Un array = solo a esos.
  property_ids          text[],

  -- Qué tiene que hacer la limpieza cuando el extra se paga. Va al email tal cual.
  instruccion_limpieza  text,
  avisa_limpieza        boolean NOT NULL DEFAULT true,

  activo                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Estado del extra POR RESERVA.
--
-- 🚨 TRES ESTADOS, NO DOS (regla global del CLAUDE.md raíz). `aviso_limpieza_at`
-- a NULL significa «todavía no se ha avisado», JAMÁS «no hacía falta avisar». Si
-- el email falla se guarda el motivo en `aviso_limpieza_error` y salta un aviso por
-- Telegram: un extra pagado con la cuna sin montar y nadie enterado es exactamente
-- el fallo caro que persigue el repo.
CREATE TABLE IF NOT EXISTS sivra_extras_reserva (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            text NOT NULL,
  property_id           text NOT NULL,
  codigo                text NOT NULL REFERENCES sivra_extras_catalogo(codigo),

  -- Copiado del catálogo AL OFERTAR: el catálogo puede cambiar después y lo que se
  -- prometió al huésped es lo que se cobra.
  precio_cents          integer NOT NULL,

  estado                text NOT NULL DEFAULT 'ofrecido'
                          CHECK (estado IN ('ofrecido','enlace_enviado','pagado','caducado','cancelado','reembolsado')),

  stripe_payment_link_id   text,
  stripe_payment_intent_id text,

  ofrecido_at           timestamptz NOT NULL DEFAULT now(),
  enlace_enviado_at     timestamptz,
  recordatorio_at       timestamptz,
  pagado_at             timestamptz,
  aviso_limpieza_at     timestamptz,
  aviso_limpieza_error  text,
  caducado_at           timestamptz
);

-- Un extra por reserva y código: el ✅ de Telegram puede dispararse dos veces
-- (propuesta duplicada) y no queremos dos cunas ni dos cobros.
CREATE UNIQUE INDEX IF NOT EXISTS sivra_extras_reserva_uniq
  ON sivra_extras_reserva (booking_id, codigo);

-- Idempotencia del webhook de Stripe: el mismo payment_intent no se procesa dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS sivra_extras_reserva_pi_uniq
  ON sivra_extras_reserva (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sivra_extras_reserva_estado_idx
  ON sivra_extras_reserva (estado);

-- 🚨 LANDMINE — una tabla NUEVA en `public` nace abierta a `anon` y `authenticated`
-- por los privilegios por defecto del schema, y `anon` es la clave que apps/ialimp usa
-- EN EL NAVEGADOR. Aquí hay identificadores de cobro de Stripe y datos de reservas de
-- huéspedes: se retiran explícitamente, en la misma migración que crea las tablas.
REVOKE ALL ON sivra_extras_catalogo   FROM anon, authenticated;
REVOKE ALL ON sivra_extras_reserva    FROM anon, authenticated;

-- Y por lo mismo, los roles de las otras verticales: ninguna toca estas tablas (la
-- única app que las lee es plataforma).
REVOKE ALL ON sivra_extras_catalogo FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;
REVOKE ALL ON sivra_extras_reserva  FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;

-- El único extra del día 1. Cuna y trona van JUNTAS y por estancia (dictado de
-- Alberto): son el mismo caso de uso —familia con bebé— y el mismo viaje de la
-- limpieza al trastero. Mismo precio en los cuatro pisos → property_ids NULL.
INSERT INTO sivra_extras_catalogo
  (codigo, nombre_es, nombre_en, nombre_fr, nombre_de, nombre_it, precio_cents, unidad, iva_pct, instruccion_limpieza)
VALUES
  ('cuna_trona',
   'Cuna y trona', 'Cot and high chair', 'Lit bébé et chaise haute', 'Kinderbett und Hochstuhl', 'Culla e seggiolone',
   2000, 'estancia', 0,
   'Montar la cuna y sacar la trona antes de la entrada, y recogerlas en la salida.')
ON CONFLICT (codigo) DO NOTHING;
