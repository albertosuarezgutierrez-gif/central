-- ────────────────────────────────────────────────────────────────────────────
-- SIVRA · ÓRDENES A LA LIMPIEZA (01/09/2026)
--
-- POR QUÉ EXISTE ESTA TABLA Y NO SE REUTILIZA `sivra_extras_reserva`.
-- El ciclo de extras (oferta → enlace Stripe → cobro → aviso) solo avisa a la
-- limpieza cuando Stripe confirma el pago. Un huésped que paga por FUERA de ese
-- raíl —Bizum, efectivo, o porque el extra sencillamente se regala— se queda sin
-- que nadie monte nada: pasó el 01/09/2026 con la reserva 152490601 (cuna pagada
-- por Bizum, `estado` congelado en 'ofrecido', limpieza sin enterarse).
--
-- Alberto dictó ese día que la orden NO lleva estado de cobro: «no quede fija,
-- pagado ni confirmar ni nada, sino simplemente como una orden». Así que aquí no
-- hay importe, ni `pagado`, ni máquina de estados. Solo: qué se pidió, para qué
-- reserva, y si el email SALIÓ.
--
-- 🚨 TRES ESTADOS, NO DOS (regla global del CLAUDE.md raíz):
--   `enviado_at` con fecha  → la limpieza lo recibió.
--   `enviado_at` NULL + `error` → se intentó y NO salió. La cuna sigue sin montar.
--   sin fila                → nadie ha pedido nada para esa reserva.
-- Pintar la segunda como si fuera la primera es exactamente el fallo que esta
-- tabla existe para evitar.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sivra_ordenes_limpieza (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   text NOT NULL,
  property_id  text NOT NULL,

  -- Código del catálogo de extras si la orden nació de uno (`cuna_trona`…). NULL
  -- cuando es una orden suelta. Es informativo: no ata la orden a ningún cobro.
  codigo       text,

  -- Lo que se le pidió a la limpieza, TAL CUAL salió en el email. Se guarda el
  -- texto y no una referencia al catálogo porque el catálogo puede cambiar
  -- después y lo que hay que poder auditar es lo que se ordenó ese día.
  instruccion  text NOT NULL,

  enviado_at   timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_limpieza_booking ON sivra_ordenes_limpieza (booking_id);

-- Una tabla nueva en `public` NACE ABIERTA a `anon`/`authenticated` por los
-- privilegios por defecto del schema, y esta BD la comparten sivra, ialimp,
-- plataforma y el resto de verticales. Aquí hay nombres de huéspedes y fechas de
-- estancia: se cierra en la misma migración que la crea (landmine #12 de
-- `sivra-maestro`, patrón de `2026-08-20_ses_establecimientos.sql`).
REVOKE ALL ON sivra_ordenes_limpieza FROM anon, authenticated;
REVOKE ALL ON sivra_ordenes_limpieza FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;
