-- 2026-10-07 — Código de acceso del presupuesto mandado a mano por WhatsApp.
--
-- Hasta hoy el presupuesto se abría y se firmaba con un código que va SOLO al correo, y sin correo
-- en la ficha no había puerta. Al generar el enlace `whatsapp_enlace` asegura genera además un
-- código de 6 dígitos propio de ESE presupuesto, que viaja en el mismo WhatsApp:
--
--   · `whatsapp_codigo_hash`: SHA-256 de "presupuesto-whatsapp:<token>:<código>"
--     (`hashCodigoWhatsapp` de @central/module-seguros-portal). Atado al token del enlace, que no se
--     guarda en claro: quien lea esta columna no saca los 6 dígitos con un bucle, el código de otro
--     presupuesto no abre este, y regenerar el enlace (token nuevo) lo invalida. NULL = este enlace
--     no salió por WhatsApp (o se avisó después por correo): no hay código.
--   · `whatsapp_codigo_intentos`: fallos SEGUIDOS. Se reserva el intento ANTES de comparar; con 5
--     (`MAX_INTENTOS`) se bloquea. Un acierto lo pone a cero. Vale hasta `vence_el`.
--
-- Lo lee y lo escribe SOLO `apps/asegura` (rol `prisma_seguros`). El portal NO recibe GRANT sobre
-- estas columnas ni las declara en su schema: comprueba el código por el puente.
--
-- 🚨 Orden de despliegue: aplicar ANTES de desplegar `apps/asegura` (su schema Prisma ya declara las
-- columnas; sin ellas, toda lectura del modelo `Presupuesto` revienta con 42703).
--
-- ADITIVA. Reversible: DROP de las dos columnas y del CHECK.

ALTER TABLE seguros.presupuesto
  ADD COLUMN IF NOT EXISTS whatsapp_codigo_hash     text,
  ADD COLUMN IF NOT EXISTS whatsapp_codigo_intentos smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_whatsapp_codigo_hash_forma
    CHECK (whatsapp_codigo_hash IS NULL OR whatsapp_codigo_hash ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN seguros.presupuesto.whatsapp_codigo_hash IS
  'Hash del código de acceso enviado por WhatsApp, atado al token del enlace. NULL = sin código.';
COMMENT ON COLUMN seguros.presupuesto.whatsapp_codigo_intentos IS
  'Fallos seguidos del código de WhatsApp (tope 5). Un acierto lo pone a 0.';
