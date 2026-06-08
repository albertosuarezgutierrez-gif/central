-- Catálogo de tarifas (precios y tiempos por piso/servicio) + partes de trabajo
-- (registro de qué hizo cada limpiadora) → base para las nóminas por quincena.
-- Multi-tenant: TODO scopeado por empresa_id.

-- ─── CATÁLOGO DE TARIFAS ──────────────────────────────────────────
-- "La base de datos de donde sale los precios y tiempos de cada piso".
-- categoria: 'piso' (limpieza de un piso) | 'pc' (filas «PC …» del CSV de
-- Sique Brilla, pendientes de confirmar su significado) | 'servicio'
-- (concepto suelto: limpieza profunda, hora extra, repaso, desplazamiento…).
-- precio          = lo que se le paga a la limpiadora por ese concepto.
-- precio_cliente  = (opcional) lo que se le cobra al cliente.
CREATE TABLE IF NOT EXISTS catalogo_tarifas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL,
  nombre         TEXT NOT NULL,
  categoria      TEXT NOT NULL DEFAULT 'piso',   -- 'piso' | 'pc' | 'servicio'
  tiempo_min     INTEGER,                        -- tiempo presupuestado (minutos)
  precio         NUMERIC(10,2),                  -- pago a la limpiadora
  precio_cliente NUMERIC(10,2),                  -- (opcional) precio al cliente
  propiedad_id   UUID REFERENCES propiedades(id) ON DELETE SET NULL,
  activo         BOOLEAN NOT NULL DEFAULT true,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalogo_tarifas_empresa_nombre
  ON catalogo_tarifas (empresa_id, lower(nombre));
CREATE INDEX IF NOT EXISTS ix_catalogo_tarifas_empresa
  ON catalogo_tarifas (empresa_id, activo);

-- ─── PARTES DE TRABAJO ────────────────────────────────────────────
-- "Donde queda guardado las limpiezas que hizo cada limpiador" para hacer la
-- nómina. Cada parte = una limpiadora hizo un concepto un día. Puede venir de
-- una sesión real (session_id) o ser manual (ej. limpieza profunda puntual de
-- 5 h de un cliente que no se factura, solo se contabiliza a la limpiadora).
-- concepto / tiempo_min / importe son SNAPSHOTS (editables) para que cambiar
-- el catálogo no altere nóminas ya registradas.
CREATE TABLE IF NOT EXISTS partes_trabajo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL,
  limpiadora_id  UUID NOT NULL REFERENCES limpiadoras(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL,
  catalogo_id    UUID REFERENCES catalogo_tarifas(id) ON DELETE SET NULL,
  session_id     UUID REFERENCES cleaning_sessions(id) ON DELETE SET NULL,
  concepto       TEXT NOT NULL,
  tiempo_min     INTEGER,
  importe        NUMERIC(10,2) NOT NULL DEFAULT 0,   -- pago a la limpiadora (por unidad)
  cantidad       NUMERIC(6,2)  NOT NULL DEFAULT 1,   -- ej. horas extra ×3
  notas          TEXT,
  origen         TEXT NOT NULL DEFAULT 'manual',     -- 'manual' | 'sesion'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_partes_empresa_fecha   ON partes_trabajo (empresa_id, fecha);
CREATE INDEX IF NOT EXISTS ix_partes_limpiadora_fecha ON partes_trabajo (limpiadora_id, fecha);
-- una sola entrada por sesión (idempotencia al importar de sesiones completadas)
CREATE UNIQUE INDEX IF NOT EXISTS ux_partes_session
  ON partes_trabajo (session_id) WHERE session_id IS NOT NULL;
