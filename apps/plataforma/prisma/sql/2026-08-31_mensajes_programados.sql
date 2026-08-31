-- ────────────────────────────────────────────────────────────────────────────
-- Mensajes PROGRAMADOS a huéspedes (31/08/2026) — sustituto de los automáticos
-- de Smoobu, en modo sombra hasta que se active piso a piso.
--
-- Diseño decidido con Alberto (31/08/2026, sesión de análisis sobre 8 hilos
-- reales): los automáticos de Smoobu salen siempre en español, prometen un
-- parking que ya no existe (San Juan de la Palma), duplican envíos en reservas
-- de última hora y esconden la información crítica detrás de un enlace. El
-- orquestador propio (cron `/api/sivra/mensajes/programados`) los reemplaza
-- con plantillas deterministas cuya fuente de verdad vive en nuestro repo/BD.
-- ────────────────────────────────────────────────────────────────────────────

-- Registro + dedupe de cada mensaje del ciclo de una reserva. La UNIQUE es la
-- idempotencia: un hito (booking, tipo, fecha objetivo) se emite UNA vez, y si
-- una modificación mueve la llegada, la fecha nueva crea una clave nueva (los
-- hitos de la fecha vieja quedan como histórico, no se borran).
-- `estado`: 'sombra' (registrado y avisado por Telegram, NO enviado al huésped)
--           'enviado' (salió por Smoobu) · 'fallo' (se reintenta, ver `intentos`).
CREATE TABLE IF NOT EXISTS mensajes_programados (
  id             bigserial PRIMARY KEY,
  booking_id     text NOT NULL,
  property_id    text NOT NULL,
  tipo           text NOT NULL,
  fecha_objetivo date NOT NULL,
  idioma         text NOT NULL DEFAULT 'es',
  estado         text NOT NULL,
  cuerpo         text NOT NULL DEFAULT '',
  intentos       int  NOT NULL DEFAULT 0,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  enviado_at     timestamptz,
  UNIQUE (booking_id, tipo, fecha_objetivo)
);

CREATE INDEX IF NOT EXISTS mensajes_programados_fallo_idx
  ON mensajes_programados (estado) WHERE estado = 'fallo';

-- Activación POR PISO. Fila ausente o activo=false ⇒ MODO SOMBRA (conservador:
-- un piso nuevo jamás envía nada a un huésped hasta que Alberto lo active).
-- Activar: INSERT/UPDATE a mano (Supabase MCP) cuando la sombra esté validada.
CREATE TABLE IF NOT EXISTS mensajes_prog_pisos (
  property_id text PRIMARY KEY,
  activo      boolean NOT NULL DEFAULT false,
  desde       timestamptz NOT NULL DEFAULT now()
);

-- Códigos de acceso ROTABLES por piso. Viven en BD (no en el repo) para poder
-- rotarlos sin redeploy — p. ej. tras una cancelación posterior al envío de la
-- víspera, que deja el código expuesto a alguien que ya no viene.
-- NULL = «no consta» y la plantilla lo DECLARA («te lo confirmamos hoy mismo»),
-- jamás lo inventa (regla raíz: dato que no hay ≠ dato que no se ha mirado).
-- 🚨 La SEMILLA de valores se hace por Supabase MCP, NUNCA en este archivo:
-- los códigos reales no entran en el repo.
CREATE TABLE IF NOT EXISTS sivra_codigos_acceso (
  property_id   text PRIMARY KEY,
  codigo_portal text,
  codigo_caja   text,
  wifi_ssid     text,
  wifi_password text,
  notas         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 🚨 LANDMINE — una tabla NUEVA en `public` nace abierta a `anon`/`authenticated`
-- por los privilegios por defecto del schema (comprobado el 20/08/2026 con
-- ses_establecimientos). En `sivra_codigos_acceso` viven códigos de puertas
-- reales; en las otras dos, el ciclo de mensajes de cada huésped. Ninguna app
-- salvo plataforma las toca.
REVOKE ALL ON mensajes_programados  FROM anon, authenticated;
REVOKE ALL ON mensajes_prog_pisos   FROM anon, authenticated;
REVOKE ALL ON sivra_codigos_acceso  FROM anon, authenticated;
REVOKE ALL ON mensajes_programados  FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;
REVOKE ALL ON mensajes_prog_pisos   FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;
REVOKE ALL ON sivra_codigos_acceso  FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte;
