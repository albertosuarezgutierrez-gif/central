-- Operaciones intercompany (casa de marcas / holding).
--
-- ⚠️ MIGRACIÓN NO APLICADA TODAVÍA — documentada para revisión de Alberto.
-- La BD `wswbehlcuxqxyinousql` (schema `public`) está COMPARTIDA con sivra + ialimp
-- (cliente vivo). NO aplicar a producción sin revisión: ejecutar a mano cuando Alberto
-- lo apruebe. El código (`lib/intercompany.ts`) tolera que la tabla NO exista todavía
-- (cae a "sin operaciones" → el consolidado coincide con la suma bruta de hoy, sin
-- cambiar ningún número del dashboard actual).
--
-- Modela las operaciones que una sociedad del holding factura a OTRA sociedad del mismo
-- holding (cocina central → restaurante, flota → catering, alquiler de materiales →
-- eventos…). En el consolidado del grupo estas operaciones se ELIMINAN: el mismo dinero
-- es ingreso en la sociedad emisora y gasto en la receptora → a nivel grupo el neto es 0,
-- pero sin eliminar infla ingresos y gastos por igual (doble conteo).
--
-- Scope multi-tenant: SIEMPRE por `cuenta_id` (regla de plataforma). Las sociedades
-- referenciadas son filas de `sociedades` (FK `cuenta_id`). El módulo puro
-- `@central/module-intercompany` solo elimina una operación si AMBOS extremos pertenecen
-- al holding cargado; un destino/origen externo es ingreso/gasto real y NO se elimina.

CREATE TABLE IF NOT EXISTS operaciones_intercompany (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id           uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  sociedad_origen_id  uuid NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE, -- factura / vende (INGRESO)
  sociedad_destino_id uuid NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE, -- recibe / compra (GASTO)
  importe             numeric(14,2) NOT NULL,        -- base sin IVA
  concepto            text,
  fecha               date,
  tipo                text,                          -- 'cocina' | 'flota' | 'materiales' | …
  parent_id           text,                          -- Encargo que la origina (trazabilidad)
  parent_type         text,                          -- 'porte' | 'alquiler' | 'lote_cocina' | 'evento' | …
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operaciones_ic_cuenta_fecha
  ON operaciones_intercompany (cuenta_id, fecha);
